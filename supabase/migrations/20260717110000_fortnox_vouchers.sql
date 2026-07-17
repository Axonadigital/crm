-- Ekonomi fas 2: verifikations-spegel (bokföring) för korrekta kostnader
-- och NAMNGIVNA abonnemang.
--
-- Varför denna finns när fas 1 redan speglar leverantörsfakturor: bolaget kör
-- KONTANTMETOD. De flesta kostnader är abonnemang som dras direkt från
-- bankkontot (kort/autogiro) och blir aldrig leverantörsfakturor — men de blir
-- alltid VERIFIKATIONER. Verifikationens Description namnger dessutom
-- leverantören ("OPENAI", "CLAUDE.AI SUBSCRIPTION"), vilket är exakt det som
-- gör namngivna abonnemang möjliga.
--
-- Summan intäkter (konto 3xxx) − kostnader (4xxx–8xxx) = Fortnox beräknat
-- resultat. Det ger en inbyggd korrekthetskontroll: stämmer resultatet mot
-- Fortnox vet vi att alla siffror kommit med.
--
-- Verifikationer är immutabla när de bokförts, så synken hämtar bara nya
-- (diffar Fortnox-listan mot vad vi redan speglat).

-- ---------------------------------------------------------------------------
-- Spegeltabeller: verifikationshuvud + rader
-- ---------------------------------------------------------------------------
create table if not exists public.fortnox_vouchers (
  -- Verifikationsnummer återanvänds per räkenskapsår (A1 finns i varje år),
  -- så financial_year måste ingå i nyckeln.
  voucher_series text not null,
  voucher_number bigint not null,
  financial_year integer not null,

  voucher_date date,
  -- Leverantörsnamnet: "OPENAI", "CLAUDE.AI SUBSCRIPTION", "Insättning Rasmus".
  description text,
  reference_number text,
  reference_type text,

  raw jsonb,
  synced_at timestamptz not null default now(),

  primary key (voucher_series, voucher_number, financial_year)
);

comment on table public.fortnox_vouchers is
  'Read-only mirror of Fortnox vouchers (verifikationer), refreshed by fortnox_sync_vouchers. The cost side supplier invoices cannot see: on the cash method most costs are subscriptions booked straight from the bank. Fortnox is the source of truth — never write here from the app.';
comment on column public.fortnox_vouchers.description is
  'Fortnox voucher Description — names the vendor. The basis for named-subscription grouping.';

create table if not exists public.fortnox_voucher_rows (
  voucher_series text not null,
  voucher_number bigint not null,
  financial_year integer not null,
  row_index integer not null,

  -- BAS-kontonummer: 3xxx intäkt, 4–7xxx kostnad (7=löner), 8xxx finansiellt,
  -- 1–2xxx balans (bank/moms/skulder).
  account integer not null,
  account_description text,
  debit numeric(14, 2) not null default 0,
  credit numeric(14, 2) not null default 0,

  primary key (voucher_series, voucher_number, financial_year, row_index),
  foreign key (voucher_series, voucher_number, financial_year)
    references public.fortnox_vouchers (voucher_series, voucher_number, financial_year)
    on delete cascade
);

comment on table public.fortnox_voucher_rows is
  'Individual voucher lines (kontering). Cost = debit − credit on accounts 4000–8999; revenue = credit − debit on 3000–3999. All accounting math lives in the views over this table.';

create index if not exists fortnox_voucher_rows_account_idx
  on public.fortnox_voucher_rows (account);

alter table public.fortnox_vouchers enable row level security;
alter table public.fortnox_voucher_rows enable row level security;

-- Alla inloggade får läsa. Ingen får skriva: synken kör som service role och
-- går förbi RLS.
drop policy if exists "Authenticated users can read fortnox vouchers"
  on public.fortnox_vouchers;
create policy "Authenticated users can read fortnox vouchers"
  on public.fortnox_vouchers
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can read fortnox voucher rows"
  on public.fortnox_voucher_rows;
create policy "Authenticated users can read fortnox voucher rows"
  on public.fortnox_voucher_rows
  for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Resultat per månad — resultatrapporten, direkt ur bokföringen.
-- result = revenue − cost = sum(credit − debit) över konto 3000–8999.
-- Årssumman ska matcha Fortnox beräknat resultat — korrekthetskontrollen.
-- ---------------------------------------------------------------------------
create or replace view public.fortnox_result_monthly
with (security_invoker = true) as
select
  date_trunc('month', v.voucher_date)::date as month,
  coalesce(
    sum(r.credit - r.debit) filter (where r.account between 3000 and 3999), 0
  ) as revenue,
  coalesce(
    sum(r.debit - r.credit) filter (where r.account between 4000 and 8999), 0
  ) as cost,
  coalesce(
    sum(r.credit - r.debit) filter (where r.account between 3000 and 8999), 0
  ) as result
from public.fortnox_vouchers v
join public.fortnox_voucher_rows r
  on r.voucher_series = v.voucher_series
 and r.voucher_number = v.voucher_number
 and r.financial_year = v.financial_year
where v.voucher_date is not null
group by 1;

comment on view public.fortnox_result_monthly is
  'Revenue / cost / result per month straight from the vouchers. Sum(result) over a financial year equals Fortnox beräknat resultat — the built-in correctness check.';

-- ---------------------------------------------------------------------------
-- Kostnad per konto — "vart pengarna tar vägen".
-- ---------------------------------------------------------------------------
create or replace view public.fortnox_cost_by_account
with (security_invoker = true) as
select
  r.account,
  max(r.account_description) as account_description,
  coalesce(sum(r.debit - r.credit), 0) as cost,
  count(distinct (v.voucher_series, v.voucher_number, v.financial_year))
    as voucher_count
from public.fortnox_voucher_rows r
join public.fortnox_vouchers v
  on v.voucher_series = r.voucher_series
 and v.voucher_number = r.voucher_number
 and v.financial_year = r.financial_year
where r.account between 4000 and 8999
group by r.account
having coalesce(sum(r.debit - r.credit), 0) <> 0;

comment on view public.fortnox_cost_by_account is
  'Net cost per BAS account (4000–8999). Cost = debit − credit.';

-- ---------------------------------------------------------------------------
-- NAMNGIVNA abonnemang — kronjuvelen. Grupperar återkommande KOSTNADS-
-- verifikationer på leverantörsnamnet (Description) → "CLAUDE.AI SUBSCRIPTION
-- 855 kr/mån", inte anonyma belopp.
--
-- Per verifikation: kostnad = debet − credit på driftskonton 4000–7999
-- (undantar finansiellt 8xxx och balans 1–2xxx). En verifikation utan
-- kostnadsrader (insättning, intäkt) faller bort via HAVING cost > 0.
--
-- Kolumnnamnen matchar FortnoxRecurringSupplier så frontendens
-- classifyRecurring / estimatedMonthlyCost fungerar oförändrat.
-- ---------------------------------------------------------------------------
create or replace view public.fortnox_named_subscriptions
with (security_invoker = true) as
with voucher_cost as (
  select
    v.voucher_series,
    v.voucher_number,
    v.financial_year,
    v.voucher_date,
    v.description,
    -- Normalisera bort ett efterföljande datum så "OPENAI 2026-07-05" och
    -- "OPENAI" hamnar i samma grupp. Håll det lätt: översträva inte, då
    -- riskerar skilda leverantörer slås ihop.
    nullif(
      btrim(
        regexp_replace(
          upper(coalesce(v.description, '')),
          '\s*[0-9]{4}-[0-9]{2}-[0-9]{2}\s*$', ''
        )
      ),
      ''
    ) as normalized_name,
    sum(r.debit - r.credit) filter (where r.account between 4000 and 7999)
      as cost
  from public.fortnox_vouchers v
  join public.fortnox_voucher_rows r
    on r.voucher_series = v.voucher_series
   and r.voucher_number = v.voucher_number
   and r.financial_year = v.financial_year
  where v.voucher_date is not null
  group by
    v.voucher_series, v.voucher_number, v.financial_year,
    v.voucher_date, v.description
  having
    sum(r.debit - r.credit) filter (where r.account between 4000 and 7999) > 0
)
select
  normalized_name,
  max(description)                                   as name,
  count(*)                                           as invoice_count,
  count(distinct date_trunc('month', voucher_date))  as month_count,
  round(avg(cost), 2)                                as avg_total,
  min(cost)                                          as min_total,
  max(cost)                                          as max_total,
  min(voucher_date)                                  as first_invoice_date,
  max(voucher_date)                                  as last_invoice_date,
  coalesce(sum(cost), 0)                             as sum_total
from voucher_cost
where normalized_name is not null
group by normalized_name
having count(distinct date_trunc('month', voucher_date)) >= 2;

comment on view public.fortnox_named_subscriptions is
  'Recurring named costs grouped by voucher Description (vendor name) — subscription candidates. Only cost vouchers (debit on 4000–7999). Columns mirror fortnox_supplier_recurring so the frontend classifiers are reused.';

-- ---------------------------------------------------------------------------
-- Polling — samma vault + x-cron-secret-mönster som övriga Fortnox-synkar.
-- Varje timme (minut 50, förskjutet från leverantörsfaktura-synken 45).
-- ---------------------------------------------------------------------------
create or replace function public.run_fortnox_voucher_sync()
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  edge_function_url text;
  cron_secret text;
begin
  select decrypted_secret into edge_function_url
  from vault.decrypted_secrets where name = 'supabase_url' limit 1;
  select decrypted_secret into cron_secret
  from vault.decrypted_secrets where name = 'cron_secret' limit 1;

  if edge_function_url is null or cron_secret is null then
    raise warning 'run_fortnox_voucher_sync: missing supabase_url or cron_secret in vault — skipping run';
    return;
  end if;

  perform net.http_post(
    url     := edge_function_url || '/functions/v1/fortnox_sync_vouchers',
    body    := jsonb_build_object('cron', true),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', cron_secret
    ),
    timeout_milliseconds := 20000
  );
end;
$$;

select cron.schedule(
  'fortnox-sync-vouchers',
  '50 * * * *',
  $$select public.run_fortnox_voucher_sync();$$
);
