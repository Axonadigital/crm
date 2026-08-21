-- Mission Control fas 2: godkännande-inkorgen — ryggraden i agentarbetet.
-- Agenter (edge fns, cron-runner, Claude Code) skapar runs och approvals via
-- mc_submit (service role). Människor löser approvals i MC med fyra verb:
-- accept / edit / respond / ignore. Allt loggas i mc_approval_events.
-- Princip: autonomi på läsningar, människa-i-loopen på ALLA skrivningar.

create table if not exists public.mc_agents (
  id text primary key,
  name text not null,
  function_area text,
  runner text not null default 'cron_runner'
    check (runner in ('edge_fn', 'cron_runner', 'claude_code')),
  enabled boolean not null default true,
  autonomy_level text not null default 'approval'
    check (autonomy_level in ('approval', 'auto')),
  spend_limit_daily_usd numeric,
  created_at timestamptz not null default now()
);

create table if not exists public.mc_runs (
  id bigint generated always as identity primary key,
  agent_id text not null references public.mc_agents (id),
  company_id bigint references public.companies (id),
  status text not null default 'running'
    check (status in ('queued', 'running', 'succeeded', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  cost_usd numeric,
  tokens bigint,
  summary text,
  error text,
  trace_url text
);

create index if not exists mc_runs_agent_started_idx
  on public.mc_runs (agent_id, started_at desc);
create index if not exists mc_runs_started_idx
  on public.mc_runs (started_at desc);

create table if not exists public.mc_approvals (
  id bigint generated always as identity primary key,
  run_id bigint references public.mc_runs (id),
  agent_id text not null references public.mc_agents (id),
  company_id bigint references public.companies (id),
  type text not null,
  title text not null,
  body_md text,
  payload jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'edited', 'responded', 'ignored',
                      'expired', 'applied', 'apply_failed')),
  resolution jsonb,
  resolved_by text,
  resolved_at timestamptz,
  expires_at timestamptz,
  apply_result jsonb,
  created_at timestamptz not null default now()
);

create index if not exists mc_approvals_status_created_idx
  on public.mc_approvals (status, created_at desc);

create table if not exists public.mc_approval_events (
  id bigint generated always as identity primary key,
  approval_id bigint not null references public.mc_approvals (id),
  event text not null,
  actor text not null,
  data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists mc_approval_events_approval_idx
  on public.mc_approval_events (approval_id, created_at);

-- Samlat aktivitetsflöde för MC:s feed-sida.
create or replace view public.mc_activity
  with (security_invoker = on) as
  select
    'run' as kind,
    r.id,
    r.agent_id,
    r.company_id,
    coalesce(r.summary, 'körning') as title,
    r.status,
    coalesce(r.finished_at, r.started_at) as at
  from public.mc_runs r
  union all
  select
    'approval' as kind,
    a.id,
    a.agent_id,
    a.company_id,
    a.title,
    a.status,
    coalesce(a.resolved_at, a.created_at) as at
  from public.mc_approvals a;

-- RLS: team-wide läsning (samma modell som övriga CRM-tabeller).
-- Skrivning endast via service role (mc_submit + MC:s server actions).
alter table public.mc_agents enable row level security;
alter table public.mc_runs enable row level security;
alter table public.mc_approvals enable row level security;
alter table public.mc_approval_events enable row level security;

create policy "mc_agents_select" on public.mc_agents
  for select to authenticated using (true);
create policy "mc_runs_select" on public.mc_runs
  for select to authenticated using (true);
create policy "mc_approvals_select" on public.mc_approvals
  for select to authenticated using (true);
create policy "mc_approval_events_select" on public.mc_approval_events
  for select to authenticated using (true);
