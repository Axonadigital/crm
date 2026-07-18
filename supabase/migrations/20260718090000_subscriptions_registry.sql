-- Abonnemangsregister: en manuellt underhållen sanning om vilka abonnemang
-- bolaget FAKTISKT har och vad de kostar per månad — det bokföringen inte kan
-- veta (vilken plan som är aktiv nu, Pro vs Max, vad som är uppsagt).
--
-- Bokföringen (fortnox_vouchers) förblir sanningen om PENGARNA; registret är
-- sanningen om ABONNEMANGEN. Vyn fortnox_cost_by_description låter frontend
-- stämma av det ena mot det andra.
--
-- Additivt. subscriptions är CRM-ägd data (till skillnad från Fortnox-speglarna)
-- så inloggade får både läsa och skriva.

create table if not exists public.subscriptions (
  id bigint generated always as identity primary key,

  name text not null,
  vendor text,
  category text,

  -- Uppskattad kostnad per månad i registrets valuta. Registret speglar den
  -- LÖPANDE kostnaden framåt — engångshändelser (proratering, återbetalning)
  -- hör hemma i bokföringen, inte här.
  monthly_amount numeric(12, 2) not null default 0,
  currency text not null default 'SEK',

  status text not null default 'active'
    check (status in ('active', 'paused', 'ended')),
  started_on date,
  ended_on date,

  -- Textmönster som matchar leverantörens rader i bokföringen, för avstämning.
  -- Ex: {'CHATGPT','OPENAI *CHATGPT'} fångar alla ChatGPT-varianter.
  aliases text[] not null default '{}',
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.subscriptions is
  'Manually maintained registry of the subscriptions the company actually has. Source of truth for the recurring-cost runrate; reconciled against Fortnox bookkeeping via aliases.';
comment on column public.subscriptions.aliases is
  'Uppercase text patterns matched (as substrings) against Fortnox voucher descriptions to reconcile declared vs booked cost.';
comment on column public.subscriptions.monthly_amount is
  'Estimated recurring cost per month. Forward-looking — one-off proration/refunds live in the bookkeeping, not here.';

create index if not exists subscriptions_status_idx
  on public.subscriptions (status);

alter table public.subscriptions enable row level security;

drop policy if exists "Authenticated can read subscriptions" on public.subscriptions;
create policy "Authenticated can read subscriptions"
  on public.subscriptions for select to authenticated using (true);

drop policy if exists "Authenticated can write subscriptions" on public.subscriptions;
create policy "Authenticated can write subscriptions"
  on public.subscriptions for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Avstämningsunderlag: all bokförd driftskostnad grupperad på leverantörsnamn.
-- Till skillnad från fortnox_named_subscriptions filtreras INGET bort här (även
-- engångs- och enmånadskostnader), så registrets alias kan matcha vad som helst
-- och oregistrerade återkommande kostnader kan upptäckas.
--
-- Konton 4000-6999: driftskostnader. Utesluter 7xxx (löner) och 8xxx
-- (finansiellt) som annars stör som "abonnemang". Belopp nettas (köp − retur).
-- ---------------------------------------------------------------------------
create or replace view public.fortnox_cost_by_description
with (security_invoker = true) as
with voucher_cost as (
  select
    v.voucher_date,
    upper(btrim(v.description)) as description,
    sum(r.debit - r.credit) filter (where r.account between 4000 and 6999)
      as cost
  from public.fortnox_vouchers v
  join public.fortnox_voucher_rows r
    on r.voucher_series = v.voucher_series
   and r.voucher_number = v.voucher_number
   and r.financial_year = v.financial_year
  where v.voucher_date is not null and v.description is not null
  group by v.voucher_date, upper(btrim(v.description))
  having
    sum(r.debit - r.credit) filter (where r.account between 4000 and 6999) <> 0
)
select
  description,
  count(distinct date_trunc('month', voucher_date)) as month_count,
  round(sum(cost), 2)                                as total_cost,
  round(
    coalesce(
      sum(cost) filter (where voucher_date >= current_date - interval '90 days'),
      0
    ), 2
  )                                                  as cost_90d,
  min(voucher_date)                                  as first_date,
  max(voucher_date)                                  as last_date
from voucher_cost
group by description;

comment on view public.fortnox_cost_by_description is
  'Every booked operating cost (accounts 4000-6999) grouped by vendor description, netted. Basis for reconciling the subscription registry against the bookkeeping and for spotting unregistered recurring costs.';
