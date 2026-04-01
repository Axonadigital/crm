-- Migration: Deduplication Constraints
-- Created: 2026-03-29
-- Description: Adds deduplication indexes and constraints for companies and contacts.
--              Uses partial UNIQUE for org_number and soft (non-unique) indexes elsewhere
--              to avoid failures on existing duplicate data.

-- =============================================================================
-- 1. COMPANIES: Partial UNIQUE on org_number
-- =============================================================================

-- Only enforce uniqueness when org_number is present and non-empty
CREATE UNIQUE INDEX IF NOT EXISTS uq_companies_org_number
  ON companies (org_number)
  WHERE org_number IS NOT NULL AND org_number != '';

-- =============================================================================
-- 2. COMPANIES: Soft dedupe index on normalized name + city
-- =============================================================================

-- Non-unique index for fast lookup of potential duplicates
-- Used by data_quality_status trigger to flag possible duplicates
CREATE INDEX IF NOT EXISTS idx_companies_name_city_dedupe
  ON companies (lower(trim(name)), lower(trim(city)))
  WHERE name IS NOT NULL;

-- =============================================================================
-- 3. CONTACTS: GIN indexes on JSONB email and phone for fast lookups
-- =============================================================================

-- Enable fast search within email_jsonb array (e.g. finding contacts by email)
CREATE INDEX IF NOT EXISTS idx_contacts_email_jsonb_gin
  ON contacts USING GIN (email_jsonb jsonb_path_ops);

-- Enable fast search within phone_jsonb array (e.g. finding contacts by phone)
CREATE INDEX IF NOT EXISTS idx_contacts_phone_jsonb_gin
  ON contacts USING GIN (phone_jsonb jsonb_path_ops);
