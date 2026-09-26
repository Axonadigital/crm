-- Outreach v5: fyrstegsflödet "uppmätt fynd".
--
-- Bakgrund: research 2026-09-25 (~/axona-outreach-jev/research/RAPPORT.md).
-- 42–58 % av svaren på kalla mejl kommer från uppföljningar; ett arbetsprov
-- som erbjudande slår mötesförfrågan; 19 § MFL kräver samtycke från fysisk
-- person, så enskilda firmor spärras redan av grinden (outreach_company_form).
--
-- Flödet: dag 0 observationen → dag 3 leveransen (bild eller "vad jag
-- behöver") → dag 10 samtal ELLER referensmejl (A/B) → dag 21 breakup.
-- Copyn per krokfamilj ligger i _shared/krokCopy.ts, inte i mallarna:
-- mallarna är skelett med {{krok_*}}-variabler, precis som segmentCopy.
--
-- Allt additivt. Sekvensen skapas som draft och mc_settings.sequences.dry_run
-- rörs inte — inget går ut förrän någon aktiverar båda.

-- 1. Ny stegtyp: samtal eller mejl (A/B på enrollment-id) ----------------------
ALTER TABLE public.sequence_steps DROP CONSTRAINT IF EXISTS chk_sequence_steps_action_type;
ALTER TABLE public.sequence_steps ADD CONSTRAINT chk_sequence_steps_action_type
  CHECK (action_type IN ('send_email', 'create_task', 'update_lead_status', 'call_or_email'));

-- 2. Enrollmenten bär leveransen och A/B-gruppen -------------------------------
ALTER TABLE public.sequence_enrollments ADD COLUMN IF NOT EXISTS asset_url text;
ALTER TABLE public.sequence_enrollments ADD COLUMN IF NOT EXISTS asset_task_id bigint;
ALTER TABLE public.sequence_enrollments ADD COLUMN IF NOT EXISTS ab_variant text;
ALTER TABLE public.sequence_enrollments ADD COLUMN IF NOT EXISTS krok_familj text;
COMMENT ON COLUMN public.sequence_enrollments.asset_url IS
  'Före/efter-bild eller skiss som steg 2 skickar. Saknas den väntar steget (skipped_asset_missing).';
COMMENT ON COLUMN public.sequence_enrollments.ab_variant IS
  'Steg 3: call eller email. Sätts av motorn första gången steget körs.';

-- 3. Nya utfall i loggen -------------------------------------------------------
ALTER TABLE public.sequence_run_log DROP CONSTRAINT IF EXISTS sequence_run_log_outcome_check;
ALTER TABLE public.sequence_run_log ADD CONSTRAINT sequence_run_log_outcome_check
  CHECK (outcome = ANY (ARRAY[
    'sent', 'executed', 'dry_run', 'skipped_suppressed', 'skipped_cap',
    'completed', 'failed', 'enrolled', 'skipped_no_contact', 'sending',
    'skipped_duplicate', 'stopped_meeting_booked', 'skipped_window',
    'skipped_asset_missing', 'skipped_stale_scan', 'rescan_requested',
    'skipped_reached'
  ]));

-- 4. Mallarna: skelett, copyn kommer från krokCopy.ts --------------------------
INSERT INTO public.email_templates (name, subject, body, category, language)
SELECT name, subject, body, category, 'sv'
FROM (VALUES
  ('Outreach v5 · 1 · observationen', '{{krok_amne}}',
   $b${{greeting}}

{{krok_oppning}}

{{vem}} {{krok_erbjudande}}{{krok_referens}}

{{krok_cta}}

{{opt_out}}$b$, 'outreach'),
  ('Outreach v5 · 2 · leveransen', 'Re: {{krok_amne}}',
   $b${{greeting}}

{{krok_bild_intro}}

{{asset_url}}

{{krok_bild_fraga}}

{{opt_out}}$b$, 'followup'),
  ('Outreach v5 · 3 · referensen', 'Re: {{krok_amne}}',
   $b${{greeting}}

{{krok_referens_block}}

Erbjudandet från förra mejlet står kvar. Vill du att jag sätter igång?

{{opt_out}}$b$, 'followup'),
  ('Outreach v5 · 4 · breakup', 'Re: {{krok_amne}}',
   $b${{greeting}}

{{krok_breakup}}

{{opt_out}}$b$, 'followup')
) AS t(name, subject, body, category)
WHERE NOT EXISTS (SELECT 1 FROM public.email_templates e WHERE e.name = t.name);

-- 5. Sekvensen och stegen ------------------------------------------------------
WITH seq AS (
  INSERT INTO public.sequences (name, description, status, trigger_type, trigger_config)
  SELECT
    'Outreach v5: uppmätt fynd',
    'Fyra steg över 21 dagar. Öppnar med ett uppmätt fynd på deras sajt (skanning högst 24 h gammal), erbjuder ett arbetsprov, skickar det i steg 2, ringer eller refererar i steg 3, avslutar i steg 4. Kräver juridisk person (19 § MFL).',
    'draft',
    'scan_result',
    jsonb_build_object(
      'offer_lanes', jsonb_build_array('ingen_hemsida', 'ny_hemsida', 'google_business', 'hemsideforbattring'),
      'min_score', 0, 'max_score', 100, 'max_scan_age_days', 60, 'include_no_website', true,
      'v5', true
    )
  WHERE NOT EXISTS (SELECT 1 FROM public.sequences s WHERE s.name = 'Outreach v5: uppmätt fynd')
  RETURNING id
),
tpl AS (
  SELECT name, id FROM public.email_templates WHERE name LIKE 'Outreach v5 · %'
)
INSERT INTO public.sequence_steps
  (sequence_id, step_number, delay_days, delay_hours, action_type, template_id, action_config)
SELECT seq.id, s.step_number, s.delay_days, 0, s.action_type,
       (SELECT id FROM tpl WHERE tpl.name = s.template_name), s.action_config
FROM seq
CROSS JOIN LATERAL (VALUES
  (1, 0,  'send_email',    'Outreach v5 · 1 · observationen',
     jsonb_build_object('requires_fresh_scan', true)),
  (2, 3,  'send_email',    'Outreach v5 · 2 · leveransen',
     jsonb_build_object('requires_asset', true, 'asset_task_text',
       'Producera leveransen till steg 2 (före/efter-bild eller skiss) och klistra in URL:en på enrollmenten under Outreach.')),
  (3, 7,  'call_or_email', 'Outreach v5 · 3 · referensen',
     jsonb_build_object('share_call', 0.5, 'task_type', 'call', 'due_days', 1)),
  (4, 11, 'send_email',    'Outreach v5 · 4 · breakup',
     jsonb_build_object('skip_if_reached', true))
) AS s(step_number, delay_days, action_type, template_name, action_config);

-- 6. Inställningar: sändfönster 8–12 vardagar, ägare av uppgifter ---------------
-- Research: veckodag spelar liten roll, förmiddag något bättre. Dygnstaket
-- lämnas (30) — playbookens 3/dag höjs med 20 %/vecka manuellt.
UPDATE public.mc_settings
SET value = value
  || jsonb_build_object('send_window', COALESCE(value->'send_window', '{}'::jsonb)
       || jsonb_build_object('start_hour', 8, 'end_hour', 12))
  || CASE WHEN value ? 'call_owner_email' THEN '{}'::jsonb
          ELSE jsonb_build_object('call_owner_email', 'rasmus@axonadigital.com') END
WHERE key = 'sequences';

-- 7. Tratten: per sekvens, steg och A/B-grupp ----------------------------------
CREATE OR REPLACE VIEW public.outreach_funnel AS
WITH steg AS (
  SELECT l.sequence_id, l.step, e.ab_variant, e.krok_familj, l.outcome, l.company_id, l.created_at
  FROM public.sequence_run_log l
  JOIN public.sequence_enrollments e ON e.id = l.enrollment_id
),
sent AS (
  SELECT sequence_id, step, ab_variant, krok_familj,
         count(*) FILTER (WHERE outcome = 'sent') AS skickade,
         count(*) FILTER (WHERE outcome = 'executed') AS utforda,
         count(*) FILTER (WHERE outcome = 'skipped_asset_missing') AS vantar_bild,
         count(*) FILTER (WHERE outcome = 'skipped_reached') AS hoppade_over
  FROM steg GROUP BY 1, 2, 3, 4
),
svar AS (
  SELECT e.sequence_id, e.ab_variant, e.krok_familj,
         count(*) FILTER (WHERE e.status = 'replied') AS svarade,
         count(*) FILTER (WHERE e.status = 'unsubscribed') AS sa_nej,
         count(*) FILTER (WHERE e.status = 'bounced') AS studsade,
         count(*) FILTER (WHERE c.lead_status IN ('meeting_booked', 'interested', 'proposal_sent', 'closed_won')) AS vidare
  FROM public.sequence_enrollments e
  LEFT JOIN public.companies c ON c.id = e.company_id
  GROUP BY 1, 2, 3
)
SELECT s.name AS sekvens, st.step, st.ab_variant, st.krok_familj,
       st.skickade, st.utforda, st.vantar_bild, st.hoppade_over,
       sv.svarade, sv.sa_nej, sv.studsade, sv.vidare
FROM sent st
JOIN public.sequences s ON s.id = st.sequence_id
LEFT JOIN svar sv ON sv.sequence_id = st.sequence_id
  AND sv.ab_variant IS NOT DISTINCT FROM st.ab_variant
  AND sv.krok_familj IS NOT DISTINCT FROM st.krok_familj
ORDER BY s.name, st.step, st.ab_variant, st.krok_familj;

COMMENT ON VIEW public.outreach_funnel IS
  'Skickade/svar/nej/studs/vidare per sekvens, steg, A/B-grupp och krokfamilj. Riktvärde byrå→SMB: 2,5–4,5 % svar, elit 7 %.';

-- 8. Ringlistan matas direkt: juridisk person med telefon men utan användbar e-post --
-- Sanningsregeln gäller även i telefon: noteringen bygger på ett mailable-fynd.
CREATE OR REPLACE FUNCTION public.outreach_feed_call_queue(p_limit int DEFAULT 20, p_dry_run boolean DEFAULT true)
RETURNS TABLE (company_id bigint, name text, phone text, note text)
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT c.id, c.name, c.phone_number,
           (SELECT f->>'title' FROM jsonb_array_elements(ls.findings) f
             WHERE (f->>'mailable')::boolean LIMIT 1) AS fynd
    FROM public.companies c
    JOIN public.company_latest_scan ls ON ls.company_id = c.id
    WHERE c.lead_status = 'new'
      AND c.phone_number IS NOT NULL AND c.phone_number <> ''
      AND COALESCE(c.prospecting_status, '') <> 'call_ready'
      AND public.outreach_company_form(c.name, c.org_number) = 'juridisk'
      AND ls.scanned_at >= now() - interval '60 days'
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(ls.findings) f WHERE (f->>'mailable')::boolean)
      AND NOT EXISTS (SELECT 1 FROM public.sequence_enrollments e WHERE e.company_id = c.id AND e.status = 'active')
      AND NOT EXISTS (SELECT 1 FROM public.contacts ct WHERE ct.company_id = c.id AND jsonb_array_length(COALESCE(ct.email_jsonb, '[]'::jsonb)) > 0)
      AND (c.email IS NULL OR c.email = '')
      AND NOT EXISTS (SELECT 1 FROM public.call_logs cl WHERE cl.company_id = c.id AND cl.created_at >= now() - interval '90 days')
    ORDER BY ls.scanned_at DESC
    LIMIT p_limit
  LOOP
    n := n + 1;
    company_id := r.id; name := r.name; phone := r.phone_number;
    note := 'Ringlista (ingen e-post): skanningen visar "' || COALESCE(r.fynd, 'fynd') || '". Öppna med det och erbjud ett arbetsprov, inte ett möte.';
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

COMMENT ON FUNCTION public.outreach_feed_call_queue(int, boolean) IS
  'Lägger juridiska personer med telefon men utan e-post i ringlistan (/call-queue) med fyndet som notering. p_dry_run=true visar bara.';

-- 9. Rättigheter: Outreach-sidan läser tratten och matar ringlistan som inloggad --
GRANT SELECT ON public.outreach_funnel TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.outreach_feed_call_queue(int, boolean) TO authenticated, service_role;
