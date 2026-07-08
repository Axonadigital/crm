-- Historisk GSC-backfill för samtliga levererade kunder.
--
-- Search Console-API:et har ~16 månaders historik oavsett när vi började
-- mäta (till skillnad från PageSpeed/CWV som är ögonblicksmätningar och
-- inte går att hämta bakåt). backfillCompany() i analyze_website/index.ts
-- hämtar redan detta per kund (knappen "Hämta historik" i CRM), men att
-- loopa alla ~31 kunder — eller alla 16 månader per kund sekventiellt i ETT
-- edge-function-anrop — riskerar samma misstag som orsakade att bara 8/31
-- kunder bearbetades i det gamla enda-svepet (report_pipeline_queue,
-- 20260707100000): ett enskilt kund-anrop med 16 sekventiella GSC-månader
-- kan själv nå Supabase edge-funktioners ~150s wall-clock-gräns. Kön här
-- delar därför upp arbetet per (kund, månad) — samma granularitet som redan
-- är bevisad i report_pipeline_queue — så varje köobjekt bara gör EN
-- GSC-månad (några sekunder) istället för 16.
--
-- Engångsjobb: ingen automatisk återseedning finns. En rad som slutar
-- 'failed' måste plockas upp manuellt (UPDATE ... SET status='pending') —
-- det syns i Discord-varningen (se check_stuck_backfill_items nedan) precis
-- som misslyckade rapport-körningar redan gör.

CREATE TABLE IF NOT EXISTS public.backfill_queue (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status = ANY (ARRAY['pending', 'processing', 'done', 'failed'])),
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  claimed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.backfill_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view backfill queue" ON public.backfill_queue;
CREATE POLICY "Authenticated can view backfill queue"
  ON public.backfill_queue FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated can update backfill queue" ON public.backfill_queue;
CREATE POLICY "Authenticated can update backfill queue"
  ON public.backfill_queue FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Samma skydd som report_pipeline_queue: den öppna UPDATE-policyn ovan
-- (behövs så CRM:t kan trigga "Kör om") får bara röra status/error/attempts/
-- tidsstämplar, aldrig vilken kund/period raden pekar på.
CREATE OR REPLACE FUNCTION public.prevent_backfill_queue_identity_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF NEW.company_id <> OLD.company_id
     OR NEW.period_start <> OLD.period_start
     OR NEW.period_end <> OLD.period_end THEN
    RAISE EXCEPTION 'backfill_queue: company_id/period_start/period_end kan inte ändras efter att raden skapats';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_backfill_queue_identity_lock ON public.backfill_queue;
CREATE TRIGGER trg_backfill_queue_identity_lock
  BEFORE UPDATE ON public.backfill_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_backfill_queue_identity_change();

CREATE UNIQUE INDEX IF NOT EXISTS idx_backfill_queue_company_period
  ON public.backfill_queue (company_id, period_start);
CREATE INDEX IF NOT EXISTS idx_backfill_queue_claim ON public.backfill_queue (status);
CREATE INDEX IF NOT EXISTS idx_backfill_queue_stuck ON public.backfill_queue (status, created_at);

-- En rad per (levererad kund, kalendermånad), p_months bakåt från innevarande
-- månad. Idempotent — ON CONFLICT DO NOTHING gör omkörning säker, men
-- återqueuear INTE rader som redan är 'failed' eller 'done' (medvetet val,
-- se kommentar ovan).
CREATE OR REPLACE FUNCTION public.seed_backfill_queue(p_months SMALLINT DEFAULT 16)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  INSERT INTO public.backfill_queue (company_id, period_start, period_end, status)
  SELECT
    cd.company_id,
    (date_trunc('month', now()) - (gs || ' months')::interval)::date AS period_start,
    ((date_trunc('month', now()) - ((gs - 1) || ' months')::interval) - interval '1 day')::date AS period_end,
    'pending'
  FROM public.customer_details cd
  CROSS JOIN generate_series(1, p_months::int) AS gs
  WHERE cd.delivered_website_url IS NOT NULL
  ON CONFLICT (company_id, period_start) DO NOTHING;
END;
$$;

-- Samma självläkande 15-min-mönster som claim_pipeline_queue_batch.
CREATE OR REPLACE FUNCTION public.claim_backfill_batch(p_batch_size INTEGER DEFAULT 10)
RETURNS SETOF public.backfill_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  UPDATE public.backfill_queue
  SET status = 'pending'
  WHERE status = 'processing'
    AND claimed_at < now() - interval '15 minutes';

  RETURN QUERY
  UPDATE public.backfill_queue q
  SET status = 'processing',
      claimed_at = now(),
      attempts = q.attempts + 1
  WHERE q.id IN (
    SELECT id FROM public.backfill_queue
    WHERE status = 'pending'
    ORDER BY id
    FOR UPDATE SKIP LOCKED
    LIMIT p_batch_size
  )
  RETURNING q.*;
END;
$$;

-- Fencing token (p_claimed_at) — samma CRITICAL-fix som
-- complete_pipeline_queue_item: förhindrar att en självläkt/omclaimad rad
-- skriver över ett nyare resultat.
CREATE OR REPLACE FUNCTION public.complete_backfill_item(
  p_id BIGINT,
  p_success BOOLEAN,
  p_error TEXT DEFAULT NULL,
  p_claimed_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  UPDATE public.backfill_queue
  SET status = CASE WHEN p_success THEN 'done' ELSE 'failed' END,
      error = p_error,
      completed_at = now()
  WHERE id = p_id
    AND status = 'processing'
    AND (p_claimed_at IS NULL OR claimed_at = p_claimed_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.run_backfill_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  edge_function_url text;
  cron_secret text;
BEGIN
  SELECT decrypted_secret INTO edge_function_url
  FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO cron_secret
  FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1;

  IF edge_function_url IS NULL OR cron_secret IS NULL THEN
    RAISE WARNING 'run_backfill_tick: missing supabase_url or cron_secret in vault — skipping run';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := edge_function_url || '/functions/v1/analyze_website',
    body := jsonb_build_object('tick', true, 'mode', 'backfill', 'batch_size', 10),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', cron_secret
    ),
    timeout_milliseconds := 20000
  );
END;
$$;

-- Var 5:e minut, samma kadens som pipeline-tick-snapshot/report. ~31 kunder ×
-- upp till 16 månader ≈ 496 rader, batch 10 → grovt 4-5h att tömma. Kör
-- vidare/no-op när kön är tom (ingen självavregistrering — engångsjobb, tas
-- bort manuellt med cron.unschedule när klart).
SELECT cron.schedule('pipeline-tick-backfill', '*/5 * * * *', $$SELECT public.run_backfill_tick();$$);

-- Samma varningsmönster som check_stuck_pipeline_items — Discord-notis om
-- rader fastnat i pending/failed >24h eller processing >2h, så en
-- misslyckad kund inte tystnar bort precis som i ursprungsincidenten.
CREATE OR REPLACE FUNCTION public.check_stuck_backfill_items()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  webhook_url text;
  stuck_count integer;
  summary text;
BEGIN
  SELECT count(*) INTO stuck_count
  FROM public.backfill_queue
  WHERE (status IN ('pending', 'failed') AND created_at < now() - interval '24 hours')
     OR (status = 'processing' AND claimed_at < now() - interval '2 hours');

  IF stuck_count = 0 THEN
    RETURN;
  END IF;

  SELECT public.get_discord_webhook_url() INTO webhook_url;
  IF webhook_url IS NULL THEN
    RETURN;
  END IF;

  SELECT string_agg(
    format('%s — %s (%s): %s', c.name, q.period_start, q.status, coalesce(q.error, 'väntar fortfarande')),
    E'\n'
  ) INTO summary
  FROM (
    SELECT * FROM public.backfill_queue
    WHERE (status IN ('pending', 'failed') AND created_at < now() - interval '24 hours')
       OR (status = 'processing' AND claimed_at < now() - interval '2 hours')
    ORDER BY created_at
    LIMIT 15
  ) q
  JOIN public.companies c ON c.id = q.company_id;

  PERFORM net.http_post(
    url := webhook_url,
    body := jsonb_build_object(
      'embeds', jsonb_build_array(jsonb_build_object(
        'title', format('%s rader fastnade i GSC-backfillen', stuck_count),
        'description', coalesce(summary, '') || E'\n\nÅtgärda manuellt: UPDATE backfill_queue SET status=''pending'' WHERE id=...',
        'color', 15158332
      ))
    ),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 10000
  );
END;
$$;

SELECT cron.schedule('backfill-stuck-alert', '15 9 * * *', $$SELECT public.check_stuck_backfill_items();$$);
