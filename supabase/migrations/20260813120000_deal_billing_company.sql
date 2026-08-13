alter table public.deals
  add column if not exists billing_company_id bigint
    references public.companies(id) on delete set null;

create index if not exists deals_billing_company_id_idx
  on public.deals(billing_company_id);
