-- Kopplingen deal → Fortnox-faktura.
--
-- Bakgrund: ingen av de speglade fakturorna bar tidigare en deal-koppling
-- (fortnox_invoices.deal_id var null rakt igenom), eftersom deal_id bara sattes
-- för fakturor som skapats ur en offert eller ett avtal. Kundtäckning fick
-- därför gissa vilken faktura som hörde till vilken affär utifrån belopp, med
-- felaktiga siffror som följd.
--
-- Den här kolumnen är dealens sida av kopplingen och samtidigt dubblettspärren:
-- exakt samma mönster som quotes.fortnox_invoice_number och
-- deals.fortnox_contract_number. Ett unikt index gör att en dubbelklick eller
-- en retry förlorar racet i stället för att fakturera kunden två gånger.
--
-- Helt additiv migration — ingen DROP, ingen ALTER av befintlig kolumn.

alter table public.deals
  add column if not exists fortnox_invoice_number bigint;

comment on column public.deals.fortnox_invoice_number is
  'Fakturanummer i Fortnox för dealens engångsbelopp. Sätts när fakturan skapas från CRM:et och fungerar som dubblettspärr — en deal kan bara faktureras en gång.';

create unique index if not exists deals_fortnox_invoice_number_key
  on public.deals (fortnox_invoice_number)
  where fortnox_invoice_number is not null;
