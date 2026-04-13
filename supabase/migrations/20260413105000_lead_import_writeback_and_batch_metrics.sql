ALTER TABLE lead_import_runs
  ADD COLUMN IF NOT EXISTS actual_batch_size integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sheet_writeback_status text NOT NULL DEFAULT 'not_attempted',
  ADD COLUMN IF NOT EXISTS sheet_rows_marked integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sheet_rows_failed integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sheet_writeback_error text;

ALTER TABLE lead_import_runs
  DROP CONSTRAINT IF EXISTS chk_lead_import_runs_sheet_writeback_status;

ALTER TABLE lead_import_runs
  ADD CONSTRAINT chk_lead_import_runs_sheet_writeback_status
    CHECK (sheet_writeback_status IN ('not_attempted', 'success', 'partial', 'failed'));

ALTER TABLE lead_import_runs
  DROP CONSTRAINT IF EXISTS chk_lead_import_runs_actual_batch_size;

ALTER TABLE lead_import_runs
  ADD CONSTRAINT chk_lead_import_runs_actual_batch_size
    CHECK (actual_batch_size >= 0);
