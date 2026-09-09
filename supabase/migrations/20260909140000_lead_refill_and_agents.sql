-- Fas 4 + 5 i leadkretsen: påfyllning på schema, och allt synligt i Mission Control.
--
-- auto_scrape hade redan hela påfyllningskedjan (sökprofiler → Places →
-- dedupe → import → berikning med e-post via Serper) men ingen cron och bara
-- användar-JWT. Nu: run_auto_scrape() roterar EN aktiv sökprofil om dagen
-- (kostnadstak i sig: ~20 Places-uppslag/dag), auto_scrape tar x-cron-secret,
-- och varje automatisk körning i kretsen skapar en mc_runs-rad så MC:s
-- agentpanel visar påfyllning, skanning, enrollment och sekvensmotor bredvid
-- de befintliga agenterna. Helt additiv.

-- 1. Agenterna ------------------------------------------------------------------
INSERT INTO public.mc_agents (id, name, function_area, runner, enabled, autonomy_level)
VALUES
  ('lead-refill',     'Påfyllaren',    'sälj', 'edge_fn', true, 'auto'),
  ('lead-scanner',    'Skannern',      'seo',  'edge_fn', true, 'auto'),
  ('enroll-engine',   'Enrollaren',    'sälj', 'edge_fn', true, 'auto'),
  ('sequence-engine', 'Sekvensmotorn', 'sälj', 'edge_fn', true, 'approval')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.mc_settings (key, value)
VALUES ('lead_refill', '{"enabled": true, "profiles_per_day": 1}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 2. Sökprofiler för Östersund (skapas bara om namnet saknas) -----------------
INSERT INTO public.search_profiles (name, query_template, branch, city, max_results, min_rating, is_active, auto_enrich)
SELECT v.name, '{bransch} i {stad}', v.branch, 'Östersund', 20, 0, true, true
FROM (VALUES
  ('Elektriker Östersund',       'elektriker'),
  ('VVS Östersund',              'vvs'),
  ('Snickare Östersund',         'snickare'),
  ('Målare Östersund',           'målare'),
  ('Byggfirma Östersund',        'byggfirma'),
  ('Takläggare Östersund',       'takläggare'),
  ('Bilverkstad Östersund',      'bilverkstad'),
  ('Städfirma Östersund',        'städfirma'),
  ('Frisör Östersund',           'frisör'),
  ('Tandläkare Östersund',       'tandläkare'),
  ('Redovisningsbyrå Östersund', 'redovisningsbyrå'),
  ('Restaurang Östersund',       'restaurang'),
  ('Fysioterapeut Östersund',    'fysioterapeut'),
  ('Fastighetsmäklare Östersund','fastighetsmäklare')
) AS v(name, branch)
WHERE NOT EXISTS (SELECT 1 FROM public.search_profiles p WHERE p.name = v.name);

-- 3. Påfyllning: en profil per körning, äldst körd först --------------------
CREATE OR REPLACE FUNCTION public.run_auto_scrape()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  edge_function_url text;
  cron_secret text;
  v_settings jsonb;
  v_profile record;
  v_run_id bigint;
BEGIN
  SELECT value INTO v_settings FROM public.mc_settings WHERE key = 'lead_refill';
  IF COALESCE((v_settings->>'enabled')::boolean, true) = false THEN
    RETURN;
  END IF;

  SELECT decrypted_secret INTO edge_function_url
  FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO cron_secret
  FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1;
  IF edge_function_url IS NULL OR cron_secret IS NULL THEN
    RAISE WARNING 'run_auto_scrape: missing supabase_url or cron_secret in vault — skipping run';
    RETURN;
  END IF;

  -- Rotation: den aktiva profil som körts för längst sedan (aldrig körd först).
  SELECT id, name INTO v_profile
  FROM public.search_profiles
  WHERE is_active = true
  ORDER BY last_run_at NULLS FIRST, id
  LIMIT 1;
  IF v_profile.id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.search_profiles SET last_run_at = now(), updated_at = now()
  WHERE id = v_profile.id;

  INSERT INTO public.mc_runs (agent_id, status, started_at, summary)
  VALUES ('lead-refill', 'running', now(), 'Sökprofil: ' || v_profile.name)
  RETURNING id INTO v_run_id;
  INSERT INTO public.mc_agent_events (agent_id, run_id, event, tool, target)
  VALUES ('lead-refill', v_run_id, 'run', 'auto_scrape', v_profile.name);

  PERFORM net.http_post(
    url := edge_function_url || '/functions/v1/auto_scrape',
    body := jsonb_build_object('profile_id', v_profile.id, 'mc_run_id', v_run_id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', cron_secret
    ),
    timeout_milliseconds := 150000
  );
END;
$$;

SELECT cron.schedule(
  'lead-refill',
  '30 6 * * *',
  $$SELECT public.run_auto_scrape();$$
);

-- 4. Sekvensmotorn och enrollaren syns som agenter ---------------------------
CREATE OR REPLACE FUNCTION public.run_process_sequences()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  edge_function_url text;
  cron_secret text;
  v_run_id bigint;
BEGIN
  SELECT decrypted_secret INTO edge_function_url
  FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO cron_secret
  FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1;
  IF edge_function_url IS NULL OR cron_secret IS NULL THEN
    RAISE WARNING 'run_process_sequences: missing supabase_url or cron_secret in vault — skipping run';
    RETURN;
  END IF;

  -- En mc_runs-rad per tick bara när något är förfallet — annars 288 tomma
  -- rader om dagen. Heartbeatet täcker "motorn lever".
  IF EXISTS (
    SELECT 1 FROM public.sequence_enrollments e
    JOIN public.sequences s ON s.id = e.sequence_id
    WHERE e.status = 'active' AND s.status = 'active' AND e.next_action_at <= now()
  ) THEN
    INSERT INTO public.mc_runs (agent_id, status, started_at, summary)
    VALUES ('sequence-engine', 'running', now(), 'Tick')
    RETURNING id INTO v_run_id;
    INSERT INTO public.mc_agent_events (agent_id, run_id, event, tool, target)
    VALUES ('sequence-engine', v_run_id, 'run', 'process_sequences', 'tick');
  END IF;

  PERFORM net.http_post(
    url := edge_function_url || '/functions/v1/process_sequences',
    body := jsonb_build_object('tick', true, 'mc_run_id', v_run_id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', cron_secret
    ),
    timeout_milliseconds := 60000
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.run_enroll_from_scans()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_started TIMESTAMPTZ := now();
  v_result JSONB;
  v_run_id BIGINT;
BEGIN
  v_result := public.enroll_from_scan_results(20, false);
  INSERT INTO public.mc_job_heartbeats (job, status, started_at, finished_at, message, meta)
  VALUES ('enroll-from-scans', 'ok', v_started, now(),
          format('%s enrollade, %s spärrade, %s utan kontakt',
                 v_result->>'enrolled', v_result->>'suppressed', v_result->>'no_contact'),
          v_result);
  -- mc_runs bara när något faktiskt hände, samma skäl som ovan.
  IF COALESCE((v_result->>'considered')::int, 0) > 0 THEN
    INSERT INTO public.mc_runs (agent_id, status, started_at, finished_at, summary)
    VALUES ('enroll-engine', 'succeeded', v_started, now(),
            format('%s kandidater: %s enrollade, %s spärrade, %s utan kontakt',
                   v_result->>'considered', v_result->>'enrolled',
                   v_result->>'suppressed', v_result->>'no_contact'))
    RETURNING id INTO v_run_id;
    INSERT INTO public.mc_agent_events (agent_id, run_id, event, tool, target)
    VALUES ('enroll-engine', v_run_id, 'run', 'enroll_from_scan_results', 'scan_result');
  END IF;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.mc_job_heartbeats (job, status, started_at, finished_at, message)
  VALUES ('enroll-from-scans', 'failed', v_started, now(), left(SQLERRM, 500));
  INSERT INTO public.mc_runs (agent_id, status, started_at, finished_at, error)
  VALUES ('enroll-engine', 'failed', v_started, now(), left(SQLERRM, 500));
END;
$$;
