-- Migration: Quote auto-expire and duplicate support
-- Created: 2026-03-28
-- Description:
--   1. Auto-expire: Function that marks quotes as 'expired' when valid_until has passed.
--      Can be called via RPC from frontend or scheduled externally.
--   2. Duplicate: SQL function to clone a quote with all its line items.

-- =============================================================================
-- 1. AUTO-EXPIRE FUNCTION
-- =============================================================================

-- Function to expire quotes where valid_until < today
-- Only affects quotes in statuses that can logically expire (draft, generated, sent, viewed)
CREATE OR REPLACE FUNCTION expire_overdue_quotes()
RETURNS integer AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE quotes
  SET status = 'expired',
      updated_at = now()
  WHERE valid_until IS NOT NULL
    AND valid_until < CURRENT_DATE
    AND status IN ('draft', 'generated', 'sent', 'viewed');

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users (needed for RPC calls from frontend)
GRANT EXECUTE ON FUNCTION expire_overdue_quotes() TO authenticated;

-- =============================================================================
-- 2. DUPLICATE QUOTE FUNCTION
-- =============================================================================

-- Function to duplicate a quote and all its line items
-- Returns the new quote ID
CREATE OR REPLACE FUNCTION duplicate_quote(source_quote_id bigint)
RETURNS bigint AS $$
DECLARE
  new_quote_id bigint;
  new_valid_until date;
BEGIN
  -- Calculate new valid_until: 30 days from today
  new_valid_until := CURRENT_DATE + INTERVAL '30 days';

  -- Copy the quote (excluding generated fields, signing data, and PDF)
  INSERT INTO quotes (
    title,
    company_id,
    contact_id,
    deal_id,
    sales_id,
    status,
    generated_text,
    custom_text,
    currency,
    valid_until,
    template_type,
    vat_rate,
    discount_percent,
    payment_terms,
    delivery_terms,
    customer_reference,
    terms_and_conditions,
    notes_internal
  )
  SELECT
    title || ' (kopia)',
    company_id,
    contact_id,
    deal_id,
    sales_id,
    'draft',                    -- Always start as draft
    NULL,                       -- Clear generated text (will need regeneration)
    custom_text,                -- Keep custom text if any
    currency,
    new_valid_until,            -- Fresh validity period
    template_type,
    vat_rate,
    discount_percent,
    payment_terms,
    delivery_terms,
    customer_reference,
    terms_and_conditions,
    notes_internal
  FROM quotes
  WHERE id = source_quote_id
  RETURNING id INTO new_quote_id;

  IF new_quote_id IS NULL THEN
    RAISE EXCEPTION 'Quote with id % not found', source_quote_id;
  END IF;

  -- Copy all line items
  INSERT INTO quote_line_items (
    quote_id,
    description,
    quantity,
    unit_price,
    vat_rate,
    sort_order
  )
  SELECT
    new_quote_id,
    description,
    quantity,
    unit_price,
    vat_rate,
    sort_order
  FROM quote_line_items
  WHERE quote_id = source_quote_id
  ORDER BY sort_order;

  RETURN new_quote_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION duplicate_quote(bigint) TO authenticated;
