-- Edge-funktioner som dör på Vercels/Supabase tidsgräns hinner aldrig
-- avsluta sin mc_runs-rad. Den här funktionen markerar rader som stått i
-- "running" > 15 min som failed med tydlig orsak, så MC inte visar
-- spökkörningar. Applicerad i prod via MCP 2026-09-09.
CREATE OR REPLACE FUNCTION public.mc_close_stale_runs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE v_count integer;
BEGIN
  WITH closed AS (
    UPDATE public.mc_runs
    SET status = 'failed',
        finished_at = now(),
        error = 'Avbruten: ingen avslutning inom 15 min (tidsgräns i edge-funktionen?)'
    WHERE status = 'running'
      AND started_at < now() - interval '15 minutes'
      AND agent_id IN (SELECT id FROM public.mc_agents WHERE runner = 'edge_fn')
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM closed;
  RETURN v_count;
END;
$$;

SELECT cron.schedule(
  'mc-close-stale-runs',
  '*/30 * * * *',
  $$SELECT public.mc_close_stale_runs();$$
);
