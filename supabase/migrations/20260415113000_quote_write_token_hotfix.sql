-- Hotfix: separate write/edit access from public quote viewing
--
-- Problem:
-- - approval_token has been reused as the inline editor write token
-- - public quote links were accessible by id alone
--
-- Fix:
-- - introduce a dedicated write_token for the editor backend
-- - keep approval_token as the public/view token used in quote URLs
-- - backfill existing quotes so regenerated HTML can inject a valid write token

alter table public.quotes
  add column if not exists write_token uuid default gen_random_uuid();

update public.quotes
set write_token = gen_random_uuid()
where write_token is null;

alter table public.quotes
  alter column write_token set not null;

create index if not exists idx_quotes_write_token
  on public.quotes(write_token);
