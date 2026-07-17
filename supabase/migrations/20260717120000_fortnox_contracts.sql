-- Fortnox avtalsfakturering (Fas 5): koppla en vunnen återkommande deal till
-- ett Fortnox-avtal (contract) som genererar löpande fakturor.
--
-- Additivt: en kolumn på deals (idempotensspärr, ett avtal per deal) + en
-- read-only spegel av avtalen. Ingen befintlig struktur ändras.

-- ---------------------------------------------------------------------------
-- Idempotensspärr: ett Fortnox-avtal per deal. Samma mönster som
-- quotes.fortnox_invoice_number → en dubbelklick förlorar racet i stället för
-- att skapa två avtal som båda fakturerar kunden.
-- ---------------------------------------------------------------------------
alter table public.deals
  add column if not exists fortnox_contract_number bigint;

comment on column public.deals.fortnox_contract_number is
  'Fortnox contract (avtal) DocumentNumber. Set once when a recurring deal is turned into a Fortnox contract; the unique index prevents duplicates.';

create unique index if not exists deals_fortnox_contract_number_key
  on public.deals (fortnox_contract_number)
  where fortnox_contract_number is not null;

-- ---------------------------------------------------------------------------
-- Spegel av avtalen — read-only, samma princip som fortnox_invoices.
-- ---------------------------------------------------------------------------
create table if not exists public.fortnox_contracts (
  document_number bigint primary key,

  customer_number text,
  contract_date date,
  period_start date,
  invoice_interval integer,
  total numeric(14, 2),
  active boolean not null default true,

  -- Länkar tillbaka till CRM:et, sätts när avtalet skapas.
  company_id bigint,
  deal_id bigint,

  raw jsonb,
  synced_at timestamptz not null default now()
);

comment on table public.fortnox_contracts is
  'Read-only mirror of Fortnox contracts (avtal). Fortnox owns them; the CRM writes a row when it creates one and a future sync refreshes it.';

create index if not exists fortnox_contracts_deal_idx
  on public.fortnox_contracts (deal_id);

alter table public.fortnox_contracts enable row level security;

drop policy if exists "Authenticated users can read fortnox contracts"
  on public.fortnox_contracts;
create policy "Authenticated users can read fortnox contracts"
  on public.fortnox_contracts
  for select
  to authenticated
  using (true);
