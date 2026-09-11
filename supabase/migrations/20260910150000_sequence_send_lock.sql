-- Dubbelsändningslås för sekvensmotorn.
--
-- Motorn skickade först och flyttade fram enrollmenten efteråt, utan lås och
-- utan anspråksmarkering. Gick Gmail igenom men databasskrivningen inte, var
-- enrollmenten fortfarande förfallen vid nästa tick och samma mejl gick ut
-- igen. Två överlappande tickar kunde också plocka samma rad, eftersom
-- urvalet bara var `next_action_at <= now()`.
--
-- Lösningen: motorn skriver en anspråksrad med outcome 'sending' INNAN
-- Gmail-anropet. Det partiella unika indexet gör den andra skrivningen
-- omöjlig. Lyckas sändningen blir raden 'sent' och låser steget för alltid;
-- misslyckas den blir den 'failed' och lämnar indexet, så ett återförsök går.
--
-- Fail-closed med flit: en anspråksrad som blir kvar på 'sending' (funktionen
-- dog mitt i sändningen) blockerar steget. Det är rätt håll att fela åt — vi
-- vet inte om mejlet gick ut — och motorn pausar enrollmenten och loggar det
-- så en människa ser det i Mission Control i stället för att det tystnar.

CREATE UNIQUE INDEX IF NOT EXISTS sequence_run_log_send_claim_idx
  ON public.sequence_run_log (enrollment_id, step)
  WHERE outcome IN ('sending', 'sent');

-- Tre nya utfall i loggen. Rent tillägg — ingen befintlig rad kan bli ogiltig.
-- Utan dem fallerar både anspråksraden och bokningsstoppet på check-constrainten,
-- vilket upptäcktes först när låset testades mot skarp databas.
ALTER TABLE public.sequence_run_log
  DROP CONSTRAINT IF EXISTS sequence_run_log_outcome_check;

ALTER TABLE public.sequence_run_log
  ADD CONSTRAINT sequence_run_log_outcome_check CHECK (
    outcome = ANY (ARRAY[
      'sent'::text,
      'executed'::text,
      'dry_run'::text,
      'skipped_suppressed'::text,
      'skipped_cap'::text,
      'completed'::text,
      'failed'::text,
      'enrolled'::text,
      'skipped_no_contact'::text,
      -- Anspråk taget, Gmail-anropet pågår.
      'sending'::text,
      -- Steget var redan skickat; enrollmenten flyttades fram i stället.
      'skipped_duplicate'::text,
      -- Cal.com-bokning stoppade sekvensen.
      'stopped_meeting_booked'::text
    ])
  );
