-- Usage-mätning (chefens underlag 2026-08-23): varje claude-anrop loggar
-- tokens/kostnad per agent till mc_usage. mc_settings bär manuellt satta
-- referensvärden (t.ex. veckotak avläst från /usage). Additiv migration.
-- Applicerad mot prod 2026-08-23.
create table if not exists public.mc_usage (
  id bigint generated always as identity primary key,
  session_id text,
  agent_id text,
  model text,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cache_creation_tokens bigint not null default 0,
  cache_read_tokens bigint not null default 0,
  cost_estimate numeric,
  duration_ms bigint,
  created_at timestamptz not null default now()
);
create index if not exists mc_usage_created_idx on public.mc_usage (created_at desc);
create index if not exists mc_usage_agent_idx on public.mc_usage (agent_id, created_at desc);

alter table public.mc_usage enable row level security;
drop policy if exists mc_usage_team on public.mc_usage;
create policy mc_usage_team on public.mc_usage
  for all to authenticated using (true) with check (true);

create table if not exists public.mc_settings (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now()
);
alter table public.mc_settings enable row level security;
drop policy if exists mc_settings_team on public.mc_settings;
create policy mc_settings_team on public.mc_settings
  for all to authenticated using (true) with check (true);
