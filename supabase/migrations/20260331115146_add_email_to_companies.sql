-- Add email column to companies table for enrichment-discovered emails
ALTER TABLE companies ADD COLUMN IF NOT EXISTS email TEXT;
