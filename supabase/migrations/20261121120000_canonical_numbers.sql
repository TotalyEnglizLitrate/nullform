-- Numbers kept as text must be in their one canonical spelling (no leading zeros).
-- The proof verifier reads "07" and "7" as the same number, so a nullifier stored with a leading zero would
-- verify yet be a different primary key, letting one member answer twice. The server now rejects such values;
-- this makes the database refuse them too, so no future code path can reintroduce the problem.
alter table public.receipts
  add constraint receipts_nullifier_canonical check (nullifier ~ '^(0|[1-9][0-9]{0,77})$'),
  add constraint receipts_signal_canonical    check (signal    ~ '^(0|[1-9][0-9]{0,77})$');

alter table public.commitments
  add constraint commitments_canonical check (commitment ~ '^[1-9][0-9]{0,77}$');
