-- Leadkretsen v2 (2026-09-10) — tre saker Rasmus pekade på efter första dygnet:
--
-- 1. Påfyllaren tog EN sökprofil om dagen. En uttömd profil (allt redan i CRM:et)
--    gav då noll nya leads och inget hände förrän nästa dag. Nu jagar den ett
--    dagsmål (target_new_per_day) över flera profiler (max_profiles_per_day),
--    och profilerna täcker hela länet, inte bara Östersund. Själva loopen
--    ligger i auto_scrape (mode = refill); den här funktionen sätter bara målet.
-- 2. Mejlcopyn: två segment (ingen riktig hemsida / låg poäng), två mejl +
--    ringuppgift per segment, skrivna för att bli lästa. Redigeras i CRM:et
--    under E-postmallar. Fortfarande UTKAST tills de aktiveras.
-- 3. lead_loop_stats(): en enda funktion som ger Mission Control hela bilden
--    (stationer, siffror, reglage, torrkörda mejl) i ett anrop.
--
-- Helt additiv: inga tabeller ändras, inga rader raderas.

-- 1. Påfyllaren -------------------------------------------------------------------

UPDATE public.mc_settings
SET value = value || '{"target_new_per_day": 10, "max_profiles_per_day": 6}'::jsonb,
    updated_at = now()
WHERE key = 'lead_refill'
  AND NOT (value ? 'target_new_per_day');

INSERT INTO public.mc_settings (key, value)
VALUES ('lead_refill', '{"enabled": true, "target_new_per_day": 10, "max_profiles_per_day": 6}'::jsonb)
ON CONFLICT (key) DO NOTHING;

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
  v_target int;
  v_max_profiles int;
  v_run_id bigint;
BEGIN
  SELECT value INTO v_settings FROM public.mc_settings WHERE key = 'lead_refill';
  IF COALESCE((v_settings->>'enabled')::boolean, true) = false THEN
    RETURN;
  END IF;
  v_target := LEAST(GREATEST(COALESCE((v_settings->>'target_new_per_day')::int, 10), 1), 50);
  v_max_profiles := LEAST(GREATEST(COALESCE((v_settings->>'max_profiles_per_day')::int, 6), 1), 20);

  SELECT decrypted_secret INTO edge_function_url
  FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO cron_secret
  FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1;
  IF edge_function_url IS NULL OR cron_secret IS NULL THEN
    RAISE WARNING 'run_auto_scrape: missing supabase_url or cron_secret in vault — skipping run';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.search_profiles WHERE is_active = true) THEN
    RETURN;
  END IF;

  INSERT INTO public.mc_runs (agent_id, status, started_at, summary)
  VALUES ('lead-refill', 'running', now(),
          format('Påfyllning: mål %s nya leads, max %s sökprofiler', v_target, v_max_profiles))
  RETURNING id INTO v_run_id;
  INSERT INTO public.mc_agent_events (agent_id, run_id, event, tool, target)
  VALUES ('lead-refill', v_run_id, 'run', 'auto_scrape', 'refill');

  PERFORM net.http_post(
    url := edge_function_url || '/functions/v1/auto_scrape',
    body := jsonb_build_object(
      'mode', 'refill',
      'target_new', v_target,
      'max_profiles', v_max_profiles,
      'mc_run_id', v_run_id
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', cron_secret
    ),
    timeout_milliseconds := 150000
  );
END;
$$;

-- Sökprofiler för resten av länet (och Sundsvall som närmaste större marknad).
-- Skapas bara om namnet saknas, så egna ändringar i CRM:et överlever.
INSERT INTO public.search_profiles (name, query_template, branch, city, max_results, min_rating, is_active, auto_enrich)
SELECT v.branch_label || ' ' || t.city, '{bransch} i {stad}', v.branch, t.city, 20, 0, true, true
FROM (VALUES
  ('Elektriker',        'elektriker'),
  ('VVS',               'vvs'),
  ('Snickare',          'snickare'),
  ('Målare',            'målare'),
  ('Byggfirma',         'byggfirma'),
  ('Takläggare',        'takläggare'),
  ('Bilverkstad',       'bilverkstad'),
  ('Städfirma',         'städfirma'),
  ('Frisör',            'frisör'),
  ('Tandläkare',        'tandläkare'),
  ('Redovisningsbyrå',  'redovisningsbyrå'),
  ('Restaurang',        'restaurang'),
  ('Fysioterapeut',     'fysioterapeut'),
  ('Fastighetsmäklare', 'fastighetsmäklare'),
  ('Murare',            'murare'),
  ('Markentreprenad',   'markentreprenad'),
  ('Plåtslagare',       'plåtslagare')
) AS v(branch_label, branch)
CROSS JOIN (VALUES
  ('Krokom'), ('Brunflo'), ('Frösön'), ('Åre'), ('Järpen'), ('Strömsund'),
  ('Bräcke'), ('Svenstavik'), ('Hammarstrand'), ('Sveg'), ('Sundsvall')
) AS t(city)
WHERE NOT EXISTS (
  SELECT 1 FROM public.search_profiles p WHERE p.name = v.branch_label || ' ' || t.city
);

-- Tre branscher till för Östersund (murare fanns redan som testprofil).
INSERT INTO public.search_profiles (name, query_template, branch, city, max_results, min_rating, is_active, auto_enrich)
SELECT v.name, '{bransch} i {stad}', v.branch, 'Östersund', 20, 0, true, true
FROM (VALUES
  ('Markentreprenad Östersund', 'markentreprenad'),
  ('Plåtslagare Östersund',     'plåtslagare')
) AS v(name, branch)
WHERE NOT EXISTS (SELECT 1 FROM public.search_profiles p WHERE p.name = v.name);

-- 2. Agenterna får ansikte och schema i Mission Control ---------------------------

UPDATE public.mc_agents SET
  emoji = COALESCE(emoji, '🪣'),
  schedule_label = COALESCE(schedule_label, '08:30 varje dag'),
  description = COALESCE(description,
    'Söker Google Maps efter företag i länet (bransch × ort) tills dagsmålet nya leads är nått, importerar och berikar dem med e-post.')
WHERE id = 'lead-refill';

UPDATE public.mc_agents SET
  emoji = COALESCE(emoji, '🔬'),
  schedule_label = COALESCE(schedule_label, '4 ggr/dag (07, 11, 15, 19)'),
  description = COALESCE(description,
    'Testar hemsidor som saknar rapport och sätter betyg 0–100 med rapportlänk. Oskannade först.')
WHERE id = 'lead-scanner';

UPDATE public.mc_agents SET
  emoji = COALESCE(emoji, '🚪'),
  schedule_label = COALESCE(schedule_label, 'varje timme (:10)'),
  description = COALESCE(description,
    'Tar företag under betygströskeln med e-post, frågar grinden (kund? sagt nej? mejlad nyligen?) och lägger dem i mejlkön.')
WHERE id = 'enroll-engine';

UPDATE public.mc_agents SET
  emoji = COALESCE(emoji, '✉️'),
  schedule_label = COALESCE(schedule_label, 'var 5:e minut'),
  description = COALESCE(description,
    'Skickar mejlen i kön ett steg i taget, med dygnstak och grind före varje steg. I torrläge loggar den bara vad den skulle ha skickat.')
WHERE id = 'sequence-engine';

-- 3. Mejlcopy: två segment, två mejl + ringuppgift ---------------------------------

DO $$
DECLARE
  v_low_seq_id BIGINT;
  v_low_t1 BIGINT;
  v_low_t2 BIGINT;
  v_none_seq_id BIGINT;
  v_none_t1 BIGINT;
  v_none_t2 BIGINT;
BEGIN
  -- 3a. Låg poäng (1–49): uppdatera första mejlet, lägg till uppföljning.
  SELECT id INTO v_low_t1 FROM public.email_templates
  WHERE name = 'Scanner: låg poäng — första kontakt' LIMIT 1;

  IF v_low_t1 IS NULL THEN
    INSERT INTO public.email_templates (name, subject, body, category, language)
    VALUES ('Scanner: låg poäng — första kontakt', '', '', 'outreach', 'sv')
    RETURNING id INTO v_low_t1;
  END IF;

  UPDATE public.email_templates SET
    subject = '{{company_name}}s hemsida får {{scan_score}} av 100. Det här drar ner.',
    body =
      E'{{greeting}}\n\n' ||
      E'Vi körde {{company_name}}s hemsida genom samma test vi använder på våra egna kunder. Den landar på {{scan_score}} av 100. Det som drar ner mest: {{scan_top_issue_lower}}.\n\n' ||
      E'Hela genomgången finns här, gratis och utan inloggning:\n{{report_url}}\n\n' ||
      E'Där står punkt för punkt vad som är bra som det är, vad som kostar er kunder, och vad ni kan fixa själva på en eftermiddag. Det mesta behöver ni inte oss för.\n\n' ||
      E'Jag heter Rasmus och driver Axona Digital i Östersund tillsammans med Isak. Vi bygger och sköter hemsidor åt företag här i länet, och lägger till det som gör att sidan ger jobb: snabb på mobilen, en Google-profil som är rätt uppsatt, en chattbot som fångar frågor på kvällen, och att ni syns när folk frågar AI-tjänster som ChatGPT efter någon i er bransch.\n\n' ||
      E'Vill ni ha ett förslag på hur {{company_name}}s sida kunde se ut bygger vi ett utkast innan vi bokar något. Svara på det här mejlet så hör jag av mig. Vill ni inte ha fler mejl, svara "nej" så stryker jag er direkt.\n\n' ||
      E'Vänliga hälsningar\nRasmus Joonsson\nAxona Digital AB, Östersund\naxonadigital.se',
    updated_at = now()
  WHERE id = v_low_t1;

  SELECT id INTO v_low_t2 FROM public.email_templates
  WHERE name = 'Scanner: låg poäng — uppföljning' LIMIT 1;
  IF v_low_t2 IS NULL THEN
    INSERT INTO public.email_templates (name, subject, body, category, language)
    VALUES (
      'Scanner: låg poäng — uppföljning',
      'Re: {{company_name}}s hemsida får {{scan_score}} av 100',
      E'{{greeting}}\n\n' ||
      E'En kort uppföljning. Rapporten jag skickade häromdagen finns kvar här:\n{{report_url}}\n\n' ||
      E'Om jag fick välja en enda sak i den: {{scan_top_issue_lower}}. Det är det en kund märker först när sidan öppnas i mobilen.\n\n' ||
      E'Två sätt att gå vidare, båda gratis:\n\n' ||
      E'1. Svara "utkast" så bygger vi ett förslag på ny förstasida som ni får se innan något möte.\n' ||
      E'2. Svara "ring" så tar jag femton minuter i telefon och går igenom rapporten med er.\n\n' ||
      E'Hör jag inget stryker jag er från listan. Inga fler mejl.\n\n' ||
      E'Rasmus Joonsson\nAxona Digital AB, Östersund',
      'outreach', 'sv'
    )
    RETURNING id INTO v_low_t2;
  END IF;

  SELECT id INTO v_low_seq_id FROM public.sequences
  WHERE name = 'Scanner: låg poäng (<50)' LIMIT 1;

  IF v_low_seq_id IS NOT NULL THEN
    UPDATE public.sequences SET
      description = 'Automatisk: företag med betyg 1–49 får rapporten mejlad, en uppföljning efter 4 dagar och en ringuppgift efter 7. Aktivera när mallarna är lästa.',
      trigger_config = COALESCE(trigger_config, '{}'::jsonb)
        || '{"max_score": 49, "min_score": 1, "max_scan_age_days": 60, "include_no_website": false}'::jsonb,
      updated_at = now()
    WHERE id = v_low_seq_id;

    -- Steg 1 finns (mejl dag 0). Steg 2 var ringuppgift dag 3 → blir uppföljningsmejl dag 4.
    UPDATE public.sequence_steps SET
      delay_days = 4, delay_hours = 0, action_type = 'send_email',
      template_id = v_low_t2, action_config = '{}'::jsonb
    WHERE sequence_id = v_low_seq_id AND step_number = 2;

    INSERT INTO public.sequence_steps (sequence_id, step_number, delay_days, delay_hours, action_type, template_id, action_config)
    SELECT v_low_seq_id, 3, 7, 0, 'create_task', NULL,
           '{"task_type": "Call", "task_text": "Ring upp — två scanner-mejl utan svar. Rapporten finns på företagskortet.", "due_days": 1}'::jsonb
    WHERE NOT EXISTS (
      SELECT 1 FROM public.sequence_steps WHERE sequence_id = v_low_seq_id AND step_number = 3
    );
  END IF;

  -- 3b. Ingen riktig hemsida (betyg 0): katalogsida, bokningssida eller död domän.
  SELECT id INTO v_none_t1 FROM public.email_templates
  WHERE name = 'Scanner: ingen hemsida — första kontakt' LIMIT 1;
  IF v_none_t1 IS NULL THEN
    INSERT INTO public.email_templates (name, subject, body, category, language)
    VALUES (
      'Scanner: ingen hemsida — första kontakt',
      'Länken Google har till {{company_name}}',
      E'{{greeting}}\n\n' ||
      E'När man söker på {{company_name}} går länken Google visar till {{company_website_host}}. Vi körde den genom vårt hemsidetest, och svaret blev kort: {{scan_verdict}}\n\n' ||
      E'Jag heter Rasmus och driver Axona Digital i Östersund tillsammans med Isak. Vi bygger hemsidor åt hantverkare och småföretag här i länet. Det vi ser hos dem som har en egen sida är enkelt: samtalen kommer från folk som redan bestämt sig, för de har läst vad ni gör och sett era jobb innan de ringer.\n\n' ||
      E'Ett förslag: vi gör ett utkast på en förstasida för {{company_name}}. Det kostar inget och binder er inte till något. Ni ser hur det skulle kunna se ut innan vi ens pratar, och tycker ni inte om det kastar vi det.\n\n' ||
      E'Svara "ja" så sätter jag igång. Vill ni inte ha fler mejl från mig, svara "nej" så stryker jag er direkt.\n\n' ||
      E'Vänliga hälsningar\nRasmus Joonsson\nAxona Digital AB, Östersund\naxonadigital.se',
      'outreach', 'sv'
    )
    RETURNING id INTO v_none_t1;
  END IF;

  SELECT id INTO v_none_t2 FROM public.email_templates
  WHERE name = 'Scanner: ingen hemsida — uppföljning' LIMIT 1;
  IF v_none_t2 IS NULL THEN
    INSERT INTO public.email_templates (name, subject, body, category, language)
    VALUES (
      'Scanner: ingen hemsida — uppföljning',
      'Re: Länken Google har till {{company_name}}',
      E'{{greeting}}\n\n' ||
      E'En kort uppföljning på mitt mejl häromdagen. Jag vill inte tjata, så det här är det sista från mig om jag inte hör något.\n\n' ||
      E'Tre saker en egen hemsida gör för {{company_name}} som en katalogsida aldrig gör:\n\n' ||
      E'1. Ni bestämmer vad som står överst: era jobb, era bilder, ert område.\n' ||
      E'2. Samtal och mejl går direkt till er, inte via en sida som säljer annonsplats till era konkurrenter.\n' ||
      E'3. När någon i {{company_city}} söker efter det ni gör kan Google visa er, inte bara en profil med organisationsnummer.\n\n' ||
      E'Utöver hemsidor hjälper vi företag med sådant som äter tid: en chattbot som svarar på vanliga frågor dygnet runt, automatisk hantering av offerter och bokningar, och att synas i Google och i AI-tjänster som ChatGPT. Men allt det börjar med en sida ni själva äger.\n\n' ||
      E'Vill ni se ett utkast är det bara att svara på det här mejlet. Annars önskar jag lycka till, och tack för tiden.\n\n' ||
      E'Rasmus Joonsson\nAxona Digital AB, Östersund',
      'outreach', 'sv'
    )
    RETURNING id INTO v_none_t2;
  END IF;

  SELECT id INTO v_none_seq_id FROM public.sequences
  WHERE name = 'Scanner: ingen riktig hemsida (0)' LIMIT 1;
  IF v_none_seq_id IS NULL THEN
    INSERT INTO public.sequences (name, description, status, trigger_type, trigger_config)
    VALUES (
      'Scanner: ingen riktig hemsida (0)',
      'Automatisk: företag vars länk går till en katalog-/bokningssida eller en död domän (betyg 0). Erbjuder ett gratis utkast, uppföljning efter 4 dagar, ringuppgift efter 7. Aktivera när mallarna är lästa.',
      'draft',
      'scan_result',
      '{"max_score": 0, "min_score": 0, "max_scan_age_days": 60, "include_no_website": true}'::jsonb
    )
    RETURNING id INTO v_none_seq_id;

    INSERT INTO public.sequence_steps (sequence_id, step_number, delay_days, delay_hours, action_type, template_id, action_config)
    VALUES
      (v_none_seq_id, 1, 0, 0, 'send_email', v_none_t1, '{}'::jsonb),
      (v_none_seq_id, 2, 4, 0, 'send_email', v_none_t2, '{}'::jsonb),
      (v_none_seq_id, 3, 7, 0, 'create_task', NULL,
       '{"task_type": "Call", "task_text": "Ring upp — företaget saknar riktig hemsida, två mejl utan svar. Erbjud utkastet muntligt.", "due_days": 1}'::jsonb);
  END IF;
END $$;

-- 4. Hela leadkretsen i ett anrop (Mission Control) --------------------------------

CREATE OR REPLACE FUNCTION public.lead_loop_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
WITH bounds AS (
  SELECT ((now() AT TIME ZONE 'Europe/Stockholm')::date) AT TIME ZONE 'Europe/Stockholm' AS day_start,
         now() - interval '7 days' AS week_start
),
latest AS (
  SELECT ls.company_id, ls.total_score, ls.scanned_at,
         (COALESCE(c.email, '') <> '' OR EXISTS (
            SELECT 1
            FROM public.contacts ct,
                 jsonb_array_elements(COALESCE(ct.email_jsonb, '[]'::jsonb)) el
            WHERE ct.company_id = c.id AND COALESCE(el->>'email', '') <> ''
         )) AS has_email
  FROM public.company_latest_scan ls
  JOIN public.companies c ON c.id = ls.company_id
  WHERE ls.scanned_at > now() - interval '60 days'
)
SELECT jsonb_build_object(
  'generated_at', now(),
  'settings', jsonb_build_object(
    'sequences',   (SELECT value FROM public.mc_settings WHERE key = 'sequences'),
    'lead_refill', (SELECT value FROM public.mc_settings WHERE key = 'lead_refill')
  ),
  'refill', jsonb_build_object(
    'new_today', (SELECT count(*) FROM public.companies c, bounds b
                  WHERE c.source = 'google_maps' AND c.created_at >= b.day_start),
    'new_7d',    (SELECT count(*) FROM public.companies c, bounds b
                  WHERE c.source = 'google_maps' AND c.created_at >= b.week_start),
    'new_with_email_7d', (SELECT count(*) FROM public.companies c, bounds b
                  WHERE c.source = 'google_maps' AND c.created_at >= b.week_start
                    AND COALESCE(c.email, '') <> ''),
    'profiles_active',    (SELECT count(*) FROM public.search_profiles WHERE is_active),
    'profiles_total',     (SELECT count(*) FROM public.search_profiles),
    'profiles_never_run', (SELECT count(*) FROM public.search_profiles WHERE is_active AND last_run_at IS NULL),
    'last_profiles', (
      SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.last_run_at DESC), '[]'::jsonb)
      FROM (SELECT name, last_run_at, last_run_results
            FROM public.search_profiles
            WHERE last_run_at IS NOT NULL
            ORDER BY last_run_at DESC LIMIT 6) p)
  ),
  'scanner', jsonb_build_object(
    'scanned_today', (SELECT count(*) FROM public.scanner_scans s, bounds b WHERE s.created_at >= b.day_start),
    'scanned_7d',    (SELECT count(*) FROM public.scanner_scans s, bounds b WHERE s.created_at >= b.week_start),
    'queue', (SELECT count(*) FROM public.companies c
              WHERE COALESCE(c.website, '') <> ''
                AND NOT EXISTS (SELECT 1 FROM public.scanner_scans s WHERE s.company_id = c.id)),
    'under_50',            (SELECT count(*) FROM latest WHERE total_score < 50),
    'under_50_with_email', (SELECT count(*) FROM latest WHERE total_score < 50 AND has_email),
    'no_website',          (SELECT count(*) FROM latest WHERE total_score = 0)
  ),
  'enroll', jsonb_build_object(
    'enrolled_today', (SELECT count(*) FROM public.sequence_enrollments e, bounds b WHERE e.enrolled_at >= b.day_start),
    'enrolled_7d',    (SELECT count(*) FROM public.sequence_enrollments e, bounds b WHERE e.enrolled_at >= b.week_start),
    'active',         (SELECT count(*) FROM public.sequence_enrollments WHERE status = 'active'),
    'no_contact_7d',  (SELECT count(*) FROM public.sequence_run_log l, bounds b
                       WHERE l.outcome = 'skipped_no_contact' AND l.created_at >= b.week_start),
    'suppressed_7d',  (SELECT count(*) FROM public.sequence_run_log l, bounds b
                       WHERE l.outcome = 'skipped_suppressed' AND l.created_at >= b.week_start)
  ),
  'sequences', jsonb_build_object(
    'sent_today',    (SELECT count(*) FROM public.sequence_run_log l, bounds b WHERE l.outcome = 'sent' AND l.created_at >= b.day_start),
    'sent_7d',       (SELECT count(*) FROM public.sequence_run_log l, bounds b WHERE l.outcome = 'sent' AND l.created_at >= b.week_start),
    'dry_run_today', (SELECT count(*) FROM public.sequence_run_log l, bounds b WHERE l.outcome = 'dry_run' AND l.created_at >= b.day_start),
    'dry_run_7d',    (SELECT count(*) FROM public.sequence_run_log l, bounds b WHERE l.outcome = 'dry_run' AND l.created_at >= b.week_start),
    'failed_7d',     (SELECT count(*) FROM public.sequence_run_log l, bounds b WHERE l.outcome = 'failed' AND l.created_at >= b.week_start),
    'list', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'status', s.status, 'trigger_config', s.trigger_config,
        'steps', (SELECT count(*) FROM public.sequence_steps st WHERE st.sequence_id = s.id),
        'enrolled', (SELECT count(*) FROM public.sequence_enrollments e WHERE e.sequence_id = s.id)
      ) ORDER BY s.id), '[]'::jsonb)
      FROM public.sequences s WHERE s.trigger_type = 'scan_result')
  ),
  'runs', (
    SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
    FROM (SELECT DISTINCT ON (agent_id) agent_id, id, status, started_at, finished_at, summary, error
          FROM public.mc_runs
          WHERE agent_id IN ('lead-refill', 'lead-scanner', 'enroll-engine', 'sequence-engine')
          ORDER BY agent_id, started_at DESC) r),
  'heartbeats', (
    SELECT COALESCE(jsonb_agg(to_jsonb(h)), '[]'::jsonb)
    FROM (SELECT DISTINCT ON (job) job, status, started_at, finished_at, message
          FROM public.mc_job_heartbeats
          WHERE job IN ('process-sequences', 'enroll-from-scans')
          ORDER BY job, started_at DESC) h),
  'log', (
    SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
    FROM (SELECT l.id, l.created_at, l.step, l.action_type, l.outcome, l.reasons, l.company_id,
                 c.name AS company_name, s.name AS sequence_name,
                 l.detail->>'subject' AS subject, l.detail->>'to' AS to_email,
                 l.detail->>'would' AS would
          FROM public.sequence_run_log l
          LEFT JOIN public.companies c ON c.id = l.company_id
          LEFT JOIN public.sequences s ON s.id = l.sequence_id
          ORDER BY l.created_at DESC LIMIT 30) x),
  'recent_leads', (
    SELECT COALESCE(jsonb_agg(to_jsonb(y)), '[]'::jsonb)
    FROM (SELECT c.id, c.name, c.city, c.industry, c.created_at, c.website,
                 COALESCE(c.email, '') <> '' AS has_email,
                 ls.total_score, ls.report_slug
          FROM public.companies c
          LEFT JOIN public.company_latest_scan ls ON ls.company_id = c.id
          WHERE c.source = 'google_maps'
          ORDER BY c.created_at DESC LIMIT 12) y)
);
$$;

REVOKE ALL ON FUNCTION public.lead_loop_stats() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.lead_loop_stats() TO authenticated, service_role;
