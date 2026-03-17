-- Migration: Change followup_date from date to timestamp with time zone
-- Created: 2026-03-16
-- Description: Allow storing exact time for follow-up appointments, not just dates

-- Alter the followup_date column to support timestamps with timezone
ALTER TABLE "public"."call_logs"
  ALTER COLUMN "followup_date" TYPE timestamp with time zone USING followup_date::timestamp with time zone;

-- Add comment to document the change
COMMENT ON COLUMN "public"."call_logs"."followup_date" IS 'Follow-up date and time for callback scheduling';
