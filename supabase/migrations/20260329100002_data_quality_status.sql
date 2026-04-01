-- Migration: Data Quality Status
-- Created: 2026-03-29
-- Description: Adds a data_quality_status column to companies that is automatically
--              computed via trigger. Flags: missing_contact, possible_duplicate,
--              missing_owner, missing_next_step, or complete.

-- =============================================================================
-- 1. ADD COLUMN
-- =============================================================================

ALTER TABLE companies ADD COLUMN IF NOT EXISTS data_quality_status text DEFAULT 'missing_owner';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_companies_data_quality_status'
      AND table_name = 'companies'
  ) THEN
    ALTER TABLE companies
      ADD CONSTRAINT chk_companies_data_quality_status
      CHECK (data_quality_status IS NULL OR data_quality_status IN (
        'complete', 'missing_contact', 'possible_duplicate',
        'missing_owner', 'missing_next_step'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_companies_data_quality_status
  ON companies(data_quality_status)
  WHERE data_quality_status != 'complete';

-- =============================================================================
-- 2. TRIGGER FUNCTION
-- =============================================================================

CREATE OR REPLACE FUNCTION compute_data_quality_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  has_contacts boolean;
  has_duplicate boolean;
BEGIN
  -- Check if company has at least one contact
  SELECT EXISTS (
    SELECT 1 FROM public.contacts WHERE company_id = NEW.id
  ) INTO has_contacts;

  -- Check for possible duplicate by normalized name + city
  SELECT EXISTS (
    SELECT 1 FROM public.companies
    WHERE id != NEW.id
      AND lower(trim(name)) = lower(trim(NEW.name))
      AND lower(trim(COALESCE(city, ''))) = lower(trim(COALESCE(NEW.city, '')))
      AND NEW.name IS NOT NULL
  ) INTO has_duplicate;

  -- Priority order: possible_duplicate > missing_contact > missing_owner > missing_next_step > complete
  IF has_duplicate THEN
    NEW.data_quality_status := 'possible_duplicate';
  ELSIF NOT has_contacts THEN
    NEW.data_quality_status := 'missing_contact';
  ELSIF NEW.owner_sales_id IS NULL AND NEW.sales_id IS NULL THEN
    NEW.data_quality_status := 'missing_owner';
  ELSIF NEW.next_action_at IS NULL
    AND NEW.pipeline_state IS NOT NULL
    AND NEW.pipeline_state NOT IN ('won', 'lost') THEN
    NEW.data_quality_status := 'missing_next_step';
  ELSE
    NEW.data_quality_status := 'complete';
  END IF;

  RETURN NEW;
END;
$$;

-- =============================================================================
-- 3. TRIGGER
-- =============================================================================

DROP TRIGGER IF EXISTS trg_compute_data_quality_status ON companies;

CREATE TRIGGER trg_compute_data_quality_status
  BEFORE INSERT OR UPDATE ON companies
  FOR EACH ROW
  EXECUTE FUNCTION compute_data_quality_status();

-- =============================================================================
-- 4. BACKFILL: Recompute status for existing rows
-- =============================================================================

-- Touch all rows to fire the trigger and set initial data_quality_status
UPDATE companies SET data_quality_status = data_quality_status;
