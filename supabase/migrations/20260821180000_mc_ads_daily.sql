-- Mission Control: daglig Google Ads-spegel per kundkonto. Fylls av
-- ads-report-jobbet på cron-runnern (nattligt svep över alla konton under
-- MCC:t). MC:s Ads-panel läser härifrån — aldrig direkt mot Ads API.
create table if not exists public.mc_ads_daily (
  id bigint generated always as identity primary key,
  date date not null,
  customer_id text not null,
  customer_name text,
  company_id bigint references public.companies (id),
  cost_micros bigint not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  conversions numeric not null default 0,
  conversions_value numeric not null default 0,
  synced_at timestamptz not null default now(),
  unique (date, customer_id)
);

create index if not exists mc_ads_daily_date_idx
  on public.mc_ads_daily (date desc);

alter table public.mc_ads_daily enable row level security;

create policy "mc_ads_daily_select" on public.mc_ads_daily
  for select to authenticated using (true);
