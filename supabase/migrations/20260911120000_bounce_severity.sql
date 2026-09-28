-- Skilj permanent studs från tillfällig.
--
-- Bakgrund (2026-09-11, ur Codex-granskningen). classifyMessage returnerade
-- "bounce" för VARJE message/delivery-status-rapport, och svarsläsaren
-- spärrade adressen på det. En ren fördröjningsnotis — "Delivery Status
-- Notification (Delay)", Status 4.4.7, servern var upptagen och försöker
-- igen — hade alltså spärrat en fullt fungerande adress.
--
-- Det är den värsta sortens fel: spärren är enkelriktad, den sker tyst, och
-- ingenting i gränssnittet hade avslöjat att ett riktigt företag försvunnit
-- ur utkorgen. RFC 3463 säger att Status-fältets första siffra är 5 för
-- permanent och 4 för tillfälligt; den skillnaden läses nu av
-- _shared/gmailRead.ts (bounceSeverity).
--
-- Nu spärrar BARA hårda studsar. Mjuka loggas och tråden bevakas vidare.
-- Obedömbara studsar spärrar ingenting utan lägger en uppgift på en människa.
--
-- Additivt: en ny kolumn, inga rader ändras.

ALTER TABLE public.outreach_inbound
  ADD COLUMN IF NOT EXISTS bounce_severity TEXT;

ALTER TABLE public.outreach_inbound
  DROP CONSTRAINT IF EXISTS outreach_inbound_bounce_severity_check;
ALTER TABLE public.outreach_inbound
  ADD CONSTRAINT outreach_inbound_bounce_severity_check
  CHECK (bounce_severity IS NULL OR bounce_severity = ANY (ARRAY[
    'hard', 'soft', 'receipt', 'unknown'
  ]));

COMMENT ON COLUMN public.outreach_inbound.bounce_severity IS
  'hard = permanent (spärrar adressen) · soft = tillfällig (spärrar inget, tråden bevakas vidare) · receipt = leveranskvittens, ingen studs · unknown = gick inte att bedöma, uppgift skapas åt en människa. NULL för allt som inte är en studs.';

CREATE INDEX IF NOT EXISTS outreach_inbound_bounce_severity_idx
  ON public.outreach_inbound (bounce_severity)
  WHERE bounce_severity IS NOT NULL;
