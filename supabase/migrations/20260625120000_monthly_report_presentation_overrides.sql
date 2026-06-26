-- Manuell override av presentations-policyn för en månadsrapport.
--
-- Auto-policyn (vilka sektioner/siffror som visas + ton) beräknas ur
-- view_model och lagras inuti view_model.presentation. Den här kolumnen håller
-- BARA granskarens manuella avvikelser ovanpå auto-policyn, så att ett
-- "Uppdatera förhandsvisning"/utskick kan bygga om mail + PDF med rätt val.
--
-- Icke-destruktiv: enbart ADD COLUMN med IF NOT EXISTS och default. Inga
-- DROP/ALTER TYPE. Befintliga rader får '{}' (= ren auto-policy).
ALTER TABLE monthly_reports
  ADD COLUMN IF NOT EXISTS presentation_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN monthly_reports.presentation_overrides IS
  'Granskarens manuella visningsval ovanpå auto-policyn (view_model.presentation). Partial<PresentationPolicy>.';
