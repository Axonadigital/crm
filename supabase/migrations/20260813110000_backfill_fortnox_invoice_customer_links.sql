-- Backfill invoice links after manually connecting CRM companies to existing
-- Fortnox customer numbers.
--
-- WHY: A user can now paste/adopt a Fortnox customer number on the company
-- card. If that happened before the latest edge function was deployed, the
-- company link may exist while already mirrored invoices are still orphaned
-- (company_id is null). This idempotent backfill makes the mirror consistent
-- from the durable company link.

update public.fortnox_invoices i
set company_id = c.id
from public.companies c
where c.fortnox_customer_number is not null
  and i.customer_number = c.fortnox_customer_number
  and i.company_id is distinct from c.id;
