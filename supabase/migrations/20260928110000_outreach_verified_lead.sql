-- Verifiering före första mejlet (process_sequences ensureVerifiedLead).
-- Bakgrund 2026-09-28: första skarpa timmen gick "utan hemsida?" till
-- Norderåsens VVS (har bad-varme.se) och ett mejl till
-- "E-postbodalsvvs@gmail.com". Steg 1 kräver nu att adressen är giltig,
-- ligger på bolagets egen domän, och att frånvaropåståenden är sökta.
-- Helt additiv: nytt utfall i loggen och en flagga på steg 1.

ALTER TABLE public.sequence_run_log DROP CONSTRAINT IF EXISTS sequence_run_log_outcome_check;
ALTER TABLE public.sequence_run_log ADD CONSTRAINT sequence_run_log_outcome_check
  CHECK (outcome = ANY (ARRAY[
    'sent', 'executed', 'dry_run', 'skipped_suppressed', 'skipped_cap',
    'completed', 'failed', 'enrolled', 'skipped_no_contact', 'sending',
    'skipped_duplicate', 'stopped_meeting_booked', 'skipped_window',
    'skipped_asset_missing', 'skipped_stale_scan', 'rescan_requested',
    'skipped_reached', 'asset_built', 'asset_failed', 'drafted_warm',
    'skipped_unverified'
  ]));

UPDATE public.sequence_steps s
SET action_config = COALESCE(s.action_config, '{}'::jsonb) || '{"requires_verified_lead": true}'::jsonb
FROM public.sequences q
WHERE q.id = s.sequence_id AND q.name = 'Outreach v5: uppmätt fynd' AND s.step_number = 1;
