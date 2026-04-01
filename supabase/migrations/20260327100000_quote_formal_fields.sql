-- Migration: Add formal quote fields and company settings for Fortnox-style quotes
-- Created: 2026-03-27
-- Description: Extends quotes with sequential numbering, VAT, discounts, payment/delivery terms.
--              Adds seller company info to the configuration JSONB for professional invoices.

-- =============================================================================
-- 1. QUOTE SEQUENTIAL NUMBERING
-- =============================================================================

-- Sequence for quote numbers (e.g. 2026-001, 2026-002...)
CREATE SEQUENCE IF NOT EXISTS quote_number_seq START WITH 1;

-- Add new formal fields to quotes
ALTER TABLE "public"."quotes"
  ADD COLUMN IF NOT EXISTS "quote_number" text UNIQUE,
  ADD COLUMN IF NOT EXISTS "vat_rate" numeric(5,2) DEFAULT 25.00,
  ADD COLUMN IF NOT EXISTS "discount_percent" numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "payment_terms" text DEFAULT '30 dagar netto',
  ADD COLUMN IF NOT EXISTS "delivery_terms" text,
  ADD COLUMN IF NOT EXISTS "customer_reference" text,
  ADD COLUMN IF NOT EXISTS "terms_and_conditions" text,
  ADD COLUMN IF NOT EXISTS "notes_internal" text;

-- Index for quote_number lookups
CREATE INDEX IF NOT EXISTS idx_quotes_quote_number ON quotes(quote_number);

-- Function to auto-generate quote_number on insert
CREATE OR REPLACE FUNCTION generate_quote_number()
RETURNS TRIGGER AS $$
DECLARE
  current_year text;
  seq_val bigint;
BEGIN
  IF NEW.quote_number IS NULL THEN
    current_year := to_char(now(), 'YYYY');
    seq_val := nextval('quote_number_seq');
    NEW.quote_number := current_year || '-' || lpad(seq_val::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER quote_auto_number_trigger
BEFORE INSERT ON quotes
FOR EACH ROW EXECUTE FUNCTION generate_quote_number();

-- =============================================================================
-- 2. LINE ITEM VAT SUPPORT
-- =============================================================================

ALTER TABLE "public"."quote_line_items"
  ADD COLUMN IF NOT EXISTS "vat_rate" numeric(5,2);

-- NOTE: line item vat_rate is nullable — when NULL, the quote-level vat_rate applies.

-- =============================================================================
-- 3. UPDATE TOTAL TRIGGER TO INCLUDE VAT CALCULATIONS
-- =============================================================================

-- Drop and recreate the total trigger to also compute vat_amount
ALTER TABLE "public"."quotes"
  ADD COLUMN IF NOT EXISTS "subtotal" numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "vat_amount" numeric(12,2) DEFAULT 0;

CREATE OR REPLACE FUNCTION update_quote_total()
RETURNS TRIGGER AS $$
DECLARE
  calc_subtotal numeric(12,2);
  quote_vat numeric(5,2);
  calc_discount_pct numeric(5,2);
  discounted_subtotal numeric(12,2);
  calc_vat numeric(12,2);
BEGIN
  -- Calculate subtotal from line items
  SELECT COALESCE(SUM(quantity * unit_price), 0)
  INTO calc_subtotal
  FROM quote_line_items
  WHERE quote_id = COALESCE(NEW.quote_id, OLD.quote_id);

  -- Get quote-level vat_rate and discount
  SELECT COALESCE(vat_rate, 25), COALESCE(discount_percent, 0)
  INTO quote_vat, calc_discount_pct
  FROM quotes
  WHERE id = COALESCE(NEW.quote_id, OLD.quote_id);

  -- Apply discount
  discounted_subtotal := calc_subtotal * (1 - calc_discount_pct / 100);

  -- Calculate VAT
  calc_vat := discounted_subtotal * (quote_vat / 100);

  -- Update quote with all calculated values
  UPDATE quotes
  SET subtotal = calc_subtotal,
      vat_amount = calc_vat,
      total_amount = discounted_subtotal + calc_vat,
      updated_at = now()
  WHERE id = COALESCE(NEW.quote_id, OLD.quote_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 4. BACKFILL existing quotes with subtotal = total_amount, vat_amount = 0
-- =============================================================================

UPDATE quotes
SET subtotal = total_amount,
    vat_amount = 0
WHERE subtotal IS NULL OR subtotal = 0;
