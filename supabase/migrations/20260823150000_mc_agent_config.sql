-- Per-agent-konfiguration styrbar från MC: modellval, egna instruktioner
-- (läggs i agentens prompt) och kan/kan-inte-beskrivning. Additiv.
-- Applicerad mot prod 2026-08-23 (inkl. seed av capabilities_md per agent —
-- fulla seed-texten i prod; se MC:s Agenter-flik).
alter table public.mc_agents add column if not exists model text;
alter table public.mc_agents add column if not exists extra_instructions text;
alter table public.mc_agents add column if not exists capabilities_md text;

update public.mc_agents set model = 'ingen-llm'
  where id in ('finance-watch','mc-applier') and model is null;
