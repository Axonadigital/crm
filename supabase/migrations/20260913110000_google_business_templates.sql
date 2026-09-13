-- Google Business-banan saknade copy helt. Tio företag med e-post har ingen
-- profil alls — de syns inte i kartan när någon lokalt söker efter det de gör.
--
-- Observationen är formulerad som "jag hittade ingen" och inte "ni har ingen".
-- Skannern kan ha sökt på fel firmanamn, och ett felaktigt påstående om någons
-- verksamhet är värre än inget mejl. Raden som bjuder in till rättelse gör
-- dessutom mejlet svårare att avfärda: den visar att vi vet att vi kan ha fel.
--
-- {{gbp_observation}} sätts bara när skanningen faktiskt letade och inte fann
-- någon profil, så renderingskontrollen stoppar mallen för alla andra.
INSERT INTO public.email_templates (name, subject, body, category, language)
SELECT name, subject, body, 'outreach', 'sv'
FROM (VALUES
  ('Personlig v4: google business - första kontakt',
   '{{prospect_name}} på Google Maps',
   $copy${{greeting}}

{{gbp_observation}} Har ni redan en, säg till så släpper jag det — då har jag letat på fel namn.

Annars är det profilen som gör att ni dyker upp i kartan när någon i {{company_city}} söker efter det ni gör.

Jag kan skicka en checklista på vad som behöver fyllas i, så kan ni lägga upp den själva. Det kostar inget. Vill du ha den?

Säg till om du inte vill ha fler mejl från mig.$copy$),
  ('Personlig v4: google business - uppföljning',
   'Re: {{prospect_name}} på Google Maps',
   $copy${{greeting}}

Checklistan står kvar om du vill ha den.

En sak som är värd att veta: profilen måste verifieras av Google innan den syns, och det kan ta ett par veckor. Det är alltså inget som hinner bli klart samma dag ni behöver det.

Vill du hellre att vi sätter upp den åt er? Då lämnar vi över inloggningen när den är klar.

Säg till om du inte vill ha fler mejl från mig.$copy$)
) AS candidates(name, subject, body)
WHERE NOT EXISTS (
  SELECT 1 FROM public.email_templates existing
  WHERE existing.name = candidates.name
);
