-- Add email field to companies_summary view
-- The email column was added to companies table in 20260331115146
-- but the view was not updated to include it.

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
  c.email,
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
  -- Operational fields
  c.owner_sales_id,
  c.last_touch_at,
  c.last_touch_type,
  c.next_action_at,
  c.next_action_type,
  c.next_action_note,
  c.pipeline_state,
  c.priority_score,
  c.data_quality_status,
  -- Aggregates
  COUNT(DISTINCT d.id) AS nb_deals,
  COUNT(DISTINCT co.id) AS nb_contacts
FROM companies c
LEFT JOIN deals d ON c.id = d.company_id
LEFT JOIN contacts co ON c.id = co.company_id
GROUP BY c.id;

GRANT SELECT ON companies_summary TO authenticated, anon;
