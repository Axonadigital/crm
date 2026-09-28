-- Skills per agent + chatt med enskilda agenter (MC:s Agenter-flik).
-- OBS: redan applicerad i prod via MCP 2026-08-23 — filen är repospegeln.

-- Skills väljs i MC och injiceras i agentens prompt av VPS-runnern.
alter table public.mc_agents add column if not exists skills text[] not null default '{}';
-- Synliga verktyg/kunskapskällor per agent (visas på detaljsidan).
alter table public.mc_agents add column if not exists tools_label text;
alter table public.mc_agents add column if not exists knowledge_label text;

-- En rullande chattråd per agent — samma kömönster som mc_chief_messages:
-- MC skriver user-rader, VPS-cronen (agent-chat.js) svarar.
create table if not exists public.mc_agent_messages (
  id bigint generated always as identity primary key,
  agent_id text not null references public.mc_agents(id) on delete cascade,
  role text not null check (role in ('user','agent')),
  content text not null,
  status text not null default 'pending' check (status in ('pending','working','answered','failed')),
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists mc_agent_messages_agent_idx
  on public.mc_agent_messages (agent_id, created_at);

alter table public.mc_agent_messages enable row level security;
drop policy if exists mc_agent_messages_team on public.mc_agent_messages;
create policy mc_agent_messages_team on public.mc_agent_messages
  for all to authenticated using (true) with check (true);
