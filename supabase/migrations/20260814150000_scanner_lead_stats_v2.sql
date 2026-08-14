-- Runda 2 av lead-magnet-statistiken:
-- 1) get_email_send_stats får en ny kanal "scanner_report" (scannerns
--    rapportmejl loggas numera i email_sends av scanner-appen själv).
-- 2) get_scanner_lead_stats utökas med mötesbokningskonvertering (matchat
--    mot befintlig Cal.com-integration via contacts.email_jsonb ->
--    calendar_events) och synlighet för väntande/oassignerade
--    uppföljningstasks.
-- Helt additiv — bara omdefinierade (bakåtkompatibla) funktioner, inga
-- ändringar av tabeller/policyer.

CREATE OR REPLACE FUNCTION public.get_email_send_stats(
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
    SELECT
      es.*,
      CASE
        WHEN es.metadata->>'source' = 'monthly_report' THEN 'monthly_report'
        WHEN es.metadata->>'source' = 'docuseal_signing' THEN 'docuseal_signing'
        WHEN es.metadata->>'source' = 'scanner_report' THEN 'scanner_report'
        WHEN es.template_id IS NOT NULL THEN 'template'
        ELSE 'other'
      END AS channel
    FROM public.email_sends es
    WHERE es.sent_at IS NOT NULL
      AND (p_start IS NULL OR es.sent_at >= p_start)
      AND (p_end IS NULL OR es.sent_at < p_end)
  ),
  totals AS (
    SELECT
      count(*) AS sent,
      count(*) FILTER (WHERE delivered_at IS NOT NULL) AS delivered,
      count(*) FILTER (WHERE opened_at IS NOT NULL) AS opened,
      count(*) FILTER (WHERE clicked_at IS NOT NULL) AS clicked,
      count(*) FILTER (WHERE bounced_at IS NOT NULL) AS bounced,
      count(*) FILTER (WHERE status = 'complained') AS complained,
      count(*) FILTER (WHERE replied_at IS NOT NULL) AS replied
    FROM scoped
  ),
  by_channel AS (
    SELECT
      channel,
      count(*) AS sent,
      count(*) FILTER (WHERE delivered_at IS NOT NULL) AS delivered,
      count(*) FILTER (WHERE opened_at IS NOT NULL) AS opened,
      count(*) FILTER (WHERE clicked_at IS NOT NULL) AS clicked,
      count(*) FILTER (WHERE bounced_at IS NOT NULL) AS bounced,
      count(*) FILTER (WHERE replied_at IS NOT NULL) AS replied
    FROM scoped
    GROUP BY channel
  ),
  by_template AS (
    SELECT
      s.template_id,
      t.name AS template_name,
      t.category,
      count(*) AS sent,
      count(*) FILTER (WHERE s.opened_at IS NOT NULL) AS opened,
      count(*) FILTER (WHERE s.clicked_at IS NOT NULL) AS clicked,
      count(*) FILTER (WHERE s.replied_at IS NOT NULL) AS replied
    FROM scoped s
    JOIN public.email_templates t ON t.id = s.template_id
    WHERE s.template_id IS NOT NULL
    GROUP BY s.template_id, t.name, t.category
  ),
  trend AS (
    SELECT
      date_trunc('week', sent_at)::date AS period_start,
      count(*) AS sent,
      count(*) FILTER (WHERE opened_at IS NOT NULL) AS opened,
      count(*) FILTER (WHERE clicked_at IS NOT NULL) AS clicked,
      count(*) FILTER (WHERE replied_at IS NOT NULL) AS replied
    FROM scoped
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'totals', (
      SELECT jsonb_build_object(
        'sent', sent,
        'delivered', delivered,
        'opened', opened,
        'clicked', clicked,
        'bounced', bounced,
        'complained', complained,
        'replied', replied,
        'open_rate', round(100.0 * opened / NULLIF(sent, 0), 1),
        'click_rate', round(100.0 * clicked / NULLIF(sent, 0), 1),
        'bounce_rate', round(100.0 * bounced / NULLIF(sent, 0), 1),
        'reply_rate', round(100.0 * replied / NULLIF(sent, 0), 1)
      )
      FROM totals
    ),
    'by_channel', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'channel', channel,
        'sent', sent,
        'delivered', delivered,
        'opened', opened,
        'clicked', clicked,
        'bounced', bounced,
        'replied', replied,
        'open_rate', round(100.0 * opened / NULLIF(sent, 0), 1),
        'click_rate', round(100.0 * clicked / NULLIF(sent, 0), 1),
        'reply_rate', round(100.0 * replied / NULLIF(sent, 0), 1)
      ) ORDER BY sent DESC)
      FROM by_channel
    ), '[]'::jsonb),
    'by_template', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'template_id', template_id,
        'template_name', template_name,
        'category', category,
        'sent', sent,
        'opened', opened,
        'clicked', clicked,
        'replied', replied,
        'open_rate', round(100.0 * opened / NULLIF(sent, 0), 1),
        'click_rate', round(100.0 * clicked / NULLIF(sent, 0), 1),
        'reply_rate', round(100.0 * replied / NULLIF(sent, 0), 1)
      ) ORDER BY sent DESC)
      FROM by_template
    ), '[]'::jsonb),
    'trend', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'period_start', period_start,
        'sent', sent,
        'opened', opened,
        'clicked', clicked,
        'replied', replied,
        'open_rate', round(100.0 * opened / NULLIF(sent, 0), 1),
        'click_rate', round(100.0 * clicked / NULLIF(sent, 0), 1),
        'reply_rate', round(100.0 * replied / NULLIF(sent, 0), 1)
      ) ORDER BY period_start)
      FROM trend
    ), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_email_send_stats(timestamptz, timestamptz)
  TO authenticated;

COMMENT ON FUNCTION public.get_email_send_stats(timestamptz, timestamptz) IS
  'Aggregerad öppnings-/klick-/svarsstatistik för email_sends, grupperat per kanal (månadsrapport/offert-signering/scanner-rapport/mall) och mall, plus en veckotrend. Underlag för Email-statistik-vyn.';

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
      round(avg(total_score) FILTER (WHERE email IS NOT NULL), 1) AS avg_score_leads,
      count(*) FILTER (WHERE email IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.contacts c
        JOIN public.calendar_events ce ON ce.contact_id = c.id
        WHERE c.email_jsonb @> jsonb_build_array(jsonb_build_object('email', scoped.email))
          AND ce.source = 'calcom'
          AND ce.status <> 'cancelled'
      )) AS meetings_booked
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
           report_slug, company_id,
           EXISTS (
             SELECT 1 FROM public.contacts c
             JOIN public.calendar_events ce ON ce.contact_id = c.id
             WHERE c.email_jsonb @> jsonb_build_array(jsonb_build_object('email', scoped.email))
               AND ce.source = 'calcom'
               AND ce.status <> 'cancelled'
           ) AS meeting_booked
    FROM scoped
    WHERE email IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 20
  ),
  -- Oberoende av p_start/p_end — detta är antal ÖPPNA uppföljningar just nu,
  -- inte hur många som skapades i vald period.
  followups AS (
    SELECT
      count(*) AS open_followups,
      count(*) FILTER (WHERE sales_id IS NULL) AS unassigned_followups
    FROM public.tasks
    WHERE text LIKE 'Följ upp scanner-lead%' AND done_date IS NULL
  )
  SELECT jsonb_build_object(
    'totals', (
      SELECT jsonb_build_object(
        'requests', totals.requests,
        'scans_completed', totals.scans_completed,
        'leads_with_email', totals.leads_with_email,
        'conversion_rate', round(100.0 * totals.leads_with_email / NULLIF(totals.requests, 0), 1),
        'avg_score_leads', totals.avg_score_leads,
        'meetings_booked', totals.meetings_booked,
        'meeting_conversion_rate', round(100.0 * totals.meetings_booked / NULLIF(totals.leads_with_email, 0), 1),
        'open_followups', followups.open_followups,
        'unassigned_followups', followups.unassigned_followups
      )
      FROM totals, followups
    ),
    'trend', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'period_start', period_start, 'requests', requests, 'leads', leads
      ) ORDER BY period_start) FROM trend
    ), '[]'::jsonb),
    'latest_leads', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'created_at', created_at, 'url', url_normalized, 'email', email,
        'total_score', total_score, 'verdict_band', verdict_band,
        'report_slug', report_slug, 'company_id', company_id,
        'meeting_booked', meeting_booked
      ) ORDER BY created_at DESC) FROM latest
    ), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_scanner_lead_stats(timestamptz, timestamptz)
  TO authenticated;

COMMENT ON FUNCTION public.get_scanner_lead_stats(timestamptz, timestamptz) IS
  'Aggregerad statistik för publika scanna-hemsida-lead-requests (scanner_public_requests), inkl. konverteringsgrad, mötesbokningar (matchat mot calendar_events via Cal.com) och väntande uppföljningar. Underlag för Lead-magnet-fliken i Email-statistik-vyn.';
