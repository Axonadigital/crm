-- Migration: Update companies_summary view to include Swedish CRM fields
-- Created: 2026-03-16
-- Description: Recreates companies_summary view with new fields

-- Drop and recreate the view with new columns
DROP VIEW IF EXISTS companies_summary;

CREATE VIEW companies_summary AS
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
  -- Swedish CRM fields
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
  -- Aggregated counts
  COUNT(DISTINCT d.id) AS nb_deals,
  COUNT(DISTINCT co.id) AS nb_contacts
FROM companies c
LEFT JOIN deals d ON c.id = d.company_id
LEFT JOIN contacts co ON c.id = co.company_id
GROUP BY c.id;
