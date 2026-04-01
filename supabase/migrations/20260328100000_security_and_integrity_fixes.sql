-- Migration: Security and data integrity fixes
-- Created: 2026-03-28
-- Description: Fixes RLS policies on quotes, adds search_path to SECURITY DEFINER functions,
--              adds missing indexes, FK constraints, CHECK constraints, and security_invoker on views.

-- =============================================================================
-- 1. FIX QUOTE RLS POLICIES — scope to authenticated + ownership
-- =============================================================================

-- Drop overly permissive policies
DROP POLICY IF EXISTS "Users can view quotes" ON "public"."quotes";
DROP POLICY IF EXISTS "Users can insert quotes" ON "public"."quotes";
DROP POLICY IF EXISTS "Users can update quotes" ON "public"."quotes";
DROP POLICY IF EXISTS "Users can delete draft quotes" ON "public"."quotes";

-- Recreate with proper ownership checks
CREATE POLICY "Users can view quotes" ON "public"."quotes"
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert quotes" ON "public"."quotes"
  FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND (
      sales_id IS NULL
      OR sales_id = (SELECT id FROM sales WHERE user_id = auth.uid())
      OR (SELECT administrator FROM sales WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Users can update own quotes" ON "public"."quotes"
  FOR UPDATE
  USING (
    sales_id = (SELECT id FROM sales WHERE user_id = auth.uid())
    OR (SELECT administrator FROM sales WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete own draft quotes" ON "public"."quotes"
  FOR DELETE
  USING (
    status = 'draft'
    AND (
      sales_id = (SELECT id FROM sales WHERE user_id = auth.uid())
      OR (SELECT administrator FROM sales WHERE user_id = auth.uid())
    )
  );

-- Fix quote_line_items RLS — scope via parent quote ownership
DROP POLICY IF EXISTS "Users can view quote_line_items" ON "public"."quote_line_items";
DROP POLICY IF EXISTS "Users can insert quote_line_items" ON "public"."quote_line_items";
DROP POLICY IF EXISTS "Users can update quote_line_items" ON "public"."quote_line_items";
DROP POLICY IF EXISTS "Users can delete quote_line_items" ON "public"."quote_line_items";

CREATE POLICY "Users can view quote_line_items" ON "public"."quote_line_items"
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert quote_line_items" ON "public"."quote_line_items"
  FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.id = quote_id
      AND (
        q.sales_id = (SELECT id FROM sales WHERE user_id = auth.uid())
        OR (SELECT administrator FROM sales WHERE user_id = auth.uid())
      )
    )
  );

CREATE POLICY "Users can update quote_line_items" ON "public"."quote_line_items"
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.id = quote_id
      AND (
        q.sales_id = (SELECT id FROM sales WHERE user_id = auth.uid())
        OR (SELECT administrator FROM sales WHERE user_id = auth.uid())
      )
    )
  );

CREATE POLICY "Users can delete quote_line_items" ON "public"."quote_line_items"
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.id = quote_id
      AND (
        q.sales_id = (SELECT id FROM sales WHERE user_id = auth.uid())
        OR (SELECT administrator FROM sales WHERE user_id = auth.uid())
      )
    )
  );

-- =============================================================================
-- 2. FIX SECURITY DEFINER FUNCTIONS — add SET search_path TO ''
-- =============================================================================

CREATE OR REPLACE FUNCTION update_quote_total()
RETURNS TRIGGER AS $$
DECLARE
  calc_subtotal numeric(12,2);
  quote_vat numeric(5,2);
  calc_discount_pct numeric(5,2);
  discounted_subtotal numeric(12,2);
  calc_vat numeric(12,2);
BEGIN
  SELECT COALESCE(SUM(quantity * unit_price), 0)
  INTO calc_subtotal
  FROM public.quote_line_items
  WHERE quote_id = COALESCE(NEW.quote_id, OLD.quote_id);

  SELECT COALESCE(vat_rate, 25), COALESCE(discount_percent, 0)
  INTO quote_vat, calc_discount_pct
  FROM public.quotes
  WHERE id = COALESCE(NEW.quote_id, OLD.quote_id);

  discounted_subtotal := calc_subtotal * (1 - calc_discount_pct / 100);
  calc_vat := discounted_subtotal * (quote_vat / 100);

  UPDATE public.quotes
  SET subtotal = calc_subtotal,
      vat_amount = calc_vat,
      total_amount = discounted_subtotal + calc_vat,
      updated_at = now()
  WHERE id = COALESCE(NEW.quote_id, OLD.quote_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '';

CREATE OR REPLACE FUNCTION generate_quote_number()
RETURNS TRIGGER AS $$
DECLARE
  current_year text;
  seq_val bigint;
BEGIN
  IF NEW.quote_number IS NULL THEN
    current_year := to_char(now(), 'YYYY');
    seq_val := nextval('public.quote_number_seq');
    NEW.quote_number := current_year || '-' || lpad(seq_val::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '';

-- =============================================================================
-- 3. FIX companies_summary VIEW — add security_invoker
-- =============================================================================

DROP VIEW IF EXISTS companies_summary;

CREATE VIEW companies_summary
WITH (security_invoker=on)
AS
SELECT
  c.id,
  c.created_at,
  c.name,
  c.sector,
  c.size,
  c.linkedin_url,
  c.website,
  c.phone_number,
  c.address,
  c.zipcode,
  c.city,
  c.state_abbr,
  c.sales_id,
  c.context_links,
  c.country,
  c.description,
  c.revenue,
  c.tax_identifier,
  c.logo,
  c.org_number,
  c.google_business_url,
  c.has_website,
  c.website_quality,
  c.source,
  c.lead_status,
  c.next_followup_date,
  c.assigned_to,
  c.tags,
  c.industry,
  c.employees_estimate,
  COUNT(DISTINCT d.id) AS nb_deals,
  COUNT(DISTINCT co.id) AS nb_contacts
FROM companies c
LEFT JOIN deals d ON c.id = d.company_id
LEFT JOIN contacts co ON c.id = co.company_id
GROUP BY c.id;

-- Grant access to the view
GRANT SELECT ON companies_summary TO authenticated, anon;

-- =============================================================================
-- 4. ADD MISSING INDEXES on sales_id columns
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_companies_sales_id ON companies(sales_id);
CREATE INDEX IF NOT EXISTS idx_contacts_sales_id ON contacts(sales_id);
CREATE INDEX IF NOT EXISTS idx_contact_notes_sales_id ON contact_notes(sales_id);
CREATE INDEX IF NOT EXISTS idx_deal_notes_sales_id ON deal_notes(sales_id);
CREATE INDEX IF NOT EXISTS idx_deals_sales_id ON deals(sales_id);
CREATE INDEX IF NOT EXISTS idx_tasks_contact_id ON tasks(contact_id);
CREATE INDEX IF NOT EXISTS idx_tasks_sales_id ON tasks(sales_id);

-- Partial index for pending tasks (used in contacts_summary view)
CREATE INDEX IF NOT EXISTS idx_tasks_pending ON tasks(done_date) WHERE done_date IS NULL;

-- GIN indexes for array columns
CREATE INDEX IF NOT EXISTS idx_contacts_tags ON contacts USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_deals_contact_ids ON deals USING GIN(contact_ids);

-- =============================================================================
-- 5. ADD MISSING FK CONSTRAINT on tasks.sales_id
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'tasks_sales_id_fkey'
      AND table_name = 'tasks'
  ) THEN
    ALTER TABLE tasks
      ADD CONSTRAINT tasks_sales_id_fkey
      FOREIGN KEY (sales_id) REFERENCES sales(id);
  END IF;
END $$;

-- =============================================================================
-- 6. ADD CHECK CONSTRAINTS for data integrity
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_companies_lead_status'
      AND table_name = 'companies'
  ) THEN
    ALTER TABLE companies
      ADD CONSTRAINT chk_companies_lead_status
      CHECK (lead_status IS NULL OR lead_status IN (
        'new', 'contacted', 'interested', 'meeting_booked', 'proposal_sent',
        'negotiation', 'closed_won', 'closed_lost', 'not_interested', 'bad_fit',
        'callback_requested'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_companies_website_quality'
      AND table_name = 'companies'
  ) THEN
    ALTER TABLE companies
      ADD CONSTRAINT chk_companies_website_quality
      CHECK (website_quality IS NULL OR website_quality IN (
        'ok', 'poor', 'none'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_companies_source'
      AND table_name = 'companies'
  ) THEN
    ALTER TABLE companies
      ADD CONSTRAINT chk_companies_source
      CHECK (source IS NULL OR source IN (
        'manual', 'google_maps', 'google_search', 'import', 'website', 'referral',
        'hitta', 'allabolag', 'eniro', 'field'
      ));
  END IF;
END $$;
