-- Golv-telemetri: verktygshändelser från agenternas Claude Code-hooks.
-- OBS: redan applicerad i prod via MCP 2026-08-23 — filen är repospegeln.
create table if not exists public.mc_agent_events (
  id bigint generated always as identity primary key,
  agent_id text not null,
  run_id bigint,
  event text not null default 'tool',
  tool text,
  target text,
  created_at timestamptz not null default now()
);
create index if not exists mc_agent_events_agent_idx
  on public.mc_agent_events (agent_id, created_at desc);
create index if not exists mc_agent_events_created_idx
  on public.mc_agent_events (created_at);

alter table public.mc_agent_events enable row level security;
drop policy if exists mc_agent_events_read on public.mc_agent_events;
create policy mc_agent_events_read on public.mc_agent_events
  for select to authenticated using (true);
