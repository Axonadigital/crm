-- Delbetalningar: hur många delfakturor som redan skapats för en deal.
--
-- deals.fortnox_invoice_number rymmer ett enda fakturanummer och räcker därför
-- bara för deals som faktureras i sin helhet. En deal på 15 000 delad i tre
-- delar ger tre fakturor, och behöver i stället en räknare — som samtidigt är
-- dubblettspärren: delfaktura N skapas bara om räknaren står på N-1, så en
-- dubbelklick förlorar racet i stället för att skicka samma del två gånger.
--
-- Backfillen sätter räknaren från de fakturor som redan är kopplade till
-- respektive deal (kreditfakturor med negativt belopp räknas inte som en
-- skickad del). Utan den skulle en redan fakturerad del erbjudas igen — deal 67
-- "och original nyhetsbrev" har t.ex. faktura 2643 som del 1 av 3.
--
-- Helt additiv migration — ingen DROP, ingen ALTER av befintlig kolumn.

alter table public.deals
  add column if not exists installments_invoiced integer not null default 0;

comment on column public.deals.installments_invoiced is
  'Antal delfakturor som skapats för dealen. Används som dubblettspärr vid fakturering av delbetalningar — nästa del är installments_invoiced + 1.';

update public.deals d
set installments_invoiced = coalesce((
  select count(*)
  from public.fortnox_invoices f
  where f.deal_id = d.id
    and f.cancelled = false
    and coalesce(f.total, 0) > 0
), 0)
where d.billing_schedule_type = 'installment'
  and d.installments_invoiced = 0;

-- Räknaren får aldrig överstiga antalet avtalade delar.
alter table public.deals
  drop constraint if exists deals_installments_invoiced_within_count;

alter table public.deals
  add constraint deals_installments_invoiced_within_count
  check (
    installments_invoiced >= 0
    and (installment_count is null or installments_invoiced <= installment_count)
  );
