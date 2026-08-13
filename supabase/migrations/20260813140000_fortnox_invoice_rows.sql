alter table public.fortnox_invoices
  add column if not exists invoice_rows jsonb not null default '[]'::jsonb,
  add column if not exists detail_raw jsonb;

comment on column public.fortnox_invoices.invoice_rows is
  'InvoiceRows from Fortnox /3/invoices/{document_number}. Needed to reconcile multi-deal invoices without guessing from totals.';
comment on column public.fortnox_invoices.detail_raw is
  'Full Fortnox invoice-detail payload. Kept so mapping mistakes can be repaired without another API call.';
