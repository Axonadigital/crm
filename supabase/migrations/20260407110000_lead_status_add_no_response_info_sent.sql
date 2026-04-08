-- Add 'no_response' and 'info_sent' lead statuses, remove 'negotiation'
-- Migrate existing 'negotiation' rows to 'proposal_sent' (closest equivalent)
UPDATE companies SET lead_status = 'proposal_sent' WHERE lead_status = 'negotiation';

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_companies_lead_status'
      AND table_name = 'companies'
  ) THEN
    ALTER TABLE companies DROP CONSTRAINT chk_companies_lead_status;
  END IF;

  ALTER TABLE companies
    ADD CONSTRAINT chk_companies_lead_status
    CHECK (lead_status IS NULL OR lead_status IN (
      'new', 'contacted', 'no_response', 'info_sent', 'send_info',
      'interested', 'meeting_booked', 'proposal_sent', 'closed_won',
      'closed_lost', 'not_interested', 'bad_fit', 'callback_requested'
    ));
END $$;
