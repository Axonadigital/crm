-- ============================================================================
-- Veckopuls för SEO-bevakning
-- ============================================================================
-- Problem: website_snapshots fylldes bara en gång i månaden
-- (pipeline-seed-monthly, 06:00 den 5:e). seo-detector i Mission Control kör
-- varje måndag men hade bara ny data att jämföra en måndag av fyra — en
-- trasig sajt kunde alltså ligga oupptäckt i upp till 30 dagar.
--
-- Lösning: ett PARALLELLT veckospår med eget stage-namn ('snapshot_weekly').
-- Varför eget steg och inte bara tätare månadsseed:
--   1. Unika indexet (company_id, period_start, stage) gör en andra seed inom
--      samma månad till en tyst no-op.
--   2. complete_pipeline_queue_item köar automatiskt en KUNDRAPPORT efter
--      varje lyckad rad med stage = 'snapshot'. Veckovisa månadssnapshots
--      hade alltså skickat fyra månadsrapporter per kund och månad.
--      Med ett eget stage-namn träffar veckoraderna aldrig den grenen.
--   3. Månadsspåret ligger kvar orört — kundrapporterna fortsätter exakt som
--      förut på kalendermånad, vilket är vad Search Console rapporterar mot.
--
-- Fönstret är rullande 28 dagar som slutar för 3 dagar sedan, inte "förra
-- veckan":
--   - Search Console släpar upp till 3 dygn → ett fönster som slutar igår ger
--     systematiskt för få klick och falsklarm varje vecka.
--   - 28 dagar (inte 7) håller klickvolymen i samma storleksordning som
--     månadsspåret, så seo-detectorns trösklar (>30 % klicktapp, minst 10
--     klick i föregående period) fortsätter betyda samma sak. Ett 7-dagars-
--     fönster hade varit så brusigt att inkorgen fyllts av veckodagseffekter.
--   Fönstren överlappar mellan veckorna — det är avsiktligt: vi mäter
--   FÖRÄNDRING varje vecka, inte disjunkta perioder.
--
-- Ingen befintlig tabell, kolumn eller policy ändras. Allt här är nytt eller
-- en utökning av run_pipeline_tick med ett extra CASE-ben.
-- ============================================================================

-- Fyller kön en gång i veckan: en veckopuls-rad per kund med levererad
-- hemsida. Perioden räknas ut EN gång här och sparas på raden, så alla kunder
-- får exakt samma fönster oavsett hur länge kön tar att tömma (samma mönster
-- som seed_monthly_pipeline_queue).
CREATE OR REPLACE FUNCTION public.seed_weekly_pipeline_queue()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  -- 3 dygns marginal för Search Consoles eftersläpning.
  v_period_end date := (now() - interval '3 days')::date;
  v_period_start date := (now() - interval '3 days')::date - 27;
BEGIN
  INSERT INTO public.report_pipeline_queue
    (company_id, period_start, period_end, stage, status)
  SELECT cd.company_id, v_period_start, v_period_end, 'snapshot_weekly', 'pending'
  FROM public.customer_details cd
  WHERE cd.delivered_website_url IS NOT NULL
  ON CONFLICT (company_id, period_start, stage) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.seed_weekly_pipeline_queue() IS
  'Veckopuls: köar en rullande 28-dagars snapshot per levererad kundsajt. '
  'Genererar ALDRIG kundrapporter — bara underlag till seo-detector i Mission Control.';

-- Utökar tick-routern med veckosteget. Enda ändringen mot tidigare version är
-- det nya CASE-benet + body som talar om vilket steg edge-funktionen ska
-- plocka ur kön.
CREATE OR REPLACE FUNCTION public.run_pipeline_tick(p_stage text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  edge_function_url text;
  cron_secret text;
  target_path text;
  body jsonb;
BEGIN
  SELECT decrypted_secret INTO edge_function_url
  FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO cron_secret
  FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1;

  IF edge_function_url IS NULL OR cron_secret IS NULL THEN
    RAISE WARNING 'run_pipeline_tick(%): missing supabase_url or cron_secret in vault — skipping run', p_stage;
    RETURN;
  END IF;

  target_path := CASE p_stage
    WHEN 'snapshot' THEN '/functions/v1/analyze_website'
    WHEN 'snapshot_weekly' THEN '/functions/v1/analyze_website'
    WHEN 'report' THEN '/functions/v1/generate_monthly_reports'
    ELSE NULL
  END;

  IF target_path IS NULL THEN
    RAISE WARNING 'run_pipeline_tick: okänt steg %', p_stage;
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
$$;

-- ============================================================================
-- Cron-schema
-- ============================================================================
-- Måndag 03:00 — seed. Kön betas av 3 sajter per tick var 5:e minut, dvs ~55
-- min för 32 sajter → allt klart runt 04:00, i god tid före seo-detector på
-- VPS:en som kör måndag 08:00 och läser resultatet.
SELECT cron.schedule(
  'pipeline-seed-weekly',
  '0 3 * * 1',
  $$SELECT public.seed_weekly_pipeline_queue();$$
);

SELECT cron.schedule(
  'pipeline-tick-snapshot-weekly',
  '*/5 * * * *',
  $$SELECT public.run_pipeline_tick('snapshot_weekly');$$
);
