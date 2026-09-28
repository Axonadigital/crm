-- Premium Quote Design: Add structured AI sections, accent color, and reference images
-- These columns enable the new premium proposal template while maintaining backwards compatibility

-- New columns for structured AI output and design customization
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS generated_sections JSONB;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS accent_color TEXT DEFAULT '#2563eb';
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS reference_images JSONB DEFAULT '[]'::jsonb;

-- Comment explaining the JSON structures
COMMENT ON COLUMN quotes.generated_sections IS 'Structured AI output: { summary_pitch, highlight_cards: [{ icon, title, text }], design_demo_description, proposal_body }';
COMMENT ON COLUMN quotes.accent_color IS 'CSS hex color for quote accent (e.g. #2563eb). Used in premium template.';
COMMENT ON COLUMN quotes.reference_images IS 'Array of reference project images: [{ title, url, link, type, description }]';

-- Update duplicate_quote to include new columns
CREATE OR REPLACE FUNCTION duplicate_quote(source_quote_id bigint)
RETURNS bigint AS $$
DECLARE
  new_quote_id bigint;
  new_valid_until date;
BEGIN
  new_valid_until := CURRENT_DATE + INTERVAL '30 days';

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
    notes_internal,
    generated_sections,
    accent_color,
    reference_images
  )
  SELECT
    title || ' (kopia)',
    company_id,
    contact_id,
    deal_id,
    sales_id,
    'draft',
    generated_text,
    custom_text,
    currency,
    new_valid_until,
    template_type,
    vat_rate,
    discount_percent,
    payment_terms,
    delivery_terms,
    customer_reference,
    terms_and_conditions,
    notes_internal,
    generated_sections,
    accent_color,
    reference_images
  FROM quotes
  WHERE id = source_quote_id
  RETURNING id INTO new_quote_id;

  IF new_quote_id IS NULL THEN
    RAISE EXCEPTION 'Quote with id % not found', source_quote_id;
  END IF;

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

GRANT EXECUTE ON FUNCTION duplicate_quote(bigint) TO authenticated;
