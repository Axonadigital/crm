-- Sändningsfönster: utkorgen får bara gå på arbetstid.
--
-- Bakgrund (2026-09-11, ur Codex-granskningen). Sekvensmotorn skickade så
-- fort ett steg var förfallet. Ett mejl som blev förfallet 03:14 en söndag
-- gick 03:14 en söndag. Tidpunkten är en av de tydligaste signalerna på att
-- avsändaren är en maskin — den påverkar både hur mottagaren läser mejlet
-- och hur filtren bedömer det.
--
-- Dygnstaket räknades dessutom från UTC-midnatt, alltså 02:00 svensk
-- sommartid. Ett utskick 01:30 hamnade på gårdagens kvot, och taket kunde
-- spräckas två gånger samma natt. Det räknas nu från svensk midnatt via
-- _shared/sendWindow.ts, som använder Intl och därmed klarar sommartiden.
--
-- Utanför fönstret SKJUTS utskicket UPP, aldrig bort: enrollmenten lämnas
-- förfallen och plockas upp när fönstret öppnar igen.
--
-- Additivt: ett nytt tillåtet utfall och en ny inställningsnyckel.

-- 1. Nytt utfall i loggen -----------------------------------------------------
-- Tredje gången den här constraint:en behöver utökas. Missas det avvisas
-- loggraden och körningen ser ut att fungera medan spåret försvinner.
ALTER TABLE public.sequence_run_log DROP CONSTRAINT IF EXISTS sequence_run_log_outcome_check;
ALTER TABLE public.sequence_run_log ADD CONSTRAINT sequence_run_log_outcome_check
  CHECK (outcome = ANY (ARRAY[
    'sent', 'executed', 'dry_run', 'skipped_suppressed', 'skipped_cap',
    'completed', 'failed', 'enrolled', 'skipped_no_contact', 'sending',
    'skipped_duplicate', 'stopped_meeting_booked', 'skipped_window'
  ]));

-- 2. Fönstret som inställning ------------------------------------------------
-- days: 1 = måndag … 7 = söndag. end_hour är EXKLUSIV, så 17 betyder att
-- sista mejlet går 16:59. Axona jobbar 08–18; marginalen är medveten.
UPDATE public.mc_settings
SET value = value || jsonb_build_object(
  'send_window', jsonb_build_object(
    'days', jsonb_build_array(1, 2, 3, 4, 5),
    'start_hour', 8,
    'end_hour', 17,
    'timezone', 'Europe/Stockholm'
  )
)
WHERE key = 'sequences'
  AND NOT (value ? 'send_window');
