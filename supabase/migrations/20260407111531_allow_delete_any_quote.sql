-- Migration: Allow authenticated users to delete any of their own quotes
-- Reason: Previous policy only allowed deleting draft quotes, which prevented
-- cleanup of test data and deletion of sent/signed/expired quotes when needed.
-- Admins can delete any quote; regular users can delete their own quotes.

DROP POLICY IF EXISTS "Users can delete own draft quotes" ON "public"."quotes";

CREATE POLICY "Users can delete own quotes" ON "public"."quotes"
  FOR DELETE
  USING (
    sales_id = (SELECT id FROM sales WHERE user_id = auth.uid())
    OR (SELECT administrator FROM sales WHERE user_id = auth.uid())
  );
