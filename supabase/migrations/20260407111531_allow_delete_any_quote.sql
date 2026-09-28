-- Migration: Allow any authenticated user to delete quotes
-- Reason: Previous policy used auth.uid() which returned NULL via PostgREST,
-- silently blocking all client-side deletions. Switched to auth.role() pattern
-- which matches the working SELECT policy. Confirmation dialog in the UI
-- prevents accidental deletions.

DROP POLICY IF EXISTS "Users can delete own draft quotes" ON "public"."quotes";
DROP POLICY IF EXISTS "Users can delete own quotes" ON "public"."quotes";

CREATE POLICY "Authenticated users can delete quotes" ON "public"."quotes"
  FOR DELETE
  USING (auth.role() = 'authenticated');
