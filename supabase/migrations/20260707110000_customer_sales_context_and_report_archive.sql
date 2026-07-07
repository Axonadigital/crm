-- Add internal sales context for visibility/upsell relevance.
-- Additive company columns only; monthly_reports status constraint is extended
-- to support soft-archiving report drafts instead of hard deletion.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS customer_type text,
  ADD COLUMN IF NOT EXISTS local_seo_relevant boolean,
  ADD COLUMN IF NOT EXISTS primary_geo_area text,
  ADD COLUMN IF NOT EXISTS primary_goal text;

COMMENT ON COLUMN public.companies.customer_type IS
  'Internal customer classification, e.g. local_business, ecommerce, saas, b2b_service.';
COMMENT ON COLUMN public.companies.local_seo_relevant IS
  'False when Google Business/local SEO findings should be treated as low relevance for the customer.';
COMMENT ON COLUMN public.companies.primary_geo_area IS
  'Primary geographic market for internal sales recommendations.';
COMMENT ON COLUMN public.companies.primary_goal IS
  'Primary business goal for internal visibility and upsell recommendations.';

ALTER TABLE public.monthly_reports
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now() NOT NULL;

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.monthly_reports'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.monthly_reports DROP CONSTRAINT %I', constraint_name);
  END IF;

  ALTER TABLE public.monthly_reports
    ADD CONSTRAINT monthly_reports_status_check
    CHECK (status IN ('draft', 'approved', 'sent', 'failed', 'skipped', 'archived'));
END $$;

CREATE OR REPLACE FUNCTION public.get_customer_visibility_dashboard(
  p_period date
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  WITH requested_period AS (
    SELECT
      date_trunc('month', p_period)::date AS period_start,
      (date_trunc('month', p_period) + interval '1 month - 1 day')::date AS period_end,
      (date_trunc('month', p_period) - interval '1 month')::date AS previous_start,
      (date_trunc('month', p_period) - interval '1 day')::date AS previous_end
  ),
  delivered_customers AS (
    SELECT
      cd.company_id,
      c.name AS company_name,
      c.local_seo_relevant,
      cd.delivered_website_url,
      cd.launch_date
    FROM public.customer_details cd
    JOIN public.companies c ON c.id = cd.company_id
    WHERE NULLIF(btrim(cd.delivered_website_url), '') IS NOT NULL
  ),
  customer_rows AS (
    SELECT
      dc.company_id,
      dc.company_name,
      dc.local_seo_relevant,
      dc.delivered_website_url,
      dc.launch_date,
      to_jsonb(current_snapshot) AS current_snapshot,
      to_jsonb(previous_snapshot) AS previous_snapshot,
      to_jsonb(latest_analysis) AS latest_analysis,
      to_jsonb(current_report) AS report,
      COALESCE(history.snapshots, '[]'::jsonb) AS history
    FROM delivered_customers dc
    CROSS JOIN requested_period rp
    LEFT JOIN LATERAL (
      SELECT ws.*
      FROM public.website_snapshots ws
      WHERE ws.company_id = dc.company_id
        AND ws.window_kind = 'calendar_month'
        AND ws.period_start = rp.period_start
      ORDER BY ws.fetched_at DESC
      LIMIT 1
    ) current_snapshot ON true
    LEFT JOIN LATERAL (
      SELECT ws.*
      FROM public.website_snapshots ws
      WHERE ws.company_id = dc.company_id
        AND ws.window_kind = 'calendar_month'
        AND ws.period_start = rp.previous_start
      ORDER BY ws.fetched_at DESC
      LIMIT 1
    ) previous_snapshot ON true
    LEFT JOIN LATERAL (
      SELECT ws.*
      FROM public.website_snapshots ws
      WHERE ws.company_id = dc.company_id
        AND COALESCE((ws.data_coverage ->> 'backfilled')::boolean, false) = false
        AND (
          ws.pagespeed IS NOT NULL
          OR ws.performance_score IS NOT NULL
          OR ws.seo_checks IS NOT NULL
          OR ws.business_profile IS NOT NULL
          OR ws.field_data IS NOT NULL
          OR jsonb_array_length(COALESCE(ws.findings, '[]'::jsonb)) > 0
        )
      ORDER BY ws.fetched_at DESC
      LIMIT 1
    ) latest_analysis ON true
    LEFT JOIN LATERAL (
      SELECT mr.*
      FROM public.monthly_reports mr
      WHERE mr.company_id = dc.company_id
        AND mr.period = rp.period_start
        AND mr.status <> 'archived'
      ORDER BY mr.created_at DESC
      LIMIT 1
    ) current_report ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(to_jsonb(monthly_snapshot) ORDER BY monthly_snapshot.period_start) AS snapshots
      FROM (
        SELECT DISTINCT ON (ws.period_start) ws.*
        FROM public.website_snapshots ws
        WHERE ws.company_id = dc.company_id
          AND ws.window_kind = 'calendar_month'
          AND ws.period_start <= rp.period_start
          AND ws.period_start >= (rp.period_start - interval '11 months')::date
        ORDER BY ws.period_start, ws.fetched_at DESC
      ) monthly_snapshot
    ) history ON true
  )
  SELECT jsonb_build_object(
    'period', jsonb_build_object(
      'start', rp.period_start,
      'end', rp.period_end
    ),
    'previous_period', jsonb_build_object(
      'start', rp.previous_start,
      'end', rp.previous_end
    ),
    'rows', COALESCE(
      (SELECT jsonb_agg(to_jsonb(customer_rows) ORDER BY company_name) FROM customer_rows),
      '[]'::jsonb
    )
  )
  FROM requested_period rp;
$$;

GRANT EXECUTE ON FUNCTION public.get_customer_visibility_dashboard(date)
  TO authenticated;
