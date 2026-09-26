-- Enskilda firmor och bolag utan organisationsnummer får inte mejlas kallt
-- (19 § MFL: fysisk person kräver samtycke). I stället för att tappa dem
-- går de till ringlistan: ett samtal är tillåtet (21 §), och i samtalet kan
-- vi fråga om vi får mejla bilden. Två vägar in:
--   1. outreach_feed_call_queue_consent(): batch ur companies (kör från
--      /outreach eller cron).
--   2. Motorn: när grinden spärrar en enrollment med sole_trader_no_consent
--      eller unverified_company_form och telefon finns (process_sequences).
-- Additivt: ny funktion, inget ändrat.

CREATE OR REPLACE FUNCTION public.outreach_consent_call_note(p_fynd text, p_form text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT 'Ring (' || CASE WHEN p_form = 'enskild' THEN 'enskild firma' ELSE 'bolagsform okänd' END
    || ', får inte mejlas utan samtycke): skanningen visar "' || COALESCE(p_fynd, 'ett fynd') ||
    '". Nämn fyndet, erbjud ett arbetsprov och fråga om vi får mejla det. Ja ⇒ sätt email_outreach_consent_at på bolaget.';
$$;

CREATE OR REPLACE FUNCTION public.outreach_feed_call_queue_consent(p_limit int DEFAULT 20, p_dry_run boolean DEFAULT true)
RETURNS TABLE (company_id bigint, name text, phone text, form text, note text)
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.id, c.name, c.phone_number,
           public.outreach_company_form(c.name, c.org_number) AS form,
           (SELECT f->>'title' FROM jsonb_array_elements(ls.findings) f
             WHERE (f->>'mailable')::boolean LIMIT 1) AS fynd
    FROM public.companies c
    JOIN public.company_latest_scan ls ON ls.company_id = c.id
    WHERE c.lead_status = 'new'
      AND c.phone_number IS NOT NULL AND c.phone_number <> ''
      AND COALESCE(c.prospecting_status, '') <> 'call_ready'
      AND c.email_outreach_consent_at IS NULL
      AND public.outreach_company_form(c.name, c.org_number) IN ('enskild', 'okand')
      AND ls.scanned_at >= now() - interval '60 days'
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(ls.findings) f WHERE (f->>'mailable')::boolean)
      AND NOT EXISTS (SELECT 1 FROM public.call_logs cl WHERE cl.company_id = c.id AND cl.created_at >= now() - interval '90 days')
      AND NOT EXISTS (SELECT 1 FROM public.outreach_suppressions s WHERE s.company_id = c.id AND s.reason IN ('said_no', 'bad_fit', 'unsubscribed'))
    ORDER BY ls.scanned_at DESC
    LIMIT p_limit
  LOOP
    company_id := r.id; name := r.name; phone := r.phone_number; form := r.form;
    note := public.outreach_consent_call_note(r.fynd, r.form);
    IF NOT p_dry_run THEN
      UPDATE public.companies
      SET prospecting_status = 'call_ready', next_action_type = 'call', next_action_note = note
      WHERE id = r.id;
    END IF;
    RETURN NEXT;
  END LOOP;
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.outreach_feed_call_queue_consent(int, boolean) IS
  'Enskilda firmor och okänd bolagsform med telefon → ringlistan, med uppmaning att be om samtycke till mejl. p_dry_run=true visar bara.';

GRANT EXECUTE ON FUNCTION public.outreach_feed_call_queue_consent(int, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.outreach_consent_call_note(text, text) TO authenticated, service_role;
