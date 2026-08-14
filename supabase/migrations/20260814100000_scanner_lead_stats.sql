-- get_scanner_lead_stats(): aggregerad statistik för publika scanna-hemsida-
-- lead-requests (scanner_public_requests), inkl. konverteringsgrad och
-- veckotrend. Underlag för Lead-magnet-fliken i Email-statistik-vyn.
-- Helt additiv — en RLS-policy (SELECT-only) + en ny SQL-funktion, inga
-- ändringar av befintliga objekt.

-- scanner_public_requests har RLS påslaget sedan 20260728150000 men saknade
-- policies helt (bara service role kunde läsa). CRM-UI:t (authenticated)
-- behöver kunna läsa den för att visa statistik — samma policyform som
-- redan finns på scanner_scans.
CREATE POLICY "Authenticated can view scanner public requests" ON "public"."scanner_public_requests"
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE OR REPLACE FUNCTION public.get_scanner_lead_stats(
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  WITH scoped AS (
    SELECT r.*, s.total_score, s.verdict_band, s.report_slug, s.company_id
    FROM public.scanner_public_requests r
    LEFT JOIN public.scanner_scans s ON s.id = r.scan_id
    WHERE (p_start IS NULL OR r.created_at >= p_start)
      AND (p_end IS NULL OR r.created_at < p_end)
  ),
  totals AS (
    SELECT
      count(*) AS requests,
      count(*) FILTER (WHERE scan_id IS NOT NULL) AS scans_completed,
      count(*) FILTER (WHERE email IS NOT NULL) AS leads_with_email,
      round(avg(total_score) FILTER (WHERE email IS NOT NULL), 1) AS avg_score_leads
    FROM scoped
  ),
  trend AS (
    SELECT
      date_trunc('week', created_at)::date AS period_start,
      count(*) AS requests,
      count(*) FILTER (WHERE email IS NOT NULL) AS leads
    FROM scoped
    GROUP BY 1
  ),
  latest AS (
    SELECT created_at, url_normalized, email, total_score, verdict_band,
           report_slug, company_id
    FROM scoped
    WHERE email IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 20
  )
  SELECT jsonb_build_object(
    'totals', (
      SELECT jsonb_build_object(
        'requests', requests,
        'scans_completed', scans_completed,
        'leads_with_email', leads_with_email,
        'conversion_rate', round(100.0 * leads_with_email / NULLIF(requests, 0), 1),
        'avg_score_leads', avg_score_leads
      )
      FROM totals
    ),
    'trend', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'period_start', period_start,
        'requests', requests,
        'leads', leads
      ) ORDER BY period_start)
      FROM trend
    ), '[]'::jsonb),
    'latest_leads', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'created_at', created_at,
        'url', url_normalized,
        'email', email,
        'total_score', total_score,
        'verdict_band', verdict_band,
        'report_slug', report_slug,
        'company_id', company_id
      ) ORDER BY created_at DESC)
      FROM latest
    ), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_scanner_lead_stats(timestamptz, timestamptz)
  TO authenticated;

COMMENT ON FUNCTION public.get_scanner_lead_stats(timestamptz, timestamptz) IS
  'Aggregerad statistik för publika scanna-hemsida-lead-requests (scanner_public_requests), inkl. konverteringsgrad och veckotrend. Underlag för Lead-magnet-fliken i Email-statistik-vyn.';
