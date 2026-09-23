-- ============================================================================
-- Referensbanan: företag utan känd bransch får ett bevis i stället för en gissning
-- ============================================================================
-- 57 företag ligger i banan interna_system med industry_segment = 'ovrigt'.
-- Arbetsflödesmallen är skriven per bransch ("hur samlar ni in tidrapporter?")
-- och saknar text för dem, så renderingskontrollen stoppar mejlet. De faller
-- bort tyst — inget fel loggas som ser ut som ett problem.
--
-- I stället för att gissa branschen visar vi något vi faktiskt byggt och
-- låter mottagaren känna igen sig. Mejlet påstår fortfarande ingenting om
-- DEM; det berättar vad vi gjorde åt en annan kund och frågar om något
-- liknande är aktuellt. Texterna bor i _shared/referenceCases.ts och får bara
-- innehålla sådant vi kan belägga.
--
-- Ingen ändring i enroll_from_scan_results behövs: 'ovrigt' är ett faktiskt
-- värde i industry_segment, så det befintliga segments-filtret räcker.
--
-- Sekvensen skapas som 'draft'. Statusen är enda spärren mot skarpa utskick.
-- ============================================================================

INSERT INTO public.email_templates (name, subject, body, category, language)
SELECT name, subject, body, 'outreach', 'sv'
FROM (VALUES
  ('Personlig v4: referens - första kontakt',
   'Administrationen hos {{prospect_name}}',
   $copy${{greeting}}

{{reference_line}}

{{reference_question}}

Vi bygger interna system åt företag i Jämtland. Vill du att jag skissar på hur något liknande skulle kunna se ut hos {{prospect_name}}? Det kostar inget, och du kan ta ställning direkt i mejlet.

Säg till om du inte vill ha fler mejl från mig.$copy$),

  ('Personlig v4: referens - uppföljning',
   'Uppföljning: {{prospect_name}}',
   $copy${{greeting}}

Jag hörde av mig för några dagar sedan om hur {{reference_customer}} fick bort en återkommande administrativ uppgift.

Om det inte är aktuellt är det helt i sin ordning — säg bara till, så hör jag inte av mig igen. Är det aktuellt räcker ett kort svar om var tiden går hos er, så återkommer jag med ett förslag.

Säg till om du inte vill ha fler mejl från mig.$copy$)
) AS t(name, subject, body)
WHERE NOT EXISTS (
  SELECT 1 FROM public.email_templates e WHERE e.name = t.name
);

INSERT INTO public.sequences (name, description, status, trigger_type, trigger_config)
SELECT
  'Behov: interna system (utan bransch)',
  'Företag i banan interna_system som saknar känd bransch. Mejlet visar ett '
  || 'tidigare projekt som bevis i stället för att gissa vad som tar tid hos dem.',
  'draft',
  'scan_result',
  jsonb_build_object(
    'max_score', 100,
    'min_score', 0,
    'offer_lanes', jsonb_build_array('interna_system'),
    'segments', jsonb_build_array('ovrigt'),
    'max_scan_age_days', 60,
    'include_no_website', true
  )
WHERE NOT EXISTS (
  SELECT 1 FROM public.sequences s WHERE s.name = 'Behov: interna system (utan bransch)'
);

INSERT INTO public.sequence_steps
  (sequence_id, step_number, delay_days, delay_hours, action_type, template_id, action_config)
SELECT s.id, v.step_number, v.delay_days, 0, v.action_type,
       (SELECT id FROM public.email_templates WHERE name = v.template_name),
       v.action_config
FROM public.sequences s,
  (VALUES
    (1, 0, 'send_email', 'Personlig v4: referens - första kontakt', '{}'::jsonb),
    (2, 4, 'send_email', 'Personlig v4: referens - uppföljning', '{}'::jsonb),
    (3, 7, 'create_task', NULL,
     jsonb_build_object(
       'due_days', 1,
       'task_type', 'Call',
       'task_text', 'Ring upp — okänd bransch, två referensmejl utan svar. Fråga vad som tar mest tid administrativt.'
     ))
  ) AS v(step_number, delay_days, action_type, template_name, action_config)
WHERE s.name = 'Behov: interna system (utan bransch)'
  AND NOT EXISTS (
    SELECT 1 FROM public.sequence_steps st
    WHERE st.sequence_id = s.id AND st.step_number = v.step_number
  );
