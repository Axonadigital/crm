-- Migration: Add page token support to search profiles
-- Created: 2026-03-30
-- Description: Stores Google Maps next_page_token so re-runs fetch NEW results
--              instead of the same first page.

ALTER TABLE search_profiles ADD COLUMN IF NOT EXISTS next_page_token text;
ALTER TABLE search_profiles ADD COLUMN IF NOT EXISTS pages_scraped integer DEFAULT 0;
