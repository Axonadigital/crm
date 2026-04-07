-- Migration: Fix call_logs RLS policies for update/delete
-- Created: 2026-04-07
-- Description: Previously only the creator could update/delete their own call logs.
--              This blocked teammates from correcting each other's entries.
--              Changed to allow any authenticated user to update and delete.

DROP POLICY IF EXISTS "Users can update their own call_logs" ON "public"."call_logs";
DROP POLICY IF EXISTS "Users can delete their own call_logs" ON "public"."call_logs";
DROP POLICY IF EXISTS "Authenticated users can update call_logs" ON "public"."call_logs";
DROP POLICY IF EXISTS "Authenticated users can delete call_logs" ON "public"."call_logs";

CREATE POLICY "Authenticated users can update call_logs" ON "public"."call_logs"
  FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete call_logs" ON "public"."call_logs"
  FOR DELETE
  USING (auth.uid() IS NOT NULL);
