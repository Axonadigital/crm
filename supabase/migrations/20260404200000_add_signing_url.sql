-- Add docuseal_signing_url to quotes table
-- Stores the signing form URL so the quote viewer can show a "Sign" button
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS docuseal_signing_url text;
