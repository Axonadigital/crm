-- Nystartade bolag i Jämtlands län: berikning och fördelning.
-- Bolagen kommer in via import_new_companies (GitHub-jobbet varje måndag,
-- källa scb_nystartat). Nya bolag saknar nästan alltid hemsida, mejl och
-- Google-profil de första veckorna, så de berikas om varje vecka i upp till
-- 120 dagar och fördelas först när en kontaktväg dykt upp:
--   aktiebolag/handelsbolag med mejl  → mejlflödet (Outreach v5); de hamnar
--                                        i kontrollkön eftersom mejl ett
--                                        säger att hemsida saknas
--   enskild firma med telefon         → ringlistan (mejl kräver samtycke,
--                                        19 § MFL; de saknar orgnr i CRM:et
--                                        så grinden kan aldrig mejla dem)
--   AB/HB med bara telefon efter 21 d → ringlistan
-- Helt additiv: två funktioner och två cron-jobb.

-- 1. Berikning, dagligen, högst 20 bolag -------------------------------------
CREATE OR REPLACE FUNCTION public.run_enrich_new_companies(p_limit int DEFAULT 20)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  base_url text;
  cron_secret text;
  r record;
  n int := 0;
BEGIN
  SELECT decrypted_secret INTO base_url FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO cron_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1;
  IF base_url IS NULL OR cron_secret IS NULL THEN
    RAISE WARNING 'run_enrich_new_companies: saknar supabase_url eller cron_secret i vault';
    RETURN 0;
  END IF;
  FOR r IN
    SELECT c.id FROM public.companies c
    WHERE c.source = 'scb_nystartat'
      AND c.created_at > now() - interval '120 days'
      AND COALESCE(c.email, '') = ''
      AND (c.enriched_at IS NULL OR c.enriched_at < now() - interval '7 days')
    ORDER BY c.enriched_at NULLS FIRST, c.created_at DESC
    LIMIT p_limit
  LOOP
    PERFORM net.http_post(
      url := base_url || '/functions/v1/enrich_company',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', cron_secret),
      body := jsonb_build_object('company_id', r.id),
      timeout_milliseconds := 60000
    );
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- 2. Fördelning, dagligen ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.route_new_companies(p_enroll_limit int DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_seq bigint;
  r record;
  v_contact bigint;
  n_enrolled int := 0;
  n_calls int := 0;
BEGIN
  SELECT id INTO v_seq FROM public.sequences WHERE name = 'Outreach v5: uppmätt fynd' LIMIT 1;

  -- 2a. AB/HB med mejl → mejlflödet.
  IF v_seq IS NOT NULL THEN
    FOR r IN
      SELECT c.id, c.name, lower(trim(c.email)) AS email
      FROM public.companies c
      WHERE c.source = 'scb_nystartat'
        AND c.org_number IS NOT NULL
        AND COALESCE(c.enrichment_data->'scb'->>'form', '') IN ('ab', 'hb')
        AND c.lead_status = 'new'
        AND COALESCE(trim(c.email), '') ~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$'
        AND NOT EXISTS (SELECT 1 FROM public.sequence_enrollments e WHERE e.company_id = c.id AND e.sequence_id = v_seq)
        AND NOT EXISTS (SELECT 1 FROM public.outreach_suppressions s WHERE s.company_id = c.id)
      ORDER BY c.created_at
      LIMIT p_enroll_limit
    LOOP
      SELECT ct.id INTO v_contact FROM public.contacts ct
      WHERE ct.company_id = r.id AND jsonb_array_length(COALESCE(ct.email_jsonb, '[]'::jsonb)) > 0
      ORDER BY ct.id LIMIT 1;
      IF v_contact IS NULL THEN
        INSERT INTO public.contacts (company_id, first_name, last_name, email_jsonb, first_seen, last_seen)
        VALUES (r.id, '', r.name, jsonb_build_array(jsonb_build_object('email', r.email, 'type', 'Work')), now(), now())
        RETURNING id INTO v_contact;
      END IF;
      INSERT INTO public.sequence_enrollments (sequence_id, contact_id, company_id, status, current_step, next_action_at)
      VALUES (v_seq, v_contact, r.id, 'active', 0, now());
      n_enrolled := n_enrolled + 1;
      v_contact := NULL;
    END LOOP;
  END IF;

  -- 2b. Enskild firma med telefon, och AB/HB som efter 21 dagar bara har
  --     telefon → ringlistan.
  WITH ready AS (
    SELECT c.id, c.enrichment_data->'scb'->>'form' AS form, c.enrichment_data->'scb'->>'reg_date' AS reg
    FROM public.companies c
    WHERE c.source = 'scb_nystartat'
      AND c.lead_status = 'new'
      AND COALESCE(c.prospecting_status, '') <> 'call_ready'
      -- Minst åtta siffror: berikningen tolkade tidigare datum som nummer.
      AND length(regexp_replace(COALESCE(c.phone_number, ''), '\D', '', 'g')) >= 8
      AND (
        c.enrichment_data->'scb'->>'form' = 'enskild'
        OR (COALESCE(c.email, '') = '' AND c.created_at < now() - interval '21 days')
      )
      AND NOT EXISTS (SELECT 1 FROM public.call_logs cl WHERE cl.company_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.outreach_suppressions s WHERE s.company_id = c.id)
  )
  UPDATE public.companies c
  SET prospecting_status = 'call_ready',
      next_action_type = 'call',
      next_action_at = now(),
      next_action_note = CASE WHEN ready.form = 'enskild'
        THEN 'Nystartad enskild firma (registrerad ' || COALESCE(ready.reg, '?') || '). Mejl kräver samtycke: ring, gratulera till starten och fråga om vi får skicka ett förslag.'
        ELSE 'Nystartat bolag (registrerat ' || COALESCE(ready.reg, '?') || ') utan mejladress. Ring, gratulera till starten och be om en adress.'
      END
  FROM ready WHERE c.id = ready.id;
  GET DIAGNOSTICS n_calls = ROW_COUNT;

  RETURN jsonb_build_object('enrolled', n_enrolled, 'call_ready', n_calls);
END $$;

REVOKE ALL ON FUNCTION public.run_enrich_new_companies(int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.route_new_companies(int) FROM PUBLIC, anon, authenticated;

-- 3. Schemaläggning ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'enrich-new-companies') THEN PERFORM cron.unschedule('enrich-new-companies'); END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'route-new-companies') THEN PERFORM cron.unschedule('route-new-companies'); END IF;
END $$;
-- 05:40 och 06:40 svensk tid (UTC+2 sommartid): berikat före fördelningen,
-- båda före sändfönstret 08–12.
SELECT cron.schedule('enrich-new-companies', '40 3 * * *', 'SELECT public.run_enrich_new_companies(20);');
SELECT cron.schedule('route-new-companies', '40 4 * * *', 'SELECT public.route_new_companies(10);');

-- 4. Ny källa i companies.source (listan utökas, inget tas bort) -------------
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS chk_companies_source;
ALTER TABLE public.companies ADD CONSTRAINT chk_companies_source
  CHECK (source IS NULL OR source = ANY (ARRAY[
    'manual', 'google_maps', 'google_search', 'import', 'website', 'referral',
    'hitta', 'allabolag', 'eniro', 'field', 'scanner_public', 'scb_nystartat'
  ]));
