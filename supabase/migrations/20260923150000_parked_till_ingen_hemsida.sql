-- ============================================================================
-- Parkerad domän hör till banan "ingen hemsida", inte "trasig hemsida"
-- ============================================================================
-- ostersundsbilelektriska.se visar Websupports platshållare. Skannern
-- klassar det nu korrekt som fyndet "parked", men banan blev ny_hemsida,
-- vars mall erbjuder "ett konkret ändringsförslag ... att lämna vidare till
-- er webbleverantör". Företaget har ingen sajt att ändra och sannolikt ingen
-- webbleverantör — observationen var sann men erbjudandet fel.
--
-- En parkerad domän betyder i praktiken att företaget saknar hemsida. Banan
-- ingen_hemsida FRÅGAR i stället för att föreslå ändringar, vilket är rätt
-- samtal att inleda. Frågan formuleras dessutom specifikt för just det här
-- fallet i outreachPersonalization.ts ("Just nu visar <domän> webbhotellets
-- platshållarsida ...") — en parkerad domän är ett observerat faktum, och då
-- är den vaga frågan "har ni en hemsida?" sämre än den precisa.
--
-- Enda ändringen är att 'parked' läggs till i gren 1a.
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
    WHEN EXISTS (SELECT 1 FROM f WHERE fid = 'scan-blocked')
      THEN 'ej_bedombar'
    -- 'parked' hör hit: domänen finns, men det gör ingen hemsida.
    WHEN EXISTS (SELECT 1 FROM f WHERE fid IN ('no-site', 'no-real-website', 'parked'))
      THEN 'ingen_hemsida'
    WHEN EXISTS (SELECT 1 FROM f WHERE service IN ('Ny hemsida', 'Hemsida'))
      THEN 'ny_hemsida'
    WHEN EXISTS (SELECT 1 FROM f WHERE fid = 'no-gbp')
      THEN 'google_business'
    WHEN EXISTS (
      SELECT 1 FROM f
      WHERE (service IN ('SEO-paket', 'Innehåll', 'Konverteringsoptimering')
             OR fid = 'no-https')
        AND sev >= 3
    )
      THEN 'hemsideforbattring'
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
  AND f.fid NOT IN ('no-site', 'no-real-website', 'parked')
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
