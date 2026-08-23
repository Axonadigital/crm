-- Dev-agentens uppdragskö (MC:s självändringar via godkännandeloop).
-- OBS: redan applicerad i prod via MCP 2026-08-23 — filen är repospegeln.
create table if not exists public.mc_dev_requests (
  id bigint generated always as identity primary key,
  instruction text not null,
  status text not null default 'pending'
    check (status in ('pending','working','proposed','failed','done')),
  branch text,
  approval_id bigint,
  preview_url text,
  error text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mc_dev_requests_status_idx
  on public.mc_dev_requests (status, created_at);

alter table public.mc_dev_requests enable row level security;
drop policy if exists mc_dev_requests_team on public.mc_dev_requests;
create policy mc_dev_requests_team on public.mc_dev_requests
  for all to authenticated using (true) with check (true);
