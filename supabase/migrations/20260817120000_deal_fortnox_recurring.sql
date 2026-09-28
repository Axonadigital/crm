-- Kopplingen deal → Fortnox återkommande fakturering ("Återkommande").
--
-- Det nya Recurring Billing-API:t (släppt 2026-08, /api/recurring-billing/...)
-- identifierar avtal med UUID, inte löpnummer som gamla /3/contracts. Därför en
-- uuid-kolumn och inte bigint som fortnox_contract_number.
--
-- Statusen speglas för att UI:t ska kunna skilja ett utkast från ett aktivt
-- avtal utan att fråga Fortnox vid varje rendering. Fortnox är sanningen —
-- den här kolumnen är en cache som uppdateras när vi själva ändrar status.
--
-- Unikt index = dubblettspärr: en deal kan bara ha en återkommande fakturering,
-- så en dubbelklick förlorar racet i stället för att lägga upp två avtal.
--
-- Helt additiv migration — ingen DROP, ingen ALTER av befintlig kolumn.
-- deals.fortnox_contract_number (gamla systemet) lämnas orörd; den är null på
-- samtliga deals och fortnox_contracts-tabellen är tom, så det finns ingen
-- legacy-data att migrera.

alter table public.deals
  add column if not exists fortnox_recurring_id uuid,
  add column if not exists fortnox_recurring_status text;

comment on column public.deals.fortnox_recurring_id is
  'UUID för dealens återkommande fakturering i Fortnox Recurring Billing API. Sätts när avtalet skapas från CRM:et och fungerar som dubblettspärr.';

comment on column public.deals.fortnox_recurring_status is
  'Senast kända status i Fortnox: DRAFT (utkast, fakturerar inget), ACTIVE, INACTIVE eller FINISHED. Cache — Fortnox är sanningen.';

create unique index if not exists deals_fortnox_recurring_id_key
  on public.deals (fortnox_recurring_id)
  where fortnox_recurring_id is not null;

alter table public.deals
  drop constraint if exists deals_fortnox_recurring_status_valid;

alter table public.deals
  add constraint deals_fortnox_recurring_status_valid
  check (
    fortnox_recurring_status is null
    or fortnox_recurring_status in ('DRAFT', 'ACTIVE', 'INACTIVE', 'FINISHED')
  );
