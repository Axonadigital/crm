-- Web push-prenumerationer för Mission Control (PWA-notiser, chefens spec).
-- OBS: redan applicerad i prod via MCP 2026-08-23 — filen är repospegeln.
create table if not exists public.mc_push_subscriptions (
  id bigint generated always as identity primary key,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_email text,
  created_at timestamptz not null default now()
);

alter table public.mc_push_subscriptions enable row level security;
drop policy if exists mc_push_subscriptions_team on public.mc_push_subscriptions;
create policy mc_push_subscriptions_team on public.mc_push_subscriptions
  for all to authenticated using (true) with check (true);
