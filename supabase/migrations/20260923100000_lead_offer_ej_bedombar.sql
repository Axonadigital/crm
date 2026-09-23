-- ============================================================================
-- Banan "ej_bedombar" + bevis får bara hämtas ur mejlbara fynd
-- ============================================================================
-- Skannern kan från och med 2026-09-23 skilja tre fall åt som tidigare alla
-- blev fyndet "unreachable" (se axona-scanner, reachability.ts):
--
--   offline      två anrop i rad nådde aldrig fram — sajten är nere
--   http_error   servern svarade med fel även på roten
--   scan-blocked servern lever men låste ute oss (403 mot vår Chrome-UA)
--
-- De två första är äkta brister hos kunden och hör hemma i bana ny_hemsida.
-- Det tredje är ett mätproblem hos OSS. Vi vet ingenting om sajten — den
-- fungerar med all sannolikhet utmärkt för vanliga besökare.
--
-- Utan den här ändringen matchar ett scan-blocked-fynd ingen av grenarna i
-- lead_offer() och faller till ELSE 'interna_system'. Företaget skulle alltså
-- få ett kallt mejl om interna system, valt på grundval av att vi blev
-- utelåsta av deras brandvägg. Banan 'ej_bedombar' matchar ingen sekvens
-- (alla fem behovssekvenser listar sina banor explicit i offer_lanes), så
-- företaget faller ur utskicken tills det skannats om.
--
-- ANDRA ÄNDRINGEN: bevis hämtas bara ur fynd som skannern stämplat
-- mailable = true.
--
-- Bakgrund: 2026-09-23 gick fyra kalla mejl ut, varav tre citerade fynd som
-- mottagaren kunde motbevisa genom att titta på sin egen sajt — "ingen
-- kontaktväg utöver telefon" till ett företag vars mejladress står på
-- startsidan, och "saknar HTTPS" till ett företag vars domän visar
-- webbhotellets platshållare. Skannern stämplar nu varje fynd med om det är
-- bevisbart nog att påstå i ett kallt mejl (MAILABLE_FINDING_IDS i
-- scoring.ts). Bara de får bli evidence_title.
--
-- VIKTIG FÖLJD: skanningar gjorda före den här ändringen saknar fältet och
-- räknas som icke-mejlbara. Ingen sekvens som citerar ett fynd kan alltså
-- skicka något förrän företaget skannats om med den nya skannern. Det är
-- avsiktligt — hellre en stoppad kampanj än fler felaktiga påståenden.
--
-- Banan påverkas INTE av mailable. Routningen får fortfarande använda alla
-- fynd; det är bara citatet i mejlet som kräver bevis.
--
-- Endast CASE-grenen och evidence-filtret är nya; resten är oförändrat.
-- ============================================================================

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
    -- 0. Sajten kunde inte mätas — vi blev utelåsta. Måste prövas FÖRST:
    --    utan den här grenen faller fyndet till ELSE och företaget mejlas om
    --    interna system, valt på grundval av ingenting alls.
    WHEN EXISTS (SELECT 1 FROM f WHERE fid = 'scan-blocked')
      THEN 'ej_bedombar'
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
    WHEN 'ej_bedombar' THEN false
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
  -- Bara bevisbara fynd får citeras. Saknas fältet är skanningen äldre än
  -- 2026-09-23 och får inte ligga till grund för ett påstående.
  AND COALESCE((f.f->>'mailable')::boolean, false)
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
  'Härleder behovsbana ur skannerns fynd. Banan ''ej_bedombar'' matchar ingen '
  'sekvens med flit — den betyder att vi inte fick mäta sajten, inte att '
  'kunden saknar något.';
