-- Fem behovsbaserade sekvenser, en per bana från public.lead_offer().
--
-- Alla skapas som 'draft'. run_enroll_from_scans anropas med p_dry_run=false,
-- så en aktiv sekvens börjar mejla på riktigt — statusen är den enda spärren
-- mellan det här och skarpa utskick.
--
-- De tre poängbaserade sekvenserna (1–3) lämnas orörda. De har aldrig skickat
-- något och kan raderas när de nya är utvärderade.
--
-- Interna system behåller branschfiltret: arbetsflödesmallen kräver ett känt
-- segment och blockeras av renderingskontrollen utan det. Fyra utskicksbara
-- företag saknar fortfarande bransch och når därför ingen sekvens.
WITH lanes(lane, seq_name, beskrivning, forsta, uppfoljning, uppgift) AS (
  VALUES
    ('ingen_hemsida', 'Behov: ingen hemsida',
     'Skanningen hittade ingen egen hemsida. Mejlet frågar om de vill ha en — det finns inget testresultat att peka på.',
     7, 12, 'Ring upp — ingen egen hemsida, två mejl utan svar. Fråga vad de använder i stället i dag.'),
    ('ny_hemsida', 'Behov: trasig hemsida',
     'Sajten finns men svarar inte, är parkerad, oanpassad för mobil eller byggd på föråldrad teknik.',
     10, 9, 'Ring upp — trasig hemsida, två mejl utan svar. Nämn fyndet och fråga vem som sköter sajten.'),
    ('google_business', 'Behov: ingen Google Business-profil',
     'Ingen profil hittades. Syns inte i kartan vid lokal sökning.',
     14, 13, 'Ring upp — saknar Google Business-profil. Kontrollera först att den inte ligger under ett annat namn.'),
    ('hemsideforbattring', 'Behov: hemsideförbättring',
     'Sajten fungerar men något allvarligt är trasigt — blockerad från Google, ingen kontaktväg eller saknad HTTPS.',
     10, 9, 'Ring upp — allvarligt fynd på sajten, två mejl utan svar. Fråga om de sett rapporten.'),
    ('interna_system', 'Behov: interna system',
     'Sajt och Google-profil på plats. Ingen skannersignal finns för arbetsflöden, så mejlet frågar i stället för att påstå.',
     8, 11, 'Ring upp — bra hemsida, två systemmejl utan svar. Fråga hur de sköter administrationen i dag.')
),
nya AS (
  INSERT INTO public.sequences (name, description, status, trigger_type, trigger_config)
  SELECT
    l.seq_name,
    l.beskrivning,
    'draft',
    'scan_result',
    jsonb_build_object(
      'offer_lanes', jsonb_build_array(l.lane),
      'min_score', 0,
      'max_score', 100,
      'max_scan_age_days', 60,
      'include_no_website', true
    )
    -- Bara interna system kräver känd bransch; övriga mallar klarar sig utan.
    || CASE WHEN l.lane = 'interna_system' THEN jsonb_build_object(
         'segments', jsonb_build_array(
           'bygg','vvs_el','maleri_golv','transport','fastighet',
           'tandvard','salong','restaurang','redovisning'))
       ELSE '{}'::jsonb END
  FROM lanes l
  WHERE NOT EXISTS (
    SELECT 1 FROM public.sequences s WHERE s.name = l.seq_name
  )
  RETURNING id, name
)
INSERT INTO public.sequence_steps
  (sequence_id, step_number, delay_days, delay_hours, action_type, template_id, action_config)
SELECT n.id, s.step_number, s.delay_days, 0, s.action_type, s.template_id, s.action_config
FROM nya n
JOIN lanes l ON l.seq_name = n.name
CROSS JOIN LATERAL (VALUES
  (1, 0, 'send_email', l.forsta, '{}'::jsonb),
  (2, 4, 'send_email', l.uppfoljning, '{}'::jsonb),
  (3, 7, 'create_task', NULL::int,
   jsonb_build_object('due_days', 1, 'task_type', 'Call', 'task_text', l.uppgift))
) AS s(step_number, delay_days, action_type, template_id, action_config);
