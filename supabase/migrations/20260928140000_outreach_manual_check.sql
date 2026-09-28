-- Manuell kontroll av frånvaropåståenden ("utan hemsida?").
-- Bakgrund 2026-09-28: Norderåsens VVS fick "utan hemsida?" fast de ligger
-- på kedjesidan bad-varme.se. Ingen automatisk källa (Google-sökning,
-- Google-profilens webbplatsfält, Jev) hittade den säkert; Jev gav 13 % ena
-- körningen och 58 % nästa. Rasmus beslut: sådana leads läggs i en daglig
-- kontrollkö på /outreach i stället för att skickas automatiskt. Allt annat
-- (mätta fynd på sajter som finns) går automatiskt som förut.
-- Helt additiv: tre nya kolumner och ett nytt utfall i loggen.

ALTER TABLE public.sequence_enrollments
  ADD COLUMN IF NOT EXISTS manual_check text
    CHECK (manual_check IS NULL OR manual_check IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS manual_check_note text,
  ADD COLUMN IF NOT EXISTS manual_check_at timestamptz;

COMMENT ON COLUMN public.sequence_enrollments.manual_check IS
  'Kontrollkön för frånvaropåståenden: pending = väntar på människa, approved = bekräftat (mejlet får gå), rejected = påståendet stämde inte.';

CREATE INDEX IF NOT EXISTS idx_sequence_enrollments_manual_check_pending
  ON public.sequence_enrollments (manual_check_at) WHERE manual_check = 'pending';

ALTER TABLE public.sequence_run_log DROP CONSTRAINT IF EXISTS sequence_run_log_outcome_check;
ALTER TABLE public.sequence_run_log ADD CONSTRAINT sequence_run_log_outcome_check
  CHECK (outcome = ANY (ARRAY[
    'sent', 'executed', 'dry_run', 'skipped_suppressed', 'skipped_cap',
    'completed', 'failed', 'enrolled', 'skipped_no_contact', 'sending',
    'skipped_duplicate', 'stopped_meeting_booked', 'skipped_window',
    'skipped_asset_missing', 'skipped_stale_scan', 'rescan_requested',
    'skipped_reached', 'asset_built', 'asset_failed', 'drafted_warm',
    'skipped_unverified', 'awaiting_review'
  ]));
