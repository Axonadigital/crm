-- Candidate templates: deploy the function first, then preview and select these
-- in the existing sequences. Never replace seller-edited copy or activate sending.
INSERT INTO public.email_templates (name, subject, body, category, language)
SELECT name, subject, body, 'outreach', 'sv'
FROM (VALUES
  ('Personlig v4: hemsida - första kontakt',
   'En sak på hemsidan för {{prospect_name}}',
   $copy${{greeting}}

{{website_observation}}

Jag kan skicka ett konkret ändringsförslag med fokus på att {{website_goal}}. Då har ni något att bedöma eller lämna vidare till er webbleverantör.

Vill du att jag skickar det? Det kostar inget.

Säg till om du inte vill ha fler mejl från mig.$copy$),
  ('Personlig v4: hemsida - uppföljning',
   'Re: En sak på hemsidan för {{prospect_name}}',
   $copy${{greeting}}

{{website_followup}}

Målet är att {{website_goal}}. Vill du att jag skickar förslaget här i mejlet? Det kostar inget och ni behöver inte boka ett möte för att få det.

Säg till om du inte vill ha fler mejl från mig.$copy$),
  ('Personlig v4: egen hemsida - första kontakt',
   'En egen hemsida för {{prospect_name}}?',
   $copy${{greeting}}

{{website_question}}

Jag tänker mig en enkel sida med {{website_outline}}. Syftet är att {{website_goal}}.

Vill du att jag skickar ett kostnadsfritt förslag på upplägget för {{prospect_name}}? Du kan ta ställning till det direkt i mejlet.

Säg till om du inte vill ha fler mejl från mig.$copy$),
  ('Personlig v4: egen hemsida - uppföljning',
   'Re: En egen hemsida för {{prospect_name}}?',
   $copy${{greeting}}

Förslaget till {{prospect_name}} skulle visa hur {{website_outline}} kan få plats på en förstasida.

Vill du se upplägget innan ni tar ställning till en hemsida? Jag skickar det utan kostnad eller krav på möte.

Säg till om du inte vill ha fler mejl från mig.$copy$),
  ('Personlig v4: arbetsflöde - första kontakt',
   '{{segment_subject}} hos {{prospect_name}}',
   $copy${{greeting}}

En fråga om {{prospect_name}}: {{segment_pain}}

Vi bygger interna system. Ett tänkbart upplägg är {{systems_example}}. Det beror förstås på vad ni redan använder och var arbetet tar tid.

Är det här något ni vill förenkla? Då kan jag skissa på ett upplägg utifrån hur ni arbetar i dag, utan kostnad.

Säg till om du inte vill ha fler mejl från mig.$copy$),
  ('Personlig v4: arbetsflöde - uppföljning',
   'Re: {{segment_subject}} hos {{prospect_name}}',
   $copy${{greeting}}

För att göra förslaget till {{prospect_name}} relevant behöver jag veta en sak: vilket verktyg använder ni för det här i dag?

Tanken är {{systems_example}}. Berätta gärna vad ni redan har, så kan jag bedöma om vi kan tillföra något innan vi bokar ett samtal.

Säg till om du inte vill ha fler mejl från mig.$copy$)
) AS candidates(name, subject, body)
WHERE NOT EXISTS (
  SELECT 1 FROM public.email_templates existing
  WHERE existing.name = candidates.name
);
