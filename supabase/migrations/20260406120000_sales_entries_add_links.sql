-- Add optional reference columns to sales_entries
alter table "public"."sales_entries"
  add column if not exists "deal_id" bigint references "public"."deals"(id) on delete set null,
  add column if not exists "company_id" bigint references "public"."companies"(id) on delete set null,
  add column if not exists "contact_id" bigint references "public"."contacts"(id) on delete set null;

create index if not exists "idx_sales_entries_deal_id" on "public"."sales_entries" ("deal_id");
create index if not exists "idx_sales_entries_company_id" on "public"."sales_entries" ("company_id");
create index if not exists "idx_sales_entries_contact_id" on "public"."sales_entries" ("contact_id");
