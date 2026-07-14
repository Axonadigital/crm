-- Fortnox's `Sent` flag means "sent THROUGH Fortnox" (its own email / e-invoice
-- sender), NOT "the customer received the invoice".
--
-- Verified against the live tenant: 5 of the 7 invoices with Sent = false are
-- fully PAID. Customers do not pay invoices they never received — Axona had
-- been downloading the PDF and emailing it themselves, which Fortnox never
-- learns about. No invoice in the tenant has an OutboundDate at all.
--
-- So counting every unsent invoice produced an alarming number that meant
-- nothing. Only an unsent invoice that is still UNPAID is worth looking at, and
-- even then it is a hint ("maybe it never went out"), not a fact.
--
-- Axona intends to send through Fortnox from now on, so the flag becomes
-- meaningful going forward; it is the historical rows that are misleading.

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
  count(*) filter (where not sent and status in ('unpaid', 'overdue')) as unsent_count,
  coalesce(
    sum(balance) filter (where not sent and status in ('unpaid', 'overdue')),
    0
  )                                                                  as unsent_amount,
  (select last_synced_at from public.fortnox_sync_state where resource = 'invoices') as last_synced_at
from public.fortnox_invoice_list;

comment on view public.fortnox_invoice_stats is
  'Invoice KPIs. unsent_count counts only UNPAID invoices not sent through Fortnox: `Sent` describes Fortnox''s own sender, not whether the customer got the invoice.';
