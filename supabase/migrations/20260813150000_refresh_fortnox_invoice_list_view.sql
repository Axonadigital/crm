create or replace view public.fortnox_invoice_list
with (security_invoker = true) as
select
  i.document_number,
  i.company_id,
  i.deal_id,
  i.quote_id,
  i.customer_number,
  i.customer_name,
  i.organisation_number,
  i.invoice_date,
  i.due_date,
  i.final_pay_date,
  i.currency,
  i.total,
  i.total_vat,
  i.balance,
  i.booked,
  i.sent,
  i.cancelled,
  i.invoice_type,
  i.ocr,
  i.reminders,
  i.external_reference_1,
  i.external_reference_2,
  i.raw,
  i.synced_at,
  case
    when i.cancelled then 'cancelled'
    when coalesce(i.balance, 0) <= 0 then 'paid'
    when i.due_date is not null and i.due_date < current_date then 'overdue'
    else 'unpaid'
  end as status,
  i.invoice_rows,
  i.detail_raw
from public.fortnox_invoices i;

comment on view public.fortnox_invoice_list is
  'Invoices with a derived status (cancelled | paid | overdue | unpaid), including invoice_rows from the Fortnox detail endpoint.';
