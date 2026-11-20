-- Records the on-chain anchor of a frozen form's root. Set once; never overwritten.
alter table public.forms
  add constraint forms_anchor_tx_format check (anchor_tx is null or anchor_tx ~ '^0x[0-9a-f]{64}$'),
  add constraint forms_anchor_chain_format check (anchor_chain is null or anchor_chain ~ '^[a-z0-9-]{1,32}$');

create function public.record_anchor(p_form uuid, p_owner uuid, p_chain text, p_tx text)
returns void language plpgsql security definer set search_path = '' as $$
declare f public.forms%rowtype;
begin
  select * into f from public.forms where id = p_form for update;
  if not found or f.owner_id <> p_owner then raise exception 'form_not_found'; end if;
  if f.status not in ('frozen', 'closed') or f.root is null then raise exception 'wrong_status'; end if;
  if f.anchor_tx is not null then raise exception 'already_anchored'; end if;
  update public.forms set anchor_chain = p_chain, anchor_tx = p_tx where id = p_form;
end $$;

revoke all on function public.record_anchor(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_anchor(uuid, uuid, text, text) to service_role;
