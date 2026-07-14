-- Fortnox offers: the document the customer actually trusts.
--
-- Axona's own quote system was abandoned in April after 17 quotes: customers
-- found the premium PDF overwhelming and trusted Fortnox's plain offer more.
-- So Fortnox owns the offer document; the CRM owns the workflow around it
-- (signing, tracking, invoicing) — the parts that were manual before.
--
-- Signing state lives here, not in Fortnox: Fortnox has no concept of a
-- signature. `sent` below is Fortnox's own sender flag (almost always false,
-- same as invoices) — `signing_status` is what actually matters.

create table if not exists public.fortnox_offers (
  document_number bigint primary key,

  company_id bigint references public.companies (id) on delete set null,
  deal_id bigint references public.deals (id) on delete set null,

  customer_number text,
  customer_name text,

  offer_date date,
  expire_date date,

  currency text,
  total numeric(14, 2),
  total_vat numeric(14, 2),

  cancelled boolean not null default false,
  sent boolean not null default false,

  -- Set by Fortnox when the offer has been converted.
  order_reference text,
  invoice_reference text,

  external_reference_1 text,
  external_reference_2 text,

  -- Signing, owned by the CRM.
  docuseal_submission_id text,
  signing_url text,
  signing_status text not null default 'none'
    check (signing_status in ('none', 'sent', 'opened', 'signed', 'declined')),
  signing_sent_at timestamptz,
  signing_opened_at timestamptz,
  signing_signed_at timestamptz,
  signing_declined_at timestamptz,

  -- The invoice this offer turned into, via Fortnox createinvoice.
  fortnox_invoice_number bigint,

  raw jsonb,
  synced_at timestamptz not null default now()
);

comment on table public.fortnox_offers is
  'Mirror of Fortnox offers, plus the signing state the CRM adds on top. Fortnox owns the document; we own the workflow.';
comment on column public.fortnox_offers.sent is
  'Fortnox''s own sender flag — NOT whether the customer received the offer. Use signing_status.';

-- One offer can only ever become one invoice.
create unique index if not exists fortnox_offers_invoice_number_key
  on public.fortnox_offers (fortnox_invoice_number)
  where fortnox_invoice_number is not null;

create index if not exists fortnox_offers_company_id_idx on public.fortnox_offers (company_id);
create index if not exists fortnox_offers_deal_id_idx on public.fortnox_offers (deal_id);
create index if not exists fortnox_offers_signing_status_idx on public.fortnox_offers (signing_status);

alter table public.fortnox_offers enable row level security;

drop policy if exists "Authenticated users can read fortnox offers" on public.fortnox_offers;
create policy "Authenticated users can read fortnox offers"
  on public.fortnox_offers for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- A CRM quote is the single place we write down what is being sold. It can be
-- delivered two ways, for two different moments in a sale:
--
--   "målande"  — Axona's own premium PDF, for a customer who has not decided.
--                Its job is to persuade.
--   "klassisk" — pushed to Fortnox as an offer, for a customer who has decided.
--                Its job is to be signed, and it becomes the invoice.
--
-- Same quote, same rows, no retyping. fortnox_offer_number links the two.
-- ---------------------------------------------------------------------------
alter table public.quotes
  add column if not exists fortnox_offer_number bigint;

comment on column public.quotes.fortnox_offer_number is
  'The Fortnox offer created from this quote (the "klassisk" delivery). Null until the quote is sent that way.';

create unique index if not exists quotes_fortnox_offer_number_key
  on public.quotes (fortnox_offer_number)
  where fortnox_offer_number is not null;

-- ---------------------------------------------------------------------------
-- The link from a deal to its offer and its invoice.
-- ---------------------------------------------------------------------------
alter table public.deals
  add column if not exists fortnox_offer_number bigint,
  add column if not exists fortnox_invoice_number bigint;

comment on column public.deals.fortnox_offer_number is
  'The Fortnox offer this deal is being sold with. Set when the offer is created from the deal, or matched on sync.';
comment on column public.deals.fortnox_invoice_number is
  'The Fortnox invoice created when this deal was won. Unique: a deal can only ever be invoiced once.';

-- The guard against double invoicing a won deal.
create unique index if not exists deals_fortnox_invoice_number_key
  on public.deals (fortnox_invoice_number)
  where fortnox_invoice_number is not null;

-- ---------------------------------------------------------------------------
-- Derived status, at read time (same reasoning as invoices: "expired" depends
-- on today's date, which a generated column may not use).
-- ---------------------------------------------------------------------------
create or replace view public.fortnox_offer_list
with (security_invoker = true) as
select
  o.*,
  case
    when o.cancelled then 'cancelled'
    when o.fortnox_invoice_number is not null then 'invoiced'
    when o.signing_status = 'signed' then 'signed'
    when o.signing_status = 'declined' then 'declined'
    when o.expire_date is not null and o.expire_date < current_date
      and o.signing_status <> 'signed' then 'expired'
    when o.signing_status in ('sent', 'opened') then o.signing_status
    else 'draft'
  end as status
from public.fortnox_offers o;

comment on view public.fortnox_offer_list is
  'Offers with a derived status: draft | sent | opened | signed | declined | expired | invoiced | cancelled.';

-- ---------------------------------------------------------------------------
-- Polling, same pattern as invoices.
-- ---------------------------------------------------------------------------
create or replace function public.run_fortnox_offer_sync()
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
    raise warning 'run_fortnox_offer_sync: missing supabase_url or cron_secret in vault — skipping run';
    return;
  end if;

  perform net.http_post(
    url     := edge_function_url || '/functions/v1/fortnox_sync_offers',
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
  'fortnox-sync-offers',
  '*/15 * * * *',
  $$select public.run_fortnox_offer_sync();$$
);
