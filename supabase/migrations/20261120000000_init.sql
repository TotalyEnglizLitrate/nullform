-- NullForm schema.
-- Anonymity rule: `registrations` (who) and `commitments` (what is in the tree) share no
-- column, have no foreign key between them, and `commitments` has no timestamp.
-- Lifecycle: draft -> registration -> frozen -> closed.
-- "Submissions open" is derived: status = 'frozen' and opens_at <= now() < closes_at.

create table public.forms (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users (id) on delete restrict,
  title         text not null check (char_length(title) between 1 and 200),
  schema        jsonb not null check (pg_column_size(schema) < 100000),
  status        text not null default 'draft'
                check (status in ('draft', 'registration', 'frozen', 'closed')),
  min_group_size int  not null default 20 check (min_group_size >= 1),
  merkle_depth  int  not null default 10 check (merkle_depth between 1 and 32),
  freeze_at     timestamptz,
  opens_at      timestamptz,
  closes_at     timestamptz,
  eligibility   jsonb not null check (pg_column_size(eligibility) < 100000),
  schema_hash   text,
  root          text,
  leaf_count    int,
  anchor_chain  text,
  anchor_tx     text,
  created_at    timestamptz not null default now()
);

create table public.registrations (
  form_id  uuid not null references public.forms (id) on delete cascade,
  user_id  uuid not null references auth.users (id) on delete cascade,
  subject  text not null,
  primary key (form_id, user_id),
  unique (form_id, subject)
);

create table public.form_allowlist (
  form_id uuid not null references public.forms (id) on delete cascade,
  entry   text not null check (entry = lower(btrim(entry)) and entry <> ''),
  primary key (form_id, entry)
);

create table public.commitments (
  form_id    uuid not null references public.forms (id) on delete cascade,
  commitment text not null check (commitment ~ '^[0-9]{1,78}$'),
  primary key (form_id, commitment)
);

create table public.receipts (
  form_id        uuid not null references public.forms (id) on delete cascade,
  nullifier      text not null check (nullifier ~ '^[0-9]{1,78}$'),
  signal         text not null check (signal ~ '^[0-9]{1,78}$'),
  proof          jsonb not null,
  submitted_hour timestamptz not null,
  primary key (form_id, nullifier)
);

create table public.answers (
  form_id   uuid not null,
  nullifier text not null,
  payload   jsonb not null,
  primary key (form_id, nullifier),
  foreign key (form_id, nullifier) references public.receipts (form_id, nullifier) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Privileges: nothing by default, then grant exactly what RLS policies below gate.
-- ---------------------------------------------------------------------------
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;
revoke all on all tables in schema public from anon, authenticated;

-- The server (Vercel functions) uses the service role; make its access explicit.
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;

grant select on public.forms, public.commitments, public.receipts to anon, authenticated;
grant insert, update, delete on public.forms to authenticated;
grant select on public.registrations, public.answers to authenticated;
grant select, insert, delete on public.form_allowlist to authenticated;

alter table public.forms          enable row level security;
alter table public.registrations  enable row level security;
alter table public.form_allowlist enable row level security;
alter table public.commitments    enable row level security;
alter table public.receipts       enable row level security;
alter table public.answers        enable row level security;

-- forms: public read of non-draft rows; the owner reads and edits their own drafts only.
create policy forms_read on public.forms for select
  using (status <> 'draft' or owner_id = (select auth.uid()));

create policy forms_insert on public.forms for insert to authenticated
  with check (
    owner_id = (select auth.uid()) and status = 'draft'
    and schema_hash is null and root is null and leaf_count is null
    and anchor_chain is null and anchor_tx is null
  );

create policy forms_update on public.forms for update to authenticated
  using (owner_id = (select auth.uid()) and status = 'draft')
  with check (
    owner_id = (select auth.uid()) and status = 'draft'
    and schema_hash is null and root is null and leaf_count is null
    and anchor_chain is null and anchor_tx is null
  );

create policy forms_delete on public.forms for delete to authenticated
  using (owner_id = (select auth.uid()) and status = 'draft');

-- registrations: a user sees only their own row.
create policy registrations_read on public.registrations for select to authenticated
  using (user_id = (select auth.uid()));

-- form_allowlist: owner only; writes only until the group is frozen.
create policy allowlist_read on public.form_allowlist for select to authenticated
  using (exists (select 1 from public.forms f
                 where f.id = form_id and f.owner_id = (select auth.uid())));
create policy allowlist_insert on public.form_allowlist for insert to authenticated
  with check (exists (select 1 from public.forms f
                      where f.id = form_id and f.owner_id = (select auth.uid())
                        and f.status in ('draft', 'registration')));
create policy allowlist_delete on public.form_allowlist for delete to authenticated
  using (exists (select 1 from public.forms f
                 where f.id = form_id and f.owner_id = (select auth.uid())
                   and f.status in ('draft', 'registration')));

-- commitments and receipts: public once the form is frozen.
create policy commitments_read on public.commitments for select
  using (exists (select 1 from public.forms f
                 where f.id = form_id and f.status in ('frozen', 'closed')));
create policy receipts_read on public.receipts for select
  using (exists (select 1 from public.forms f
                 where f.id = form_id and f.status in ('frozen', 'closed')));

-- answers: owner only.
create policy answers_read on public.answers for select to authenticated
  using (exists (select 1 from public.forms f
                 where f.id = form_id and f.owner_id = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- Server-side operations. Only the service role can execute these (called from the
-- Vercel functions). Each locks the form row, so registration, freeze and submit
-- serialize per form.
-- ---------------------------------------------------------------------------

create function public.open_registration(p_form uuid, p_owner uuid, p_schema_hash text)
returns void language plpgsql security definer set search_path = '' as $$
declare f public.forms%rowtype;
begin
  select * into f from public.forms where id = p_form for update;
  if not found or f.owner_id <> p_owner then raise exception 'form_not_found'; end if;
  if f.status <> 'draft' then raise exception 'wrong_status'; end if;
  update public.forms set status = 'registration', schema_hash = p_schema_hash where id = p_form;
end $$;

create function public.register_member(p_form uuid, p_user uuid, p_subject text, p_commitment text)
returns void language plpgsql security definer set search_path = '' as $$
declare f public.forms%rowtype;
begin
  select * into f from public.forms where id = p_form for update;
  if not found then raise exception 'form_not_found'; end if;
  if f.status <> 'registration' or (f.freeze_at is not null and now() >= f.freeze_at) then
    raise exception 'registration_closed';
  end if;
  if (select count(*) from public.commitments where form_id = p_form) >= (1::bigint << f.merkle_depth) then
    raise exception 'group_full';
  end if;
  begin
    insert into public.registrations (form_id, user_id, subject) values (p_form, p_user, p_subject);
  exception when unique_violation then raise exception 'already_registered';
  end;
  begin
    insert into public.commitments (form_id, commitment) values (p_form, p_commitment);
  exception when unique_violation then raise exception 'commitment_taken';
  end;
end $$;

-- Step 1 of freezing: flips the status, which blocks any further registration.
create function public.begin_freeze(p_form uuid, p_owner uuid, p_open_delay interval)
returns void language plpgsql security definer set search_path = '' as $$
declare f public.forms%rowtype;
begin
  select * into f from public.forms where id = p_form for update;
  if not found or f.owner_id <> p_owner then raise exception 'form_not_found'; end if;
  if f.status <> 'registration' then raise exception 'wrong_status'; end if;
  if not exists (select 1 from public.commitments where form_id = p_form) then
    raise exception 'empty_group';
  end if;
  update public.forms
     set status = 'frozen',
         opens_at = greatest(coalesce(opens_at, now() + p_open_delay), now())
   where id = p_form;
end $$;

-- Step 2: store the root computed from the (now immutable) leaves. Idempotent until set.
create function public.finalize_freeze(p_form uuid, p_owner uuid, p_root text, p_leaf_count int)
returns void language plpgsql security definer set search_path = '' as $$
declare f public.forms%rowtype;
begin
  select * into f from public.forms where id = p_form for update;
  if not found or f.owner_id <> p_owner then raise exception 'form_not_found'; end if;
  if f.status <> 'frozen' or f.root is not null then raise exception 'wrong_status'; end if;
  if p_leaf_count <> (select count(*) from public.commitments where form_id = p_form) then
    raise exception 'leaf_count_mismatch';
  end if;
  update public.forms set root = p_root, leaf_count = p_leaf_count where id = p_form;
end $$;

create function public.close_form(p_form uuid, p_owner uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare f public.forms%rowtype;
begin
  select * into f from public.forms where id = p_form for update;
  if not found or f.owner_id <> p_owner then raise exception 'form_not_found'; end if;
  if f.status not in ('registration', 'frozen') then raise exception 'wrong_status'; end if;
  update public.forms set status = 'closed', closes_at = now() where id = p_form;
end $$;

-- Writes the receipt and the answers in one transaction. The caller (API) has already
-- verified the proof, the root, the scope and that signal = hash(payload).
create function public.submit_answers(
  p_form uuid, p_nullifier text, p_signal text, p_proof jsonb, p_payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare f public.forms%rowtype;
begin
  select * into f from public.forms where id = p_form for share;
  if not found then raise exception 'form_not_found'; end if;
  if f.status <> 'frozen' or f.root is null
     or f.opens_at is null or now() < f.opens_at
     or (f.closes_at is not null and now() >= f.closes_at) then
    raise exception 'submissions_closed';
  end if;
  begin
    insert into public.receipts (form_id, nullifier, signal, proof, submitted_hour)
    values (p_form, p_nullifier, p_signal, p_proof, date_trunc('hour', now()));
  exception when unique_violation then raise exception 'already_submitted';
  end;
  insert into public.answers (form_id, nullifier, payload) values (p_form, p_nullifier, p_payload);
end $$;

revoke all on function
  public.open_registration(uuid, uuid, text),
  public.register_member(uuid, uuid, text, text),
  public.begin_freeze(uuid, uuid, interval),
  public.finalize_freeze(uuid, uuid, text, int),
  public.close_form(uuid, uuid),
  public.submit_answers(uuid, text, text, jsonb, jsonb)
from public, anon, authenticated;

grant execute on function
  public.open_registration(uuid, uuid, text),
  public.register_member(uuid, uuid, text, text),
  public.begin_freeze(uuid, uuid, interval),
  public.finalize_freeze(uuid, uuid, text, int),
  public.close_form(uuid, uuid),
  public.submit_answers(uuid, text, text, jsonb, jsonb)
to service_role;
