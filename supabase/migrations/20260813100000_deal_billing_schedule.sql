-- Add a correctable billing schedule to recurring deals.
-- WHY: recurring revenue lives on deals (recurring_amount / recurring_interval),
-- but the CRM had no way to say how far a customer is invoiced/paid, when the
-- next invoice is due, or to correct that by hand. Deriving it from matched
-- Fortnox invoices is unreliable for customers whose invoices are created
-- outside the CRM deal flow (e.g. the Z-bud fraktsedel integration), so these
-- manual fields become the source of truth for "next invoice" and "remaining
-- to invoice this year" when set, with the Fortnox mirror as a fallback.
-- All additive (ADD COLUMN, nullable) — no existing data is changed.

-- The date through which recurring billing is covered/invoiced. Setting this to
-- e.g. 2026-12-31 means "paid for the rest of the year": remaining-to-invoice
-- becomes 0 and the next invoice falls on the following day.
ALTER TABLE deals ADD COLUMN IF NOT EXISTS invoiced_through date;

-- When the recurring billing period first started. Used to seed the next
-- invoice date when there is no invoice history and nothing invoiced yet.
ALTER TABLE deals ADD COLUMN IF NOT EXISTS billing_start_date date;

-- Free text for irregular arrangements (e.g. "betalar hela året i förskott 1/3").
ALTER TABLE deals ADD COLUMN IF NOT EXISTS billing_notes text;

COMMENT ON COLUMN deals.invoiced_through IS
  'Recurring billing covered/invoiced through this date. Drives next-invoice-date and remaining-to-invoice when set; overrides the Fortnox-derived estimate.';
COMMENT ON COLUMN deals.billing_start_date IS
  'Date the recurring billing period started. Seeds the next invoice date when no invoice history exists yet.';
COMMENT ON COLUMN deals.billing_notes IS
  'Free-text note about a customer''s billing arrangement (irregular cadence, prepaid periods, etc.).';
