alter table public.deals
  add column if not exists delivery_company_ids bigint[] not null default '{}';

create index if not exists deals_delivery_company_ids_idx
  on public.deals using gin(delivery_company_ids);
