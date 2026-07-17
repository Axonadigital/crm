-- Ekonomi fas 1: leverantörsfaktura-spegel för kostnads- och abonnemangsspårning.
--
-- Samma mönster som fortnox_invoices: Fortnox äger datan, CRM:et speglar den
-- read-only via polling. Varje rad skrivs över från Fortnox vid nästa synk.
--
-- Skillnad mot kundfakturorna: volymen är liten (leverantörsfakturor för ett
-- litet bolag) så synken hämtar ALLT varje körning i stället för delta via
-- lastmodified — enklare, robust, och en betalning som bokförs i efterhand
-- kan aldrig missas för att raden inte "ändrats".

-- ---------------------------------------------------------------------------
-- Spegeltabell
-- ---------------------------------------------------------------------------
create table if not exists public.fortnox_supplier_invoices (
  given_number bigint primary key,

  supplier_number text,
  supplier_name text,
  -- Leverantörens eget fakturanummer (text — kan innehålla bokstäver).
  invoice_number text,

  invoice_date date,
  due_date date,
  final_pay_date date,

  currency text,
  total numeric(14, 2),
  vat numeric(14, 2),
  balance numeric(14, 2),

  booked boolean not null default false,
  cancelled boolean not null default false,
  credit boolean not null default false,

  raw jsonb,
  synced_at timestamptz not null default now()
);

comment on table public.fortnox_supplier_invoices is
  'Read-only mirror of Fortnox supplier invoices (leverantörsfakturor), refreshed by fortnox_sync_supplier_invoices. Never write here from the app — Fortnox is the source of truth.';
comment on column public.fortnox_supplier_invoices.given_number is
  'Fortnox GivenNumber — the internal id of the supplier invoice.';
comment on column public.fortnox_supplier_invoices.balance is
  'Amount still owed to the supplier. 0 = fully paid. Same semantics as the customer invoice mirror.';

create index if not exists fortnox_supplier_invoices_supplier_idx
  on public.fortnox_supplier_invoices (supplier_number);
create index if not exists fortnox_supplier_invoices_invoice_date_idx
  on public.fortnox_supplier_invoices (invoice_date);

alter table public.fortnox_supplier_invoices enable row level security;

-- Alla inloggade får läsa spegeln. Ingen får skriva: synken kör som service
-- role och går förbi RLS.
drop policy if exists "Authenticated users can read fortnox supplier invoices"
  on public.fortnox_supplier_invoices;
create policy "Authenticated users can read fortnox supplier invoices"
  on public.fortnox_supplier_invoices
  for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Status härleds vid LÄSNING, precis som för kundfakturorna: "overdue" kan
-- inte lagras (current_date är inte immutable) och ska inte beräknas vid synk.
-- ---------------------------------------------------------------------------
create or replace view public.fortnox_supplier_invoice_list
with (security_invoker = true) as
select
  i.*,
  case
    when i.cancelled then 'cancelled'
    when coalesce(i.balance, 0) <= 0 then 'paid'
    when i.due_date is not null and i.due_date < current_date then 'overdue'
    else 'unpaid'
  end as status
from public.fortnox_supplier_invoices i;

comment on view public.fortnox_supplier_invoice_list is
  'Supplier invoices with derived status (cancelled | paid | overdue | unpaid). Read this, not the table.';

-- ---------------------------------------------------------------------------
-- Kostnad per månad — stapeldiagram-underlag för Ekonomi-sidan.
-- Kreditfakturor ingår (negativa belopp) så summan blir nettokostnad.
-- ---------------------------------------------------------------------------
create or replace view public.fortnox_cost_monthly
with (security_invoker = true) as
select
  date_trunc('month', invoice_date)::date as month,
  count(*) filter (where not cancelled)   as invoice_count,
  coalesce(sum(total) filter (where not cancelled), 0) as total_cost,
  coalesce(sum(total - coalesce(vat, 0)) filter (where not cancelled), 0) as total_cost_ex_vat
from public.fortnox_supplier_invoices
where invoice_date is not null
group by 1;

comment on view public.fortnox_cost_monthly is
  'Net supplier cost per month (credit invoices included as negatives). total_cost is inc VAT; ex VAT uses the vat column when Fortnox provides it.';

-- ---------------------------------------------------------------------------
-- Abonnemangskandidater: leverantörer med fakturor i minst 2 olika månader.
-- Spridningen (min/max/avg) följer med så frontend kan skilja "samma belopp
-- varje månad" (abonnemang) från återkommande men varierande köp.
-- ---------------------------------------------------------------------------
create or replace view public.fortnox_supplier_recurring
with (security_invoker = true) as
select
  supplier_number,
  max(supplier_name)                                   as supplier_name,
  count(*)                                             as invoice_count,
  count(distinct date_trunc('month', invoice_date))    as month_count,
  round(avg(total), 2)                                 as avg_total,
  min(total)                                           as min_total,
  max(total)                                           as max_total,
  min(invoice_date)                                    as first_invoice_date,
  max(invoice_date)                                    as last_invoice_date,
  coalesce(sum(total), 0)                              as sum_total
from public.fortnox_supplier_invoices
where not cancelled and not credit and invoice_date is not null
group by supplier_number
having count(distinct date_trunc('month', invoice_date)) >= 2;

comment on view public.fortnox_supplier_recurring is
  'Suppliers invoicing in 2+ distinct months — subscription candidates. The spread (min/max vs avg) lets the frontend tell fixed subscriptions from recurring-but-variable purchases.';

-- ---------------------------------------------------------------------------
-- Polling — samma vault + x-cron-secret-mönster som kundfakturasynken.
-- Varje timme räcker: leverantörsfakturor ändras sällan.
-- ---------------------------------------------------------------------------
create or replace function public.run_fortnox_supplier_invoice_sync()
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
    raise warning 'run_fortnox_supplier_invoice_sync: missing supabase_url or cron_secret in vault — skipping run';
    return;
  end if;

  perform net.http_post(
    url     := edge_function_url || '/functions/v1/fortnox_sync_supplier_invoices',
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
  'fortnox-sync-supplier-invoices',
  '45 * * * *',
  $$select public.run_fortnox_supplier_invoice_sync();$$
);
