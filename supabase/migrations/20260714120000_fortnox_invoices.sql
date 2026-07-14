-- Fortnox integration, phase 2-4: invoice mirror, sync state, billing fields.
--
-- Fortnox owns the accounting. This mirror exists so the CRM can show invoice
-- status next to the customer and the deal without an API round-trip on every
-- page load, and so we can aggregate. It is never the source of truth: every
-- row is overwritten from Fortnox on the next sync.
--
-- Fortnox has no webhooks, so the mirror is refreshed by polling (cron below).
--
-- Balance semantics were verified against the live tenant, not assumed:
--   fully paid  -> Balance = 0,     FinalPayDate set
--   unpaid      -> Balance = Total, FinalPayDate null
-- i.e. Balance is the amount still owed.

-- ---------------------------------------------------------------------------
-- Billing fields on companies
-- ---------------------------------------------------------------------------
alter table public.companies
  add column if not exists fortnox_customer_number text,
  add column if not exists billing_email text,
  add column if not exists payment_terms text,
  add column if not exists vat_type text;

comment on column public.companies.fortnox_customer_number is
  'CustomerNumber in Fortnox. Set once the company has been pushed there; the link between CRM and Fortnox for this customer.';
comment on column public.companies.vat_type is
  'Fortnox VATType: SEVAT (default), SEREVERSEDVAT, EUREVERSEDVAT, EUVAT, EXPORT.';

-- A Fortnox customer number maps to exactly one company.
create unique index if not exists companies_fortnox_customer_number_key
  on public.companies (fortnox_customer_number)
  where fortnox_customer_number is not null;

-- ---------------------------------------------------------------------------
-- Invoice link on quotes. The unique index is the guard against double
-- invoicing: a retry, a double-click or a stuck job cannot produce a second
-- invoice for the same quote, because the second write has nowhere to go.
-- ---------------------------------------------------------------------------
alter table public.quotes
  add column if not exists fortnox_invoice_number bigint;

comment on column public.quotes.fortnox_invoice_number is
  'DocumentNumber of the Fortnox invoice created from this quote. Unique: one quote can only ever be invoiced once.';

create unique index if not exists quotes_fortnox_invoice_number_key
  on public.quotes (fortnox_invoice_number)
  where fortnox_invoice_number is not null;

-- ---------------------------------------------------------------------------
-- Invoice mirror
-- ---------------------------------------------------------------------------
create table if not exists public.fortnox_invoices (
  document_number bigint primary key,

  -- Resolved on sync: by ExternalInvoiceReference1 (we set it when we create
  -- the invoice) and, for invoices created by hand in Fortnox, by org number.
  company_id bigint references public.companies (id) on delete set null,
  deal_id bigint references public.deals (id) on delete set null,
  quote_id bigint references public.quotes (id) on delete set null,

  customer_number text,
  customer_name text,
  organisation_number text,

  invoice_date date,
  due_date date,
  final_pay_date date,

  currency text,
  total numeric(14, 2),
  total_vat numeric(14, 2),
  balance numeric(14, 2),

  booked boolean not null default false,
  sent boolean not null default false,
  cancelled boolean not null default false,

  invoice_type text,
  ocr text,
  reminders integer,
  external_reference_1 text,
  external_reference_2 text,

  raw jsonb,
  synced_at timestamptz not null default now()
);

comment on table public.fortnox_invoices is
  'Read-only mirror of Fortnox invoices, refreshed by fortnox_sync_invoices. Never write here from the app — Fortnox is the source of truth.';
comment on column public.fortnox_invoices.balance is
  'Amount still owed. 0 = fully paid. Verified against the live Fortnox tenant.';

create index if not exists fortnox_invoices_company_id_idx on public.fortnox_invoices (company_id);
create index if not exists fortnox_invoices_due_date_idx on public.fortnox_invoices (due_date);
create index if not exists fortnox_invoices_deal_id_idx on public.fortnox_invoices (deal_id);
create index if not exists fortnox_invoices_quote_id_idx on public.fortnox_invoices (quote_id);

alter table public.fortnox_invoices enable row level security;

-- Everyone signed in may read the mirror. Nobody may write it: the sync runs as
-- service role, which bypasses RLS.
drop policy if exists "Authenticated users can read fortnox invoices" on public.fortnox_invoices;
create policy "Authenticated users can read fortnox invoices"
  on public.fortnox_invoices
  for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Sync watermark
-- ---------------------------------------------------------------------------
create table if not exists public.fortnox_sync_state (
  resource text primary key,
  last_synced_at timestamptz,
  last_run_at timestamptz,
  last_error text,
  rows_synced integer
);

comment on table public.fortnox_sync_state is
  'Watermark per Fortnox resource. last_synced_at feeds the ?lastmodified= delta filter on the next run.';

alter table public.fortnox_sync_state enable row level security;

drop policy if exists "Authenticated users can read fortnox sync state" on public.fortnox_sync_state;
create policy "Authenticated users can read fortnox sync state"
  on public.fortnox_sync_state
  for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Status is derived at READ time, not stored.
--
-- Two reasons, both load-bearing:
--   1. A generated column may not use current_date (it is not immutable), so
--      "overdue" cannot live in the table at all.
--   2. Computing it during sync would be worse: an unpaid invoice that passes
--      its due date does not change in Fortnox, so the delta sync would never
--      fetch it again and it would stay "unpaid" forever.
-- A view re-evaluates it on every read, so an invoice goes overdue the moment
-- the clock says so.
-- ---------------------------------------------------------------------------
create or replace view public.fortnox_invoice_list
with (security_invoker = true) as
select
  i.*,
  case
    when i.cancelled then 'cancelled'
    when coalesce(i.balance, 0) <= 0 then 'paid'
    when i.due_date is not null and i.due_date < current_date then 'overdue'
    else 'unpaid'
  end as status
from public.fortnox_invoices i;

comment on view public.fortnox_invoice_list is
  'Invoices with a derived status (cancelled | paid | overdue | unpaid). Read this, not the table. "sent" is a separate flag — an unsent invoice is still unpaid.';

-- ---------------------------------------------------------------------------
-- Aggregates for the dashboard. A view, not a table: always current, and the
-- numbers can never drift from the rows they summarise.
-- ---------------------------------------------------------------------------
create or replace view public.fortnox_invoice_stats
with (security_invoker = true) as
select
  count(*) filter (where status <> 'cancelled')                      as total_invoices,
  count(*) filter (where status = 'unpaid')                          as unpaid_count,
  coalesce(sum(balance) filter (where status = 'unpaid'), 0)         as unpaid_amount,
  count(*) filter (where status = 'overdue')                         as overdue_count,
  coalesce(sum(balance) filter (where status = 'overdue'), 0)        as overdue_amount,
  count(*) filter (where status = 'paid')                            as paid_count,
  coalesce(sum(total) filter (where status = 'paid'), 0)             as paid_amount,
  count(*) filter (where not sent and status <> 'cancelled')         as unsent_count,
  coalesce(sum(total) filter (where not sent and status <> 'cancelled'), 0) as unsent_amount,
  (select last_synced_at from public.fortnox_sync_state where resource = 'invoices') as last_synced_at
from public.fortnox_invoice_list;

comment on view public.fortnox_invoice_stats is
  'Invoice KPIs for the dashboard. security_invoker: reads through the callers RLS, so it cannot leak more than the table does.';

-- ---------------------------------------------------------------------------
-- Polling. Fortnox has no webhooks, so this is the only way payment status
-- ever reaches the CRM. Same vault + x-cron-secret pattern as the report
-- pipeline (run_pipeline_tick).
-- ---------------------------------------------------------------------------
create or replace function public.run_fortnox_invoice_sync()
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
    raise warning 'run_fortnox_invoice_sync: missing supabase_url or cron_secret in vault — skipping run';
    return;
  end if;

  perform net.http_post(
    url     := edge_function_url || '/functions/v1/fortnox_sync_invoices',
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
  'fortnox-sync-invoices',
  '*/15 * * * *',
  $$select public.run_fortnox_invoice_sync();$$
);
