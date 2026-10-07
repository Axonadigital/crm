-- Cron-bantning efter två frysningar av Micro-instansen (2026-10-05, 2026-10-07).
--
-- Varför: 22 cron-jobb körde ~1 750 gånger per dygn, varav de flesta på tomgång.
-- Pipeline-tickarna väckte en edge-funktion var 5:e minut dygnet runt trots att
-- kön bara har jobb några timmar per månad. Veckopulsen har aldrig fungerat:
-- seed_weekly_pipeline_queue skriver stage 'snapshot_weekly' som
-- check-constrainten inte tillät, så jobbet felade varje måndag och dess tick
-- hittade alltid en tom kö. cron.job_run_details (86 941 rader) och
-- mc_job_heartbeats rensades aldrig.
--
-- Vad: (1) tillåt 'snapshot_weekly' i kön, (2) vakt i run_pipeline_tick så
-- inget HTTP-anrop görs när kön är tom, (3) glesare scheman, (4) nattligt
-- städjobb för systemloggar, (5) index som gör mc_close_stale_runs billig.

-- 1. Veckopulsen: utöka check-constrainten. Att vidga en CHECK kräver drop +
--    add; ingen data rörs och de gamla värdena är fortfarande tillåtna.
ALTER TABLE public.report_pipeline_queue
  DROP CONSTRAINT IF EXISTS report_pipeline_queue_stage_check;
ALTER TABLE public.report_pipeline_queue
  ADD CONSTRAINT report_pipeline_queue_stage_check
  CHECK (stage = ANY (ARRAY['snapshot'::text, 'snapshot_weekly'::text, 'report'::text]));

-- 2. Vakt: hoppa över edge-anropet när det inte finns något att hämta.
--    'processing' tas med så att claim_pipeline_queue_batch fortfarande får
--    chansen att återställa anspråk som fastnat (>15 min).
CREATE OR REPLACE FUNCTION public.run_pipeline_tick(p_stage text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  edge_function_url text;
  cron_secret text;
  target_path text;
  queue_stage text;
  body jsonb;
BEGIN
  target_path := CASE p_stage
    WHEN 'snapshot' THEN '/functions/v1/analyze_website'
    WHEN 'snapshot_weekly' THEN '/functions/v1/analyze_website'
    WHEN 'report' THEN '/functions/v1/generate_monthly_reports'
    ELSE NULL
  END;

  IF target_path IS NULL THEN
    RAISE WARNING 'run_pipeline_tick: okant steg %', p_stage;
    RETURN;
  END IF;

  queue_stage := p_stage;

  IF NOT EXISTS (
    SELECT 1 FROM public.report_pipeline_queue q
    WHERE q.stage = queue_stage
      AND q.status IN ('pending', 'processing')
  ) THEN
    RETURN;
  END IF;

  SELECT decrypted_secret INTO edge_function_url
  FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO cron_secret
  FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1;

  IF edge_function_url IS NULL OR cron_secret IS NULL THEN
    RAISE WARNING 'run_pipeline_tick(%): missing supabase_url or cron_secret in vault - skipping run', p_stage;
    RETURN;
  END IF;

  body := jsonb_build_object('tick', true, 'batch_size', 3);
  IF p_stage = 'snapshot_weekly' THEN
    body := body || jsonb_build_object('mode', 'weekly');
  END IF;

  PERFORM net.http_post(
    url     := edge_function_url || target_path,
    body    := body,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', cron_secret
    ),
    timeout_milliseconds := 20000
  );
END;
$function$;

-- 3. Glesare scheman (alla tider i UTC; Stockholm = UTC+1/+2).
--    Sändfönstret för sekvenser är vardagar 08–12 lokal tid, så motorn
--    behöver inte vakna nattetid eller på helger.
SELECT cron.alter_job(jobid, schedule := '*/10 * * * *')
  FROM cron.job WHERE jobname IN ('pipeline-tick-snapshot', 'pipeline-tick-report');

-- Veckopulsen seedas måndag 03:00 UTC; 31 kunder à 3 per tick dräneras på ~2 h.
SELECT cron.alter_job(jobid, schedule := '*/10 3-9 * * 1')
  FROM cron.job WHERE jobname = 'pipeline-tick-snapshot-weekly';

SELECT cron.alter_job(jobid, schedule := '*/10 5-16 * * 1-5')
  FROM cron.job WHERE jobname = 'process-sequences';

SELECT cron.alter_job(jobid, schedule := '*/30 5-16 * * 1-5')
  FROM cron.job WHERE jobname = 'poll-gmail-replies';

SELECT cron.alter_job(jobid, schedule := '5 * * * *')
  FROM cron.job WHERE jobname = 'fortnox-sync-invoices';

SELECT cron.alter_job(jobid, schedule := '*/30 * * * *')
  FROM cron.job WHERE jobname = 'build-proposal-assets';

SELECT cron.alter_job(jobid, schedule := '20 * * * *')
  FROM cron.job WHERE jobname IN ('mc-close-stale-runs', 'mc-expire-approvals');

-- 4. Nattligt städjobb. pg_cron rensar aldrig sin egen körlogg.
CREATE OR REPLACE FUNCTION public.cleanup_system_logs()
RETURNS TABLE (cron_rows_deleted bigint, heartbeat_rows_deleted bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_cron bigint;
  v_hb bigint;
BEGIN
  DELETE FROM cron.job_run_details
  WHERE end_time < now() - interval '7 days';
  GET DIAGNOSTICS v_cron = ROW_COUNT;

  DELETE FROM public.mc_job_heartbeats
  WHERE created_at < now() - interval '14 days';
  GET DIAGNOSTICS v_hb = ROW_COUNT;

  RETURN QUERY SELECT v_cron, v_hb;
END;
$function$;

SELECT cron.schedule(
  'cleanup-system-logs',
  '15 2 * * *',
  $$SELECT public.cleanup_system_logs();$$
);

-- 5. mc_close_stale_runs letar bara efter 'running' äldre än 15 min; utan index
--    skannade den hela mc_runs (tog 15,7 s den 7 okt).
CREATE INDEX IF NOT EXISTS mc_runs_running_started_idx
  ON public.mc_runs (started_at)
  WHERE status = 'running';
