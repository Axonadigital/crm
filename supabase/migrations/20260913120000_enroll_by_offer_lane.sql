-- Inskrivningen kan nu filtrera på behovsbana, inte bara poängband.
--
-- trigger_config får en valfri nyckel:
--   {"offer_lanes": ["google_business"]}
--
-- Saknas nyckeln beter sig sekvensen exakt som förut, så de tre befintliga
-- poängbaserade sekvenserna påverkas inte av den här migrationen.
--
-- Banan kommer från public.lead_offer() (migration 20260913100000), som läser
-- skannerns egna service-taggar.
CREATE OR REPLACE FUNCTION public.enroll_from_scan_results(p_limit integer DEFAULT 20, p_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_offer_lanes TEXT[];
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
    -- Behovsbana. Saknas nyckeln är v_offer_lanes NULL och filtret slår inte
    -- till, så befintliga poängbaserade sekvenser beter sig exakt som förut.
    IF seq.trigger_config ? 'offer_lanes' THEN
      v_offer_lanes := ARRAY(
        SELECT jsonb_array_elements_text(seq.trigger_config->'offer_lanes'));
    ELSE
      v_offer_lanes := NULL;
    END IF;

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
        -- Erbjudandet ska matcha behovet, inte bara poängen. En sajt som inte
        -- svarar är "ny_hemsida" oavsett att totalpoängen råkar vara 60.
        AND (v_offer_lanes IS NULL
             OR public.lead_offer(ls.findings)->>'lane' = ANY(v_offer_lanes))
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
END $function$
;
