-- Suppressionslista för outreach: adresser som aldrig ska kontaktas igen
-- (opt-out, studs, manuell spärr). Kontrolleras av mc_send_outreach före
-- varje utskick. Additiv migration.
create table if not exists public.mc_outreach_suppressions (
  email text primary key,
  reason text,
  created_at timestamptz not null default now()
);

alter table public.mc_outreach_suppressions enable row level security;
drop policy if exists mc_outreach_suppressions_team on public.mc_outreach_suppressions;
create policy mc_outreach_suppressions_team on public.mc_outreach_suppressions
  for all to authenticated using (true) with check (true);
