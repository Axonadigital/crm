-- Behovsroutare: vilket erbjudande passar företaget, utifrån vad skanningen
-- faktiskt hittade.
--
-- Bakgrund: inskrivningen till sekvens gick tidigare enbart på totalpoäng.
-- Det gav fel erbjudande åt 16 av 95 skannade företag — fem hade 50+ men en
-- trasig eller saknad hemsida, elva saknade Google Business-profil helt, och
-- alla fick mejlet om interna system.
--
-- Skannern taggar redan varje fynd med en tjänst (finding.service). Den här
-- funktionen behöver därför inte bedöma någonting, bara prioritera: en trasig
-- hemsida gör alla andra erbjudanden meningslösa, och en saknad Google-profil
-- är en billigare och mer konkret ingång än en åtgärdslista för sajten.
--
-- ANSVARSFÖRDELNING: den här funktionen väljer BANA. Om fyndet får citeras i
-- mejlet avgörs i _shared/outreachPersonalization.ts, som vetar fynd när
-- website-fältet pekar på en katalogsajt. Logiken finns alltså på ett ställe var.
--
-- Medvetet uteslutna som egen bana (beslut 2026-09-13):
--   Samtyckesgranskning  — öppnar ett kallt mejl med en antydd lagöverträdelse.
--                          Falska GDPR-varningar är en känd bluffmetod, så även
--                          ett ärligt mejl riskerar att läsas som skräppost.
--   Prestandaoptimering  — "sajten är seg" är svårsålt till någon som inte redan
--                          stör sig på det. Fungerar som merförsäljning i stället.
-- Undantag: no-https ligger under Prestandaoptimering hos skannern men handlar
-- om att webbläsaren skriver "Inte säker", inte om fart. Den räknas som
-- hemsideförbättring.
CREATE OR REPLACE FUNCTION public.lead_offer(p_findings jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
WITH f AS (
  SELECT
    e.f,
    e.ord,
    e.f->>'id' AS fid,
    e.f->>'title' AS title,
    e.f->>'service' AS service,
    CASE lower(COALESCE(e.f->>'severity', ''))
      WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0
    END AS sev,
    COALESCE(NULLIF(e.f->>'impact', '')::numeric, 0) AS impact
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(p_findings) = 'array' THEN p_findings ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS e(f, ord)
  WHERE COALESCE(e.f->>'title', '') <> ''
),
lane AS (
  SELECT CASE
    -- 1a. Ingen sajt alls. Då finns inget att observera — mejlet måste FRÅGA
    --     om de vill ha en, inte citera ett testresultat. Egen bana eftersom
    --     copyn är en annan än för en trasig sajt.
    WHEN EXISTS (SELECT 1 FROM f WHERE fid IN ('no-site', 'no-real-website'))
      THEN 'ingen_hemsida'
    -- 1b. Sajten finns men svarar inte, är parkerad, oanpassad för mobil eller
    --     byggd på föråldrad teknik. Här FINNS ett fynd att peka på.
    WHEN EXISTS (SELECT 1 FROM f WHERE service IN ('Ny hemsida', 'Hemsida'))
      THEN 'ny_hemsida'
    -- 2. Ingen Google Business-profil alls. Billig, konkret, lätt att verifiera
    --    själv. few-reviews och nap-mismatch räknas INTE — de förutsätter att
    --    en profil redan finns och är en svagare ingång.
    WHEN EXISTS (SELECT 1 FROM f WHERE fid = 'no-gbp')
      THEN 'google_business'
    -- 3. Sajten fungerar men något på den är trasigt.
    --    Tröskeln är ALLVARLIGT, inte medel (beslut 2026-09-13). Nästan varje
    --    sajt har ett medelfynd — "inga omdömen syns", "meta-beskrivning
    --    saknas" — och utan tröskeln hamnade 63 av 95 företag här medan
    --    interna system kollapsade till 2. Dessutom är ett medelfynd något
    --    ägaren oftast redan vet, och ett kallt mejl måste öppna med något de
    --    inte vet för att förtjäna ett svar.
    WHEN EXISTS (
      SELECT 1 FROM f
      WHERE (service IN ('SEO-paket', 'Innehåll', 'Konverteringsoptimering')
             OR fid = 'no-https')
        AND sev >= 3
    )
      THEN 'hemsideforbattring'
    -- 4. Restfacket: sajt och Google-profil på plats. Ingen skannersignal
    --    finns för interna system — mejlet måste fråga, inte påstå.
    ELSE 'interna_system'
  END AS lane
),
evidence AS (
  SELECT f.fid, f.title
  FROM f, lane
  WHERE CASE lane.lane
    WHEN 'ingen_hemsida' THEN false
    WHEN 'ny_hemsida' THEN f.service IN ('Ny hemsida', 'Hemsida')
    WHEN 'google_business' THEN f.fid = 'no-gbp'
    WHEN 'hemsideforbattring' THEN
      (f.service IN ('SEO-paket', 'Innehåll', 'Konverteringsoptimering')
       OR f.fid = 'no-https')
      AND f.sev >= 3
    ELSE false
  END
  -- Går inte att observera på en sida som inte finns. Banan är ändå rätt —
  -- de behöver en hemsida — men mejlet måste fråga i stället för att citera.
  AND f.fid NOT IN ('no-site', 'no-real-website')
  ORDER BY f.sev DESC, f.impact DESC, f.ord
  LIMIT 1
)
SELECT jsonb_build_object(
  'lane', (SELECT lane FROM lane),
  'evidence_id', (SELECT fid FROM evidence),
  'evidence_title', (SELECT title FROM evidence)
)
$function$;

COMMENT ON FUNCTION public.lead_offer(jsonb) IS
  'Väljer erbjudandebana utifrån skannerns service-taggar. Prioritet: trasig/saknad hemsida > ingen Google-profil > hemsideförbättring > interna system.';
