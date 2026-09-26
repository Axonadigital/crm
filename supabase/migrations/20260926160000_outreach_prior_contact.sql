-- Tidigare kontakt: ett lead vi redan pratat, mejlat eller haft möte med
-- får aldrig ett kallt mejl. Motorn byter steg 1 mot ett personligt utkast
-- i Gmail (process_sequences) när den här funktionen hittar historik.
--
-- Bakgrund 2026-09-26: Elkompetens i Jämtland fanns tre gånger i companies
-- (114 från april med sju samtal och ett förslag, 545 "Pär Ivarsson AB",
-- 882 skapad av påfyllaren). Grinden tittade bara på 882. Därför slår
-- funktionen ihop dubbletter på organisationsnummer, webbdomän och mejl
-- innan den läser historiken. Helt additiv.

-- 1. Dubbletter: alla company-id som är samma bolag -------------------------
CREATE OR REPLACE FUNCTION public.outreach_related_company_ids(p_company_id bigint)
RETURNS bigint[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  WITH me AS (
    SELECT c.id,
           public.outreach_org_number(c.org_number) AS org,
           public.outreach_domain(c.website) AS site,
           public.outreach_clean_email(c.email) AS email,
           public.outreach_domain(split_part(public.outreach_clean_email(c.email), '@', 2)) AS email_domain
    FROM public.companies c WHERE c.id = p_company_id
  ),
  contact_emails AS (
    SELECT public.outreach_clean_email(el->>'email') AS email
    FROM public.contacts ct, jsonb_array_elements(COALESCE(ct.email_jsonb, '[]'::jsonb)) el
    WHERE ct.company_id = p_company_id
  )
  SELECT COALESCE(array_agg(DISTINCT c.id), ARRAY[p_company_id])
  FROM public.companies c, me
  WHERE c.id = me.id
     OR (me.org IS NOT NULL AND public.outreach_org_number(c.org_number) = me.org)
     OR (me.site IS NOT NULL AND public.outreach_domain(c.website) = me.site)
     OR (me.email IS NOT NULL AND public.outreach_clean_email(c.email) = me.email)
     OR (me.email_domain IS NOT NULL AND NOT public.outreach_is_free_mailbox(me.email_domain)
         AND public.outreach_domain(split_part(public.outreach_clean_email(c.email), '@', 2)) = me.email_domain)
     OR EXISTS (
       SELECT 1 FROM public.contacts ct, jsonb_array_elements(COALESCE(ct.email_jsonb, '[]'::jsonb)) el
       WHERE ct.company_id = c.id
         AND public.outreach_clean_email(el->>'email') IN (SELECT email FROM contact_emails WHERE email IS NOT NULL)
     );
$$;

-- 2. Historiken över alla dubbletter -------------------------------------------
-- Returnerar { has_contact, company_ids, lead_statuses, events[] } där events
-- är nyast först, högst 40. Sekvensmotorns egna utskick i DEN HÄR sekvensen
-- räknas inte (p_exclude_sequence_id), annars stoppar steg 1 steg 2.
CREATE OR REPLACE FUNCTION public.outreach_prior_contact(
  p_company_id bigint,
  p_exclude_sequence_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_ids bigint[] := public.outreach_related_company_ids(p_company_id);
  v_events jsonb;
  v_statuses text[];
BEGIN
  SELECT COALESCE(array_agg(DISTINCT lead_status) FILTER (WHERE lead_status IS NOT NULL AND lead_status <> 'new'), '{}')
    INTO v_statuses
  FROM public.companies WHERE id = ANY(v_ids);

  SELECT COALESCE(jsonb_agg(e ORDER BY e->>'at' DESC), '[]'::jsonb) INTO v_events
  FROM (
    SELECT e FROM (
      SELECT jsonb_build_object('kind','call','at',cl.created_at,'label',COALESCE(cl.call_outcome,''),'text',COALESCE(cl.notes,''),'company_id',cl.company_id) AS e
      FROM public.call_logs cl WHERE cl.company_id = ANY(v_ids)
      UNION ALL
      SELECT jsonb_build_object('kind','deal','at',d.created_at,'label',COALESCE(d.stage,'')||' / '||COALESCE(d.name,''),'text',COALESCE(d.description,''),'company_id',d.company_id)
      FROM public.deals d WHERE d.company_id = ANY(v_ids)
      UNION ALL
      SELECT jsonb_build_object('kind','deal_note','at',dn.date,'label','','text',COALESCE(dn.text,''),'company_id',d.company_id)
      FROM public.deal_notes dn JOIN public.deals d ON d.id = dn.deal_id WHERE d.company_id = ANY(v_ids)
      UNION ALL
      SELECT jsonb_build_object('kind','contact_note','at',n.date,'label','','text',COALESCE(n.text,''),'company_id',ct.company_id)
      FROM public.contact_notes n JOIN public.contacts ct ON ct.id = n.contact_id WHERE ct.company_id = ANY(v_ids)
      UNION ALL
      SELECT jsonb_build_object('kind','task','at',COALESCE(t.done_date, t.due_date),'label',COALESCE(t.type,''),'text',COALESCE(t.text,''),'company_id',ct.company_id)
      FROM public.tasks t JOIN public.contacts ct ON ct.id = t.contact_id
      WHERE ct.company_id = ANY(v_ids) AND t.done_date IS NOT NULL
      UNION ALL
      SELECT jsonb_build_object('kind','email','at',es.created_at,'label',COALESCE(es.subject,''),'text','','company_id',es.company_id)
      FROM public.email_sends es
      WHERE es.company_id = ANY(v_ids)
        AND (p_exclude_sequence_id IS NULL OR NOT EXISTS (
          SELECT 1 FROM public.sequence_enrollments en
          WHERE en.sequence_id = p_exclude_sequence_id AND en.contact_id = es.contact_id))
      UNION ALL
      SELECT jsonb_build_object('kind','inbound','at',oi.created_at,'label',COALESCE(oi.from_email,''),'text','','company_id',oi.company_id)
      FROM public.outreach_inbound oi WHERE oi.company_id = ANY(v_ids)
      UNION ALL
      SELECT jsonb_build_object('kind','transcript','at',mt.created_at,'label','','text','','company_id',mt.company_id)
      FROM public.meeting_transcriptions mt WHERE mt.company_id = ANY(v_ids)
    ) all_events
    ORDER BY e->>'at' DESC
    LIMIT 40
  ) limited;

  RETURN jsonb_build_object(
    'has_contact', jsonb_array_length(v_events) > 0 OR cardinality(v_statuses) > 0,
    'company_ids', to_jsonb(v_ids),
    'lead_statuses', to_jsonb(v_statuses),
    'events', v_events
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.outreach_related_company_ids(bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.outreach_prior_contact(bigint, bigint) TO authenticated, service_role;

-- 3. Nytt utfall i loggen -------------------------------------------------------
ALTER TABLE public.sequence_run_log DROP CONSTRAINT IF EXISTS sequence_run_log_outcome_check;
ALTER TABLE public.sequence_run_log ADD CONSTRAINT sequence_run_log_outcome_check
  CHECK (outcome = ANY (ARRAY[
    'sent', 'executed', 'dry_run', 'skipped_suppressed', 'skipped_cap',
    'completed', 'failed', 'enrolled', 'skipped_no_contact', 'sending',
    'skipped_duplicate', 'stopped_meeting_booked', 'skipped_window',
    'skipped_asset_missing', 'skipped_stale_scan', 'rescan_requested',
    'skipped_reached', 'asset_built', 'asset_failed', 'drafted_warm'
  ]));

-- 4. Steg 1 i v5 kräver att ingen tidigare kontakt finns -----------------------
UPDATE public.sequence_steps s
SET action_config = COALESCE(s.action_config, '{}'::jsonb) || '{"requires_no_prior_contact": true}'::jsonb
FROM public.sequences q
WHERE q.id = s.sequence_id AND q.name = 'Outreach v5: uppmätt fynd' AND s.step_number = 1;

-- 5. Enrollaren hoppar över leads med historik ---------------------------------
-- (enroll_from_scan_results rör inte v5, som fylls för hand; den manuella
-- inskrivningen enroll-v5.mjs anropar outreach_prior_contact före insert.)
