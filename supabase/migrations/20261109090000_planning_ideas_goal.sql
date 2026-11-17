-- Migration: koppla idéer till mål
-- Created: 2026-11-09
-- Description: Låter en idé höra till ett mål ("idéer för att nå målet").
--   Endast ADD COLUMN + index — inga befintliga kolumner eller data ändras.
--   ON DELETE SET NULL: tas ett mål bort blir idén kvar i Idébanken.

ALTER TABLE planning_ideas
  ADD COLUMN IF NOT EXISTS goal_id bigint REFERENCES planning_goals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_planning_ideas_goal ON planning_ideas(goal_id);
