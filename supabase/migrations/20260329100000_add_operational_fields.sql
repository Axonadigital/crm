-- Migration: Add Operational Fields to Companies
-- Created: 2026-03-29
-- Description: Adds ownership, touch tracking, next action, pipeline state,
--              and priority scoring fields for operational sales management.

-- =============================================================================
-- 1. ADD OPERATIONAL COLUMNS
-- =============================================================================

-- Explicit ownership (separate from existing sales_id which may serve other purposes)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS owner_sales_id bigint REFERENCES sales(id) ON DELETE SET NULL;

-- Touch tracking
ALTER TABLE companies ADD COLUMN IF NOT EXISTS last_touch_at timestamp with time zone;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS last_touch_type text;

-- Next action tracking
ALTER TABLE companies ADD COLUMN IF NOT EXISTS next_action_at timestamp with time zone;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS next_action_type text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS next_action_note text;

-- Pipeline state and priority
ALTER TABLE companies ADD COLUMN IF NOT EXISTS pipeline_state text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS priority_score integer DEFAULT 0;

-- =============================================================================
-- 2. ADD CHECK CONSTRAINTS
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_companies_last_touch_type'
      AND table_name = 'companies'
  ) THEN
    ALTER TABLE companies
      ADD CONSTRAINT chk_companies_last_touch_type
      CHECK (last_touch_type IS NULL OR last_touch_type IN (
        'call', 'email', 'meeting', 'note', 'quote'
      ));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_companies_next_action_type'
      AND table_name = 'companies'
  ) THEN
    ALTER TABLE companies
      ADD CONSTRAINT chk_companies_next_action_type
      CHECK (next_action_type IS NULL OR next_action_type IN (
        'call', 'email', 'meeting', 'follow_up', 'send_quote', 'other'
      ));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_companies_pipeline_state'
      AND table_name = 'companies'
  ) THEN
    ALTER TABLE companies
      ADD CONSTRAINT chk_companies_pipeline_state
      CHECK (pipeline_state IS NULL OR pipeline_state IN (
        'new', 'qualified', 'contact_attempted', 'contacted',
        'meeting_booked', 'proposal_pending', 'negotiation',
        'won', 'lost', 'nurture'
      ));
  END IF;
END $$;

-- Widen existing lead_status constraint to include 'callback_requested'
-- (used by CallQueue.tsx but missing from the current constraint)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_companies_lead_status'
      AND table_name = 'companies'
  ) THEN
    ALTER TABLE companies DROP CONSTRAINT chk_companies_lead_status;
  END IF;

  ALTER TABLE companies
    ADD CONSTRAINT chk_companies_lead_status
    CHECK (lead_status IS NULL OR lead_status IN (
      'new', 'contacted', 'interested', 'meeting_booked', 'proposal_sent',
      'negotiation', 'closed_won', 'closed_lost', 'not_interested', 'bad_fit',
      'callback_requested'
    ));
END $$;

-- =============================================================================
-- 3. ADD INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_companies_owner_sales_id ON companies(owner_sales_id);
CREATE INDEX IF NOT EXISTS idx_companies_last_touch_at ON companies(last_touch_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_companies_next_action_at ON companies(next_action_at ASC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_companies_pipeline_state ON companies(pipeline_state);
CREATE INDEX IF NOT EXISTS idx_companies_priority_score ON companies(priority_score DESC);
