-- Svars- och studsläsning för den kalla utkorgen.
--
-- Bakgrund: vi lämnade Resend för Gmail-API:t (2026-09-10) och tappade
-- därmed leveranswebhooken. Men eftersom vi skickar i en riktig brevlåda
-- ligger allt kvar i tråden: svaret, frånvaromejlet och studsen från
-- mailer-daemon. Trådens id sparas redan på varje utskick, så vi kan läsa
-- utfallet utan spårningspixel och utan plattform.
--
-- Det här löser tre hål som fanns samtidigt:
--   1. Ingenting läste svar. Vi kunde mejla vidare till någon som redan
--      svarat "nej tack", vilket är både pinsamt och 19 § MFL-känsligt.
--   2. Studsar syntes ingenstans, så en död adress mejlades om och om igen
--      och drog ner avsändarryktet på axonadigital.com.
--   3. Mission Control kunde visa utskick men inte utfall.

-- 1. Trådens id som riktig kolumn ------------------------------------------------
-- Låg tidigare bara i metadata-jsonben, vilket inte går att indexera vettigt.

ALTER TABLE public.email_sends
  ADD COLUMN IF NOT EXISTS gmail_thread_id text,
  ADD COLUMN IF NOT EXISTS thread_checked_at timestamptz;

UPDATE public.email_sends
SET gmail_thread_id = metadata->>'gmail_thread_id'
WHERE gmail_thread_id IS NULL
  AND metadata->>'gmail_thread_id' IS NOT NULL;

-- Pollningsurvalet: obesvarade Gmail-utskick, äldst kontrollerade först.
CREATE INDEX IF NOT EXISTS email_sends_thread_poll_idx
  ON public.email_sends (thread_checked_at NULLS FIRST, id)
  WHERE gmail_thread_id IS NOT NULL
    AND replied_at IS NULL
    AND bounced_at IS NULL;

CREATE INDEX IF NOT EXISTS email_sends_gmail_thread_idx
  ON public.email_sends (gmail_thread_id)
  WHERE gmail_thread_id IS NOT NULL;

-- 2. Inkommande post -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.outreach_inbound (
  id bigserial PRIMARY KEY,
  email_send_id bigint REFERENCES public.email_sends(id) ON DELETE SET NULL,
  enrollment_id bigint REFERENCES public.sequence_enrollments(id) ON DELETE SET NULL,
  company_id bigint REFERENCES public.companies(id) ON DELETE SET NULL,
  contact_id bigint REFERENCES public.contacts(id) ON DELETE SET NULL,
  gmail_thread_id text NOT NULL,
  -- Unik: samma meddelande får aldrig behandlas två gånger, hur ofta vi än
  -- pollar tråden.
  gmail_message_id text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('reply', 'bounce', 'auto_reply')),
  from_email text,
  subject text,
  snippet text,
  /** 'negative' när svaret är ett tydligt nej, annars 'unknown'. */
  sentiment text NOT NULL DEFAULT 'unknown'
    CHECK (sentiment IN ('negative', 'unknown')),
  received_at timestamptz,
  handled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outreach_inbound_company_idx
  ON public.outreach_inbound (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS outreach_inbound_kind_idx
  ON public.outreach_inbound (kind, created_at DESC);

ALTER TABLE public.outreach_inbound ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "outreach_inbound_read" ON public.outreach_inbound;
CREATE POLICY "outreach_inbound_read" ON public.outreach_inbound
  FOR SELECT TO authenticated USING (true);

-- 3. Agenten i Mission Control ---------------------------------------------------

INSERT INTO public.mc_agents (id, name, function_area, runner, enabled, autonomy_level)
VALUES ('reply-reader', 'Svarsläsaren', 'sälj', 'edge_fn', true, 'auto')
ON CONFLICT (id) DO NOTHING;

UPDATE public.mc_agents SET
  emoji = COALESCE(emoji, '📥'),
  schedule_label = COALESCE(schedule_label, 'var 10:e minut'),
  description = COALESCE(description,
    'Läser trådarna för skickade kalla mejl. Ett svar pausar sekvensen och lägger en uppgift, ett tydligt nej spärrar bolaget, en studs spärrar adressen.')
WHERE id = 'reply-reader';

-- 4. Cron-wrappern ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.run_poll_gmail_replies()
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
    RAISE WARNING 'run_poll_gmail_replies: missing supabase_url or cron_secret in vault — skipping run';
    RETURN;
  END IF;

  -- Ingen mc_runs-rad när det inte finns någon tråd att kolla, annars 144
  -- tomma rader om dagen. Heartbeatet visar ändå att jobbet lever.
  IF EXISTS (
    SELECT 1 FROM public.email_sends
    WHERE gmail_thread_id IS NOT NULL
      AND replied_at IS NULL
      AND bounced_at IS NULL
      AND sent_at > now() - interval '30 days'
  ) THEN
    INSERT INTO public.mc_runs (agent_id, status, started_at, summary)
    VALUES ('reply-reader', 'running', now(), 'Tick')
    RETURNING id INTO v_run_id;
  END IF;

  PERFORM net.http_post(
    url := edge_function_url || '/functions/v1/poll_gmail_replies',
    body := jsonb_build_object('tick', true, 'mc_run_id', v_run_id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', cron_secret
    ),
    timeout_milliseconds := 120000
  );
END;
$$;

-- Var 10:e minut. Ett svar som ligger tio minuter innan vi ser det är
-- oproblematiskt; sekvenssteg ligger dagar isär.
SELECT cron.unschedule('poll-gmail-replies')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'poll-gmail-replies');

SELECT cron.schedule(
  'poll-gmail-replies',
  '*/10 * * * *',
  $$SELECT public.run_poll_gmail_replies();$$
);
