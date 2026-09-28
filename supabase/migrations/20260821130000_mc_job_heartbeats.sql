-- Mission Control: heartbeats från schemalagda jobb (cron-runner på VPS:en,
-- pg_cron, GitHub Actions). MC:s System-panel läser senaste raden per jobb
-- och larmar rött på failed / gult när ett jobb inte hörts av på >26 h.
create table if not exists public.mc_job_heartbeats (
  id bigint generated always as identity primary key,
  job text not null,
  status text not null check (status in ('ok', 'running', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  message text,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists mc_job_heartbeats_job_started_idx
  on public.mc_job_heartbeats (job, started_at desc);

alter table public.mc_job_heartbeats enable row level security;

-- Läsning för inloggade användare (team-wide-modellen som övriga CRM-tabeller).
-- Inga insert/update-policies: endast service role (mc_heartbeat-funktionen)
-- skriver, så avsändare kan inte förfalskas från klienten.
create policy "mc_job_heartbeats_select" on public.mc_job_heartbeats
  for select to authenticated using (true);
