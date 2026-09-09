-- Fas 2 i leadkretsen: scan-resultat → sekvens, automatiskt.
--
-- Scannern skriver redan tillbaka (scanner_scans + companies.website_score).
-- Det som saknades var LÄNKEN: ingenting tog ett dåligt betyg och gjorde en
-- enrollment av det. Den här migrationen ger:
--   1. vyn company_latest_scan (senaste scan per företag)
--   2. trigger_type 'scan_result' på sequences, med trigger_config
--      {"max_score": 50, "min_score": 0, "max_scan_age_days": 60,
--       "include_no_website": false}
--   3. enroll_from_scan_results(): hittar kandidater, frågar grinden MED
--      karens (ny enrollment), skapar kontakt från companies.email om det
--      behövs, enrollar. p_dry_run=true räknar utan att skriva.
--   4. cron 'enroll-from-scans' varje timme.
--   5. en UTKAST-sekvens + mall att aktivera i CRM:et när Rasmus läst den.
-- Helt additiv.

-- 1. Senaste scan per företag ------------------------------------------------
CREATE OR REPLACE VIEW public.company_latest_scan
WITH (security_invoker = true) AS
SELECT DISTINCT ON (company_id)
  company_id,
  id AS scan_id,
  total_score,
  verdict,
  verdict_band,
  report_slug,
  scanned_at,
  axis_scores,
  findings
FROM public.scanner_scans
WHERE company_id IS NOT NULL
ORDER BY company_id, scanned_at DESC;

GRANT SELECT ON public.company_latest_scan TO authenticated, service_role;
COMMENT ON VIEW public.company_latest_scan IS
  'Senaste scanner_scans-raden per företag. Används av enroll_from_scan_results() och av process_sequences (report_url/scan_score i mallar).';

-- 2. Ny trigger-typ + nya loggutfall -----------------------------------------
ALTER TABLE public.sequences DROP CONSTRAINT IF EXISTS chk_sequences_trigger_type;
ALTER TABLE public.sequences ADD CONSTRAINT chk_sequences_trigger_type
  CHECK (trigger_type IN ('manual', 'new_lead', 'segment_change', 'scan_result'));

DO $$
DECLARE v_name text;
BEGIN
  SELECT conname INTO v_name FROM pg_constraint
  WHERE conrelid = 'public.sequence_run_log'::regclass
    AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%outcome%';
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.sequence_run_log DROP CONSTRAINT %I', v_name);
  END IF;
END $$;
ALTER TABLE public.sequence_run_log ADD CONSTRAINT sequence_run_log_outcome_check
  CHECK (outcome = ANY (ARRAY[
    'sent', 'executed', 'dry_run', 'skipped_suppressed', 'skipped_cap',
    'completed', 'failed', 'enrolled', 'skipped_no_contact'
  ]));
CREATE INDEX IF NOT EXISTS sequence_run_log_seq_company_idx
  ON public.sequence_run_log (sequence_id, company_id, outcome, created_at DESC);

-- 3. Enrollment-motorn ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enroll_from_scan_results(
  p_limit INTEGER DEFAULT 20,
  p_dry_run BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  seq RECORD;
  cand RECORD;
  v_contact_id BIGINT;
  v_email TEXT;
  v_verdict JSONB;
  v_enrollment_id BIGINT;
  v_max_score INTEGER;
  v_min_score INTEGER;
  v_max_age INTEGER;
  v_include_none BOOLEAN;
  n_considered INTEGER := 0;
  n_enrolled INTEGER := 0;
  n_would INTEGER := 0;
  n_suppressed INTEGER := 0;
  n_no_contact INTEGER := 0;
  v_sequences TEXT[] := '{}';
BEGIN
  FOR seq IN
    SELECT * FROM public.sequences
    WHERE trigger_type = 'scan_result'
      AND (status = 'active' OR (p_dry_run AND status IN ('draft', 'active')))
    ORDER BY id
  LOOP
    v_sequences := array_append(v_sequences, seq.name || ' (' || seq.status || ')');
    v_max_score := COALESCE((seq.trigger_config->>'max_score')::int, 50);
    v_min_score := COALESCE((seq.trigger_config->>'min_score')::int, 0);
    v_max_age := COALESCE((seq.trigger_config->>'max_scan_age_days')::int, 60);
    v_include_none := COALESCE((seq.trigger_config->>'include_no_website')::boolean, false);

    FOR cand IN
      SELECT ls.company_id, ls.total_score, c.email AS company_email,
             c.website, c.org_number, c.name
      FROM public.company_latest_scan ls
      JOIN public.companies c ON c.id = ls.company_id
      WHERE ls.total_score BETWEEN v_min_score AND v_max_score
        AND ls.scanned_at > now() - make_interval(days => v_max_age)
        AND (v_include_none OR COALESCE(c.website_quality, '') <> 'none')
        -- Aldrig samma företag två gånger i samma sekvens, oavsett status.
        AND NOT EXISTS (
          SELECT 1 FROM public.sequence_enrollments e
          WHERE e.sequence_id = seq.id
            AND (e.company_id = c.id
                 OR e.contact_id IN (SELECT id FROM public.contacts WHERE company_id = c.id))
        )
        -- Hoppa över det vi redan avfärdat senaste 30 dagarna (spärrad /
        -- saknar kontakt) så loggen inte fylls med samma rad varje timme.
        AND NOT EXISTS (
          SELECT 1 FROM public.sequence_run_log l
          WHERE l.sequence_id = seq.id AND l.company_id = c.id
            AND l.outcome IN ('skipped_suppressed', 'skipped_no_contact')
            AND l.created_at > now() - interval '30 days'
        )
      ORDER BY ls.total_score ASC, ls.scanned_at DESC
      LIMIT p_limit
    LOOP
      EXIT WHEN n_enrolled + n_would >= p_limit;
      n_considered := n_considered + 1;
      v_contact_id := NULL; v_email := NULL; v_enrollment_id := NULL;

      -- Befintlig kontakt med e-post, annars företagets egen adress.
      SELECT ct.id, lower(el->>'email') INTO v_contact_id, v_email
      FROM public.contacts ct,
           jsonb_array_elements(COALESCE(ct.email_jsonb, '[]'::jsonb)) el
      WHERE ct.company_id = cand.company_id AND COALESCE(el->>'email', '') <> ''
      ORDER BY ct.id
      LIMIT 1;

      IF v_contact_id IS NULL THEN
        v_email := NULLIF(lower(trim(cand.company_email)), '');
        IF v_email IS NULL OR position('@' in v_email) = 0 THEN
          n_no_contact := n_no_contact + 1;
          IF NOT p_dry_run THEN
            INSERT INTO public.sequence_run_log
              (sequence_id, company_id, step, action_type, outcome, detail)
            VALUES (seq.id, cand.company_id, 0, 'enroll', 'skipped_no_contact',
                    jsonb_build_object('company', cand.name, 'score', cand.total_score));
          END IF;
          CONTINUE;
        END IF;
      END IF;

      -- Grinden, MED karens: ny enrollment ska inte gå till någon vi mejlat
      -- senaste 90 dagarna.
      v_verdict := public.is_suppressed(v_email, cand.website, cand.org_number, cand.company_id, true);
      IF (v_verdict->>'suppressed')::boolean THEN
        n_suppressed := n_suppressed + 1;
        IF NOT p_dry_run THEN
          INSERT INTO public.sequence_run_log
            (sequence_id, contact_id, company_id, step, action_type, outcome, reasons, detail)
          VALUES (seq.id, v_contact_id, cand.company_id, 0, 'enroll', 'skipped_suppressed',
                  ARRAY(SELECT jsonb_array_elements_text(v_verdict->'reasons')),
                  jsonb_build_object('company', cand.name, 'email', v_email));
        END IF;
        CONTINUE;
      END IF;

      IF p_dry_run THEN
        n_would := n_would + 1;
        CONTINUE;
      END IF;

      IF v_contact_id IS NULL THEN
        INSERT INTO public.contacts
          (first_name, last_name, email_jsonb, company_id, background, first_seen, last_seen)
        VALUES (
          split_part(v_email, '@', 1), '',
          jsonb_build_array(jsonb_build_object('email', v_email, 'type', 'Work')),
          cand.company_id,
          'Auto-skapad från företagets e-post för sekvensen "' || seq.name || '"',
          now(), now()
        )
        RETURNING id INTO v_contact_id;
      END IF;

      INSERT INTO public.sequence_enrollments
        (sequence_id, contact_id, company_id, current_step, status, next_action_at)
      VALUES (seq.id, v_contact_id, cand.company_id, 0, 'active', now())
      ON CONFLICT (sequence_id, contact_id) DO NOTHING
      RETURNING id INTO v_enrollment_id;
      IF v_enrollment_id IS NULL THEN CONTINUE; END IF;

      n_enrolled := n_enrolled + 1;
      INSERT INTO public.sequence_run_log
        (enrollment_id, sequence_id, contact_id, company_id, step, action_type, outcome, detail)
      VALUES (v_enrollment_id, seq.id, v_contact_id, cand.company_id, 0, 'enroll', 'enrolled',
              jsonb_build_object('company', cand.name, 'score', cand.total_score, 'email', v_email));
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'sequences', to_jsonb(v_sequences),
    'considered', n_considered,
    'enrolled', n_enrolled,
    'would_enroll', n_would,
    'suppressed', n_suppressed,
    'no_contact', n_no_contact
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enroll_from_scan_results FROM public;
GRANT EXECUTE ON FUNCTION public.enroll_from_scan_results TO authenticated, service_role;

-- 4. Cron + heartbeat ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_enroll_from_scans()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_started TIMESTAMPTZ := now();
  v_result JSONB;
BEGIN
  v_result := public.enroll_from_scan_results(20, false);
  INSERT INTO public.mc_job_heartbeats (job, status, started_at, finished_at, message, meta)
  VALUES ('enroll-from-scans', 'ok', v_started, now(),
          format('%s enrollade, %s spärrade, %s utan kontakt',
                 v_result->>'enrolled', v_result->>'suppressed', v_result->>'no_contact'),
          v_result);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.mc_job_heartbeats (job, status, started_at, finished_at, message)
  VALUES ('enroll-from-scans', 'failed', v_started, now(), left(SQLERRM, 500));
END;
$$;

SELECT cron.schedule(
  'enroll-from-scans',
  '10 * * * *',
  $$SELECT public.run_enroll_from_scans();$$
);

-- 5. Utkast att aktivera --------------------------------------------------------
DO $$
DECLARE
  v_template_id BIGINT;
  v_sequence_id BIGINT;
BEGIN
  IF EXISTS (SELECT 1 FROM public.sequences WHERE name = 'Scanner: låg poäng (<50)') THEN
    RETURN;
  END IF;

  INSERT INTO public.email_templates (name, subject, body, category, language)
  VALUES (
    'Scanner: låg poäng — första kontakt',
    'Hur {{company_name}}s hemsida står sig — konkret genomgång',
    E'{{greeting}}\n\n' ||
    E'Jag heter Rasmus och driver Axona Digital här i Östersund. Vi gick igenom {{company_name}}s hemsida med vårt hemsidetest, och den landar på {{scan_score}} av 100.\n\n' ||
    E'Hela genomgången — vad som drar ner, och vad som är bra som det är — finns här:\n{{report_url}}\n\n' ||
    E'Det är ingen säljpitch. Rapporten är gratis att läsa, och det mesta går att åtgärda på egen hand. Vill ni hellre att vi gör ett utkast på hur sidan skulle kunna se ut bygger vi det innan vi ens bokar ett möte — så ser ni vad ni får.\n\n' ||
    E'Svara på det här mejlet så hör jag av mig. Vill ni inte ha fler mejl från oss, säg det så stryker jag er direkt.\n\n' ||
    E'Vänliga hälsningar\nRasmus Joonsson\nAxona Digital AB',
    'outreach', 'sv'
  )
  RETURNING id INTO v_template_id;

  INSERT INTO public.sequences (name, description, status, trigger_type, trigger_config)
  VALUES (
    'Scanner: låg poäng (<50)',
    'Automatisk: företag vars senaste scan ligger under 50/100 får rapporten mejlad, sedan en ringuppgift. Aktivera när mallen är läst.',
    'draft',
    'scan_result',
    '{"max_score": 50, "min_score": 0, "max_scan_age_days": 60, "include_no_website": false}'::jsonb
  )
  RETURNING id INTO v_sequence_id;

  INSERT INTO public.sequence_steps (sequence_id, step_number, delay_days, delay_hours, action_type, template_id, action_config)
  VALUES
    (v_sequence_id, 1, 0, 0, 'send_email', v_template_id, '{}'::jsonb),
    (v_sequence_id, 2, 3, 0, 'create_task', NULL,
     '{"task_type": "Call", "task_text": "Ring upp — scanner-mejlet gick för 3 dagar sedan utan svar", "due_days": 1}'::jsonb);
END $$;
