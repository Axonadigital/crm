alter table public.deals
  add column if not exists billing_schedule_type text not null default 'standard',
  add column if not exists installment_count integer,
  add column if not exists installment_interval_months integer not null default 1;

comment on column public.deals.billing_schedule_type is
  'standard = normal one-time/recurring deal, installment = fixed deal amount split over multiple invoices.';
comment on column public.deals.installment_count is
  'Number of invoices to split amount over when billing_schedule_type = installment.';
comment on column public.deals.installment_interval_months is
  'Months between installment invoices when billing_schedule_type = installment.';

alter table public.deals
  drop constraint if exists deals_billing_schedule_type_check,
  add constraint deals_billing_schedule_type_check
    check (billing_schedule_type in ('standard', 'installment'));

alter table public.deals
  drop constraint if exists deals_installment_count_check,
  add constraint deals_installment_count_check
    check (installment_count is null or installment_count > 0);

alter table public.deals
  drop constraint if exists deals_installment_interval_months_check,
  add constraint deals_installment_interval_months_check
    check (installment_interval_months > 0);
