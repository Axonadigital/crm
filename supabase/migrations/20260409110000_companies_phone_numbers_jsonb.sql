-- Add structured multi-phone support for company enrichment/scraping.
ALTER TABLE companies
ADD COLUMN IF NOT EXISTS phone_numbers jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE companies
SET phone_numbers = jsonb_build_array(
  jsonb_build_object(
    'number',
    phone_number,
    'source',
    'existing'
  )
)
WHERE phone_number IS NOT NULL
  AND btrim(phone_number) <> ''
  AND (
    phone_numbers IS NULL
    OR phone_numbers = '[]'::jsonb
  );
