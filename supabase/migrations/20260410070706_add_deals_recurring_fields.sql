-- Add recurring cost fields to deals
-- WHY: Enable tracking of recurring revenue (e.g. monthly licenses) alongside one-time deal amounts
ALTER TABLE deals ADD COLUMN IF NOT EXISTS recurring_amount bigint;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS recurring_interval text;

-- Constraint: recurring_interval must be one of the allowed values (or NULL)
ALTER TABLE deals ADD CONSTRAINT deals_recurring_interval_check
  CHECK (recurring_interval IS NULL OR recurring_interval IN ('monthly', 'quarterly', 'yearly'));
