-- Migration: Add lead tracking columns to companies table
-- Created: 2026-03-16
-- Description: Adds columns for tracking lead status, website quality, and other CRM fields

-- Add new columns to companies table
ALTER TABLE companies ADD COLUMN IF NOT EXISTS lead_status text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS has_website boolean DEFAULT false;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS website_quality text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS industry text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS org_number text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS google_business_url text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS next_followup_date timestamp with time zone;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS assigned_to bigint;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS tags text[];
ALTER TABLE companies ADD COLUMN IF NOT EXISTS employees_estimate integer;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS state_abbr text;

-- Create index for lead_status for faster filtering
CREATE INDEX IF NOT EXISTS idx_companies_lead_status ON companies(lead_status);
CREATE INDEX IF NOT EXISTS idx_companies_source ON companies(source);
CREATE INDEX IF NOT EXISTS idx_companies_industry ON companies(industry);
