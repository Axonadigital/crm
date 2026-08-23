-- MC 2.0: agentmetadata för Agenter-fliken, chefsagentens meddelandekö och
-- boardroom-mötesförfrågningar. MC läser/pollar; VPS-cron utför (service role).

-- 1) Agentmetadata (visas på Agenter-fliken)
alter table public.mc_agents add column if not exists description text;
alter table public.mc_agents add column if not exists schedule_label text;
alter table public.mc_agents add column if not exists emoji text;

insert into public.mc_agents (id, name, function_area, description, schedule_label, emoji) values
  ('email-triage', 'Mejlagenten', 'email', 'Läser info@-inkorgen, klassar trådar och draftar svar som Gmail-utkast. Skickar aldrig — du godkänner i inkorgen och trycker Skicka i Gmail.', 'var 20:e min, vardagar 07–19', '📬'),
  ('seo-detector', 'SEO-detektorn', 'seo', 'Jämför alla kundsajters snapshots (PageSpeed/GSC) vecka mot vecka och filar försämringar som fynd i inkorgen.', 'måndagar 08:00', '🔍'),
  ('ads-report', 'Ads-rapportören', 'ads', 'Hämtar gårdagens siffror för alla Ads-konton under MCC:t till Ads-panelen och larmar vid spend-spikar.', 'dagligen 04:30', '📊'),
  ('ads-analyst', 'Ads-analytikern', 'ads', 'Analyserar 30 dagars kampanj- och söktermsdata mot playbooken och föreslår konkreta ändringar (negativa sökord, budget, pausar).', 'måndagar 06:30', '🎯'),
  ('mc-applier', 'Utföraren', 'system', 'Verkställer godkända beslut: valv-ändringar, SEO-fixar (PR), mejletiketter, Ads-ändringar samt Svara-omarbetningar.', 'var 10:e min', '⚙️'),
  ('research-sweep', 'Research-teamet', 'research', 'Veckovis omvärldsbevakning av Ads/SEO/AI-nyheter — destillerar till valvets sources/ och flaggar bolagspåverkande fynd.', 'tisdagar 06:30', '📚'),
  ('vault-freshness', 'Valvvakten', 'vault', 'Håller Axona Brain färskt: hittar stale filer och föreslår städning som godkännanden.', 'söndagar 16:45', '🗄️')
on conflict (id) do update set
  name = excluded.name,
  function_area = excluded.function_area,
  description = excluded.description,
  schedule_label = excluded.schedule_label,
  emoji = excluded.emoji;

-- 2) Chefsagentens meddelandekö (fritextrutan i MC)
create table if not exists public.mc_chief_messages (
  id bigint generated always as identity primary key,
  thread_id uuid not null,
  role text not null check (role in ('user', 'chief')),
  content text not null,
  status text not null default 'pending'
    check (status in ('pending', 'working', 'answered', 'failed')),
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists mc_chief_messages_pending_idx
  on public.mc_chief_messages (created_at) where status = 'pending' and role = 'user';
create index if not exists mc_chief_messages_thread_idx
  on public.mc_chief_messages (thread_id, created_at);

alter table public.mc_chief_messages enable row level security;
drop policy if exists mc_chief_messages_team on public.mc_chief_messages;
create policy mc_chief_messages_team on public.mc_chief_messages
  for all to authenticated using (true) with check (true);

-- 3) Boardroom-mötesförfrågningar
create table if not exists public.mc_boardroom_requests (
  id bigint generated always as identity primary key,
  question text not null,
  status text not null default 'pending'
    check (status in ('pending', 'working', 'done', 'failed')),
  minutes_path text,
  error text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mc_boardroom_requests_pending_idx
  on public.mc_boardroom_requests (created_at) where status = 'pending';

alter table public.mc_boardroom_requests enable row level security;
drop policy if exists mc_boardroom_requests_team on public.mc_boardroom_requests;
create policy mc_boardroom_requests_team on public.mc_boardroom_requests
  for all to authenticated using (true) with check (true);
