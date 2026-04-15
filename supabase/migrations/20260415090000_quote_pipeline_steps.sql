-- Quote pipeline step logging
--
-- Records structured execution state for each step in the quote workflow
-- pipeline (validate, generate_text, generate_pdf, discord_notify, etc.).
-- Introduced in Phase 1 of the quote workflow refactor to give us a
-- persistent audit trail that survives edge function restarts and enables
-- future retry UX without changing orchestration behavior.
--
-- Writes are additive: the pipelineLogger helper (supabase/functions/
-- _shared/quoteWorkflow/pipelineLogger.ts) wraps each logical step and
-- inserts a row on start, updates it on success, or marks it failed on
-- error. No existing orchestration logic is changed in Phase 1 — this
-- table is write-only observability.

create table if not exists public.quote_pipeline_steps (
  id bigserial primary key,
  quote_id bigint references public.quotes(id) on delete cascade,
  step_name text not null,
  status text not null check (
    status in ('running', 'success', 'failed', 'skipped')
  ),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms integer,
  error_message text,
  error_details jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_quote_pipeline_steps_quote_id
  on public.quote_pipeline_steps (quote_id);

create index if not exists idx_quote_pipeline_steps_quote_step_started
  on public.quote_pipeline_steps (quote_id, step_name, started_at desc);

-- RLS: edge functions use the service role which bypasses RLS, but enable
-- RLS explicitly so no authenticated user can read or mutate pipeline
-- history directly. Future phases may add a read-only policy for the
-- CRM UI once the pipeline view is built.
alter table public.quote_pipeline_steps enable row level security;

comment on table public.quote_pipeline_steps is
  'Structured step log for the quote workflow pipeline. Written by edge functions via the pipelineLogger helper. Phase 1 refactor — observability only, no retry UX yet.';
