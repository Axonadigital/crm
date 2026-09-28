-- Migration: Allabolag enrichment fields
-- Created: 2026-03-30
-- Description: Adds SNI code and Allabolag URL for Swedish business data enrichment.

ALTER TABLE companies ADD COLUMN IF NOT EXISTS sni_code text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS allabolag_url text;

-- Update enrichment_log source constraint to include 'allabolag'
-- (already included from previous migration, this is a safety no-op)

-- Update companies_summary view to include new columns
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
  c.lead_score,
  c.enrichment_data,
  c.enriched_at,
  c.segment,
  c.facebook_url,
  c.instagram_url,
  c.has_facebook,
  c.has_instagram,
  c.website_score,
  c.google_place_id,
  c.sni_code,
  c.allabolag_url,
  COUNT(DISTINCT d.id) AS nb_deals,
  COUNT(DISTINCT co.id) AS nb_contacts
FROM companies c
LEFT JOIN deals d ON c.id = d.company_id
LEFT JOIN contacts co ON c.id = co.company_id
GROUP BY c.id;

GRANT SELECT ON companies_summary TO authenticated, anon;
