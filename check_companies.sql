-- Check companies and their lead_status
SELECT id, name, lead_status, has_website, industry, source
FROM companies
ORDER BY created_at DESC
LIMIT 20;
