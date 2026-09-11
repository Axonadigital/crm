-- Leadkretsen får en andra premiss: bra hemsida → interna system.
--
-- Bakgrund (2026-09-11). Kretsen var byggd på EN premiss — dålig hemsida.
-- Sekvenserna täckte poäng 0 och 1–49. Mätt i prod låg 56 av 86 scannade
-- företag över 49 poäng och fångades därför av INGEN sekvens alls. Två
-- tredjedelar av allt vi scannade föll ur loopen, och det var inte skräp:
-- nio tandvårdskliniker, Storsjö Tak, Grännsjö VVS, Backmans Bygg.
--
-- De företagen behöver inget nytt skyltfönster. Många har däremot ett
-- återkommande handjobb som ett internt system tar bort. För att kunna
-- säga något konkret om det måste vi veta branschen — därav klassificeraren.
--
-- Vad migrationen gör:
--   1. companies.industry_segment (+ källa) — sätts av classify_companies
--      från _shared/industrySegment.ts. EN sanningskälla, i TypeScript,
--      inte en andra kopia av logiken i SQL.
--   2. Backfill av allabolag_url ur enrichment_data. 156 företag hade redan
--      länken sparad och kolumnen var tom på samtliga 510.
--   3. enroll_from_scan_results får ett VALFRITT segments-filter i
--      trigger_config. Utan nyckeln beter den sig exakt som förut.
--   4. Sekvens 3: "bra hemsida (50+)", status draft, med två mallar som
--      ställer en branschspecifik FRÅGA — aldrig ett påstående om att de
--      har ett problem, för det vet vi inte.
--
-- Allt är additivt. Inga befintliga rader ändras eller raderas.

-- 1. Branschsegment ----------------------------------------------------------
-- OBS: companies.segment är UPPTAGEN för temperatur (cold_lead/warm_lead/
-- hot_lead/nurture) och rörs inte.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS industry_segment TEXT,
  ADD COLUMN IF NOT EXISTS industry_segment_source TEXT,
  ADD COLUMN IF NOT EXISTS industry_segment_at TIMESTAMPTZ;

COMMENT ON COLUMN public.companies.industry_segment IS
  'Bransch för ERBJUDANDET (bygg, vvs_el, tandvard …). Sätts av edge-funktionen classify_companies via _shared/industrySegment.ts. Skild från companies.segment, som är leadtemperatur.';
COMMENT ON COLUMN public.companies.industry_segment_source IS
  'Var klassningen kom ifrån: sni | allabolag | places | name | none. Avgör hur mycket vi litar på den.';

CREATE INDEX IF NOT EXISTS companies_industry_segment_idx
  ON public.companies (industry_segment)
  WHERE industry_segment IS NOT NULL;

-- 2. Backfill: allabolag-länken vi redan hade --------------------------------
-- Serper sparade den i enrichment_data.serper_discovery.context_links på 156
-- företag utan att någon läste den. Allabolags URL innehåller branschen
-- (/foretag/{namn}/{ort}/{bransch}/{id}), så länken är i sig en datakälla.
UPDATE public.companies c
SET allabolag_url = sub.url
FROM (
  SELECT c2.id,
         (SELECT l->>'url'
          FROM jsonb_array_elements(
                 c2.enrichment_data->'serper_discovery'->'context_links') l
          WHERE l->>'url' LIKE '%allabolag.se/foretag/%'
          LIMIT 1) AS url
  FROM public.companies c2
  WHERE c2.allabolag_url IS NULL
    AND c2.enrichment_data->'serper_discovery'->'context_links' IS NOT NULL
) sub
WHERE c.id = sub.id AND sub.url IS NOT NULL AND c.allabolag_url IS NULL;

-- 3. Segmentfilter i enrollment-motorn ---------------------------------------
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
  v_segments TEXT[];
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

    -- Valfritt branschfilter. Saknas nyckeln är v_segments NULL och
    -- filtret slår inte till — befintliga sekvenser beter sig som förut.
    IF seq.trigger_config ? 'segments' THEN
      v_segments := ARRAY(
        SELECT jsonb_array_elements_text(seq.trigger_config->'segments'));
    ELSE
      v_segments := NULL;
    END IF;

    FOR cand IN
      SELECT ls.company_id, ls.total_score, c.email AS company_email,
             c.website, c.org_number, c.name
      FROM public.company_latest_scan ls
      JOIN public.companies c ON c.id = ls.company_id
      WHERE ls.total_score BETWEEN v_min_score AND v_max_score
        AND ls.scanned_at > now() - make_interval(days => v_max_age)
        AND (v_include_none OR COALESCE(c.website_quality, '') <> 'none')
        -- Branschfilter: sekvenser som kräver segment mejlar aldrig ett
        -- företag vi inte vet branschen på. Utan bransch har vi inget
        -- konkret att fråga om, och då är mejlet inte värt att skicka.
        AND (v_segments IS NULL OR c.industry_segment = ANY(v_segments))
        AND NOT EXISTS (
          SELECT 1 FROM public.sequence_enrollments e
          WHERE e.sequence_id = seq.id
            AND (e.company_id = c.id
                 OR e.contact_id IN (SELECT id FROM public.contacts WHERE company_id = c.id))
        )
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
    'considered', n_considered,
    'enrolled', n_enrolled,
    'would_enroll', n_would,
    'suppressed', n_suppressed,
    'no_contact', n_no_contact,
    'sequences', v_sequences,
    'dry_run', p_dry_run
  );
END $$;

COMMENT ON FUNCTION public.enroll_from_scan_results IS
  'Scan-resultat → enrollment. trigger_config styr poängband, ålder och (valfritt) segments-filter på companies.industry_segment.';

-- 4. Sekvens 3: bra hemsida → interna system ---------------------------------
--
-- Copyn följer samma mätdata som v3 (axona-brain/analyses/2026-09-10):
--   * 51–100 ord. Svarsfrekvensen toppar där och faller över 150.
--   * Frågor, inte påståenden. Vi VET inte att de har ett problem, och ett
--     felaktigt påstående om någons verksamhet är värre än inget mejl.
--   * Inga resultatsiffror. ROI-påståenden mäter -17 %.
--   * Inga modeord. "AI" ensamt mäter -36 %, så systemen beskrivs i klartext.
--   * Ett erbjudande, inte en mötesförfrågan (-44 % att be om möte).
--   * Inga påståenden vi inte kan belägga. Första utkastet sa "bland de
--     bättre vi ser här i länet" — ohållbart vid 65 poäng, och ett av
--     företagen i bandet ligger i Vimmerby, inte i Jämtland.
--   * Ingen signatur i mallen — den läggs på vid sändning.
--
-- {{segment_pain}} kommer ur _shared/segmentCopy.ts. Saknas segmentet
-- stoppas utskicket av spärren i process_sequences i stället för att gå ut
-- med ett hål i texten.
DO $$
DECLARE
  v_t1 BIGINT;
  v_t2 BIGINT;
  v_seq BIGINT;
BEGIN
  SELECT id INTO v_t1 FROM public.email_templates
  WHERE name = 'Scanner: bra hemsida — interna system' LIMIT 1;
  IF v_t1 IS NULL THEN
    INSERT INTO public.email_templates (name, subject, body, category, language)
    VALUES (
      'Scanner: bra hemsida — interna system',
      '{{segment_subject}} hos {{company_name}}',
      E'{{greeting}}\n\n' ||
      E'Jag körde hemsidan för {{company_name}} genom vårt test. Den fick {{scan_score}} av 100, så det är inte den jag hör av mig om.\n\n' ||
      E'Det jag undrar är något annat: {{segment_pain}}\n\n' ||
      E'Vi bygger interna system åt mindre företag — sådant som annars sköts för hand i en pärm eller ett kalkylark. Vill du att jag skissar på hur det kan se ut hos er? Det kostar inget.\n\n' ||
      E'Säg bara till om du inte vill höra mer.',
      'outreach', 'sv'
    )
    RETURNING id INTO v_t1;
  END IF;

  SELECT id INTO v_t2 FROM public.email_templates
  WHERE name = 'Scanner: bra hemsida — uppföljning' LIMIT 1;
  IF v_t2 IS NULL THEN
    INSERT INTO public.email_templates (name, subject, body, category, language)
    VALUES (
      'Scanner: bra hemsida — uppföljning',
      'Re: {{segment_subject}} hos {{company_name}}',
      E'{{greeting}}\n\n' ||
      E'En sista fråga, sedan släpper jag det: {{segment_pain_2}}\n\n' ||
      E'Är svaret att det fungerar som det ska är det ett helt giltigt svar — då stryker jag er från listan.',
      'outreach', 'sv'
    )
    RETURNING id INTO v_t2;
  END IF;

  SELECT id INTO v_seq FROM public.sequences
  WHERE name = 'Scanner: bra hemsida (50+) — interna system' LIMIT 1;
  IF v_seq IS NULL THEN
    INSERT INTO public.sequences (name, description, status, trigger_type, trigger_config)
    VALUES (
      'Scanner: bra hemsida (50+) — interna system',
      'Automatisk: företag med betyg 50+ vars hemsida alltså inte är problemet. Erbjuder ett systemutkast i stället, med en branschspecifik fråga. Mejlar BARA företag vars bransch är klassad — segments-filtret nedan. Aktivera när mallarna är lästa.',
      'draft',
      'scan_result',
      '{"min_score": 50, "max_score": 100, "max_scan_age_days": 60, "include_no_website": false,
        "segments": ["bygg","vvs_el","maleri_golv","transport","fastighet","tandvard","salong","restaurang"]}'::jsonb
    )
    RETURNING id INTO v_seq;

    INSERT INTO public.sequence_steps
      (sequence_id, step_number, delay_days, delay_hours, action_type, template_id, action_config)
    VALUES
      (v_seq, 1, 0, 0, 'send_email', v_t1, '{}'::jsonb),
      (v_seq, 2, 4, 0, 'send_email', v_t2, '{}'::jsonb),
      (v_seq, 3, 7, 0, 'create_task', NULL,
       '{"task_type": "Call", "task_text": "Ring upp — bra hemsida, två systemmejl utan svar. Fråga hur de sköter administrationen i dag.", "due_days": 1}'::jsonb);
  END IF;
END $$;

-- 5. Cron: mejlutvinning, berikning, klassificering ---------------------------
CREATE OR REPLACE FUNCTION public.run_lead_data_job(p_function TEXT, p_body JSONB)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  base_url text;
  cron_secret text;
BEGIN
  SELECT decrypted_secret INTO base_url
  FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO cron_secret
  FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1;
  IF base_url IS NULL OR cron_secret IS NULL THEN
    RAISE WARNING 'run_lead_data_job(%): saknar supabase_url eller cron_secret i vault', p_function;
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := base_url || '/functions/v1/' || p_function,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', cron_secret),
    body := p_body,
    timeout_milliseconds := 150000
  );
END $$;

COMMENT ON FUNCTION public.run_lead_data_job IS
  'Gemensam cron-avfyrare för leadkretsens datajobb (discover_emails, enrich_allabolag, classify_companies). Läser cron-nyckeln ur vault så den aldrig står i klartext i ett schema.';

SELECT cron.unschedule('discover-emails') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'discover-emails');
SELECT cron.unschedule('enrich-allabolag') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'enrich-allabolag');
SELECT cron.unschedule('classify-companies') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'classify-companies');

-- Mejlutvinning varannan timme: 122 företag hade hemsida men ingen adress.
SELECT cron.schedule('discover-emails', '17 */2 * * *',
  $cron$SELECT public.run_lead_data_job('discover_emails', '{"limit":30}'::jsonb)$cron$);

-- Allabolag en gång i timmen, liten batch. Serper kostar per fråga och
-- Google Custom Search är inte aktiverat, så vi tar det lugnt.
SELECT cron.schedule('enrich-allabolag', '37 * * * *',
  $cron$SELECT public.run_lead_data_job('enrich_allabolag', '{"limit":15}'::jsonb)$cron$);

-- Klassificeringen är gratis (ingen extern tjänst) och kan gå ofta.
SELECT cron.schedule('classify-companies', '7 * * * *',
  $cron$SELECT public.run_lead_data_job('classify_companies', '{"limit":200}'::jsonb)$cron$);
