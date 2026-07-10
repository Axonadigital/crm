-- get_email_send_stats(): aggregerad öppnings-/klickstatistik för utskickade
-- mejl (email_sends), grupperat per kanal och mall samt en veckotrend.
-- Underlag för Email-statistik-vyn — steg 1 mot A/B-testning av mejltexter.
-- Helt additiv — bara en ny SQL-funktion, inga ändringar av tabell/policyer.

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
      count(*) FILTER (WHERE status = 'complained') AS complained
    FROM scoped
  ),
  by_channel AS (
    SELECT
      channel,
      count(*) AS sent,
      count(*) FILTER (WHERE delivered_at IS NOT NULL) AS delivered,
      count(*) FILTER (WHERE opened_at IS NOT NULL) AS opened,
      count(*) FILTER (WHERE clicked_at IS NOT NULL) AS clicked,
      count(*) FILTER (WHERE bounced_at IS NOT NULL) AS bounced
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
      count(*) FILTER (WHERE s.clicked_at IS NOT NULL) AS clicked
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
      count(*) FILTER (WHERE clicked_at IS NOT NULL) AS clicked
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
        'open_rate', round(100.0 * opened / NULLIF(sent, 0), 1),
        'click_rate', round(100.0 * clicked / NULLIF(sent, 0), 1),
        'bounce_rate', round(100.0 * bounced / NULLIF(sent, 0), 1)
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
        'open_rate', round(100.0 * opened / NULLIF(sent, 0), 1),
        'click_rate', round(100.0 * clicked / NULLIF(sent, 0), 1)
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
        'open_rate', round(100.0 * opened / NULLIF(sent, 0), 1),
        'click_rate', round(100.0 * clicked / NULLIF(sent, 0), 1)
      ) ORDER BY sent DESC)
      FROM by_template
    ), '[]'::jsonb),
    'trend', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'period_start', period_start,
        'sent', sent,
        'opened', opened,
        'clicked', clicked,
        'open_rate', round(100.0 * opened / NULLIF(sent, 0), 1),
        'click_rate', round(100.0 * clicked / NULLIF(sent, 0), 1)
      ) ORDER BY period_start)
      FROM trend
    ), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_email_send_stats(timestamptz, timestamptz)
  TO authenticated;

COMMENT ON FUNCTION public.get_email_send_stats(timestamptz, timestamptz) IS
  'Aggregerad öppnings-/klickstatistik för email_sends, grupperat per kanal (månadsrapport/offert-signering/mall) och mall, plus en veckotrend. Underlag för Email-statistik-vyn.';
