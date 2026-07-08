-- Migration: get_monthly_analysis_status_summary()
-- Ger Kundradar ett periodiserat sammandrag av report_pipeline_queue
-- (klart/pågående/inte klart per period) så teamet ser om pipelinen
-- tystnat innan en kund märker att rapporten visar förra månadens siffror.
-- Helt additiv — bara en ny SQL-funktion, inga ändringar av tabell/policyer.

CREATE OR REPLACE FUNCTION public.get_monthly_analysis_status_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  WITH snapshot_rows AS (
    SELECT company_id, period_start, period_end, status AS snapshot_status
    FROM public.report_pipeline_queue
    WHERE stage = 'snapshot'
  ),
  report_rows AS (
    SELECT company_id, period_start, status AS report_status
    FROM public.report_pipeline_queue
    WHERE stage = 'report'
  ),
  bucketed AS (
    SELECT
      s.period_start,
      s.period_end,
      CASE
        WHEN s.snapshot_status = 'failed' OR r.report_status = 'failed'
          THEN 'not_done'
        WHEN r.report_status = 'done'
          THEN 'done'
        ELSE 'in_progress'
      END AS bucket
    FROM snapshot_rows s
    LEFT JOIN report_rows r
      ON r.company_id = s.company_id AND r.period_start = s.period_start
  ),
  period_summary AS (
    SELECT
      period_start,
      period_end,
      count(*) AS total_count,
      count(*) FILTER (WHERE bucket = 'done') AS done_count,
      count(*) FILTER (WHERE bucket = 'in_progress') AS in_progress_count,
      count(*) FILTER (WHERE bucket = 'not_done') AS not_done_count
    FROM bucketed
    GROUP BY period_start, period_end
  )
  SELECT jsonb_build_object(
    'periods',
    COALESCE(
      (SELECT jsonb_agg(to_jsonb(period_summary) ORDER BY period_start DESC) FROM period_summary),
      '[]'::jsonb
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_monthly_analysis_status_summary() TO authenticated;

COMMENT ON FUNCTION public.get_monthly_analysis_status_summary() IS
  'Periodiserat sammandrag (klart/pågående/inte klart) av report_pipeline_queue för Kundradar — visar om månadskörningen tystnat.';
