-- Migration: Fireflies Integration
-- Created: 2026-04-02
-- Description: Adds fireflies_meeting_id and fireflies_data columns to meeting_transcriptions
--              for idempotent webhook processing and storing raw Fireflies API data.

-- Add Fireflies-specific columns
ALTER TABLE meeting_transcriptions
  ADD COLUMN IF NOT EXISTS fireflies_meeting_id text,
  ADD COLUMN IF NOT EXISTS fireflies_data jsonb;

-- Unique index for idempotent webhook handling (only where not null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_mt_fireflies_meeting_id
  ON meeting_transcriptions(fireflies_meeting_id)
  WHERE fireflies_meeting_id IS NOT NULL;
