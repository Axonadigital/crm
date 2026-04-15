-- Phase 3: quarantine table for Zod validation failures across the quote
-- pipeline. Every boundary that runs a schema check writes here when the
-- check fails, so we can audit what the system rejected without losing
-- the raw input that caused the rejection.
--
-- Per-boundary policy (enforced in application code, not in this schema):
--   - AI output:                  validate -> log here -> Discord alert -> fallback
--   - save_quote_content payload: validate -> log here -> 400 to caller (fail-fast)
--   - save_quote_edits payload:   validate -> log here -> 400 to caller (fail-fast)
--   - DocuSeal webhook payload:   validate -> log here -> return 200, stop processing
--   - Outgoing DocuSeal payload:  validate -> log here -> throw (fail-fast, our bug)
--
-- The table is append-only from the application's perspective. No
-- updates, no deletes. Service role writes, nothing reads until we
-- build a dev dashboard later.

create table if not exists public.quote_validation_failures (
  id bigserial primary key,
  quote_id bigint references public.quotes(id) on delete set null,
  schema_name text not null,
  boundary text not null check (
    boundary in (
      'ai_output',
      'save_quote_content_payload',
      'save_quote_edits_payload',
      'docuseal_webhook',
      'docuseal_outgoing_payload'
    )
  ),
  policy text not null check (
    policy in ('quarantine', 'fail_fast')
  ),
  raw_input jsonb,
  validation_error text not null,
  error_details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_quote_validation_failures_quote_id
  on public.quote_validation_failures (quote_id);

create index if not exists idx_quote_validation_failures_boundary_created
  on public.quote_validation_failures (boundary, created_at desc);

-- RLS: enabled, no policies. Service role writes via edge functions.
-- A future admin dashboard can add a SELECT policy for administrators.
alter table public.quote_validation_failures enable row level security;

comment on table public.quote_validation_failures is
  'Quarantine log for Zod validation failures across the quote pipeline. Phase 3 refactor — one row per failed schema check at any boundary.';
