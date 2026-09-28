-- Migration: Lead import filter configuration
-- Created: 2026-04-20
-- Description: Adds filter_config to lead_import_sources so each source can
--              specify rules for which rows to skip (revenue, org form, keywords).
--              Also tracks rows_skipped_filtered in lead_import_runs.

-- =============================================================================
-- 1. FILTER CONFIG ON IMPORT SOURCES
-- =============================================================================

ALTER TABLE lead_import_sources
  ADD COLUMN IF NOT EXISTS filter_config jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN lead_import_sources.filter_config IS
  'JSON filter rules applied during import. Supported keys:
   min_revenue_kkr          integer  – skip rows with revenue below this value (in kkr)
   exclude_holding          boolean  – skip rows where organisationsform contains "holding"
   exclude_name_keywords    text[]   – skip rows whose name matches any of these substrings (case-insensitive)
   exclude_org_forms        text[]   – skip rows whose organisationsform matches any of these (case-insensitive)
   min_employees            integer  – skip rows with fewer employees than this
   max_employees            integer  – skip rows with more employees than this';

-- =============================================================================
-- 2. FILTERED ROW COUNTER ON IMPORT RUNS
-- =============================================================================

ALTER TABLE lead_import_runs
  ADD COLUMN IF NOT EXISTS rows_skipped_filtered integer NOT NULL DEFAULT 0;

ALTER TABLE lead_import_runs
  DROP CONSTRAINT IF EXISTS chk_lead_import_runs_rows_skipped_filtered;

ALTER TABLE lead_import_runs
  ADD CONSTRAINT chk_lead_import_runs_rows_skipped_filtered
    CHECK (rows_skipped_filtered >= 0);
