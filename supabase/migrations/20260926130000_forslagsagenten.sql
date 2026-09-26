-- Förslagsagenten: bygger leveransen till steg 2 i outreach-flödet av sig
-- självt (edge function build_proposal_assets var 10:e minut). Bilden
-- renderas på VPS:en, laddas upp till scanner-screenshots och sätts som
-- asset_url på enrollmenten; motorn skickar sedan steg 2 som vanligt.
--
-- Bakgrund: steg 2 väntade på att en människa producerade före/efter-bilden
-- och klistrade in URL:en. Rasmus 2026-09-26: "detta skall ju ske helt per
-- automatik med agenterna". Helt additiv migration.

-- 1. Försöksräknare och byggtid på enrollmenten ------------------------------
ALTER TABLE public.sequence_enrollments
  ADD COLUMN IF NOT EXISTS asset_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS asset_built_at timestamptz;

COMMENT ON COLUMN public.sequence_enrollments.asset_attempts IS
  'Antal byggförsök av förslagsagenten. Vid 3 släpper agenten enrollmenten och produktionsuppgiften ligger kvar för en människa.';
COMMENT ON COLUMN public.sequence_enrollments.asset_built_at IS
  'När förslagsagenten byggde bilden (null om en människa klistrade in asset_url).';

CREATE INDEX IF NOT EXISTS idx_sequence_enrollments_asset_pending
  ON public.sequence_enrollments (next_action_at)
  WHERE status = 'active' AND asset_url IS NULL AND krok_familj IS NOT NULL;

-- 2. Nya utfall i loggen -------------------------------------------------------
ALTER TABLE public.sequence_run_log DROP CONSTRAINT IF EXISTS sequence_run_log_outcome_check;
ALTER TABLE public.sequence_run_log ADD CONSTRAINT sequence_run_log_outcome_check
  CHECK (outcome = ANY (ARRAY[
    'sent', 'executed', 'dry_run', 'skipped_suppressed', 'skipped_cap',
    'completed', 'failed', 'enrolled', 'skipped_no_contact', 'sending',
    'skipped_duplicate', 'stopped_meeting_booked', 'skipped_window',
    'skipped_asset_missing', 'skipped_stale_scan', 'rescan_requested',
    'skipped_reached', 'asset_built', 'asset_failed'
  ]));

-- 3. Agenten i Mission Control (kill switch = enabled=false) -----------------
INSERT INTO public.mc_agents (id, name, function_area, runner, enabled, autonomy_level, description, schedule_label, emoji)
VALUES (
  'forslag-agent', 'Förslagsagenten', 'sälj', 'edge_fn', true, 'auto',
  'Bygger före/efter-bilden till steg 2 i outreach-flödet: leadets sida i mobilen i dag, och en komplett startsida på deras egen logga, egna foton och egna texter. Inget hittas på. Efter tre misslyckanden lämnas bilden till en människa.',
  'var 10:e min', '🖼️'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  schedule_label = EXCLUDED.schedule_label,
  emoji = EXCLUDED.emoji;

-- 4. Cron: samma vault-mönster som run_process_sequences ----------------------
CREATE OR REPLACE FUNCTION public.run_build_proposal_assets()
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
    RAISE WARNING 'run_build_proposal_assets: missing supabase_url or cron_secret in vault — skipping run';
    RETURN;
  END IF;

  -- Anropa bara när något faktiskt väntar: annars 144 tomma anrop om dagen.
  IF NOT EXISTS (
    SELECT 1 FROM public.sequence_enrollments e
    WHERE e.status = 'active' AND e.asset_url IS NULL
      AND e.krok_familj IN ('slow-mobile', 'poor-crux', 'not-mobile', 'parked', 'no-site')
      AND e.asset_attempts < 3
  ) THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := edge_function_url || '/functions/v1/build_proposal_assets',
    body := jsonb_build_object('tick', true),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', cron_secret
    ),
    timeout_milliseconds := 5000
  );
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'build-proposal-assets') THEN
    PERFORM cron.unschedule('build-proposal-assets');
  END IF;
END;
$$;

SELECT cron.schedule(
  'build-proposal-assets',
  '*/10 * * * *',
  $$SELECT public.run_build_proposal_assets();$$
);

-- 5. Tratten visar byggda bilder ---------------------------------------------
COMMENT ON FUNCTION public.run_build_proposal_assets() IS
  'pg_cron var 10:e minut: anropar build_proposal_assets när någon enrollment väntar på bild.';
