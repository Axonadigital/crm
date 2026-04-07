-- Set default lead_status to 'new' for all new companies
ALTER TABLE companies ALTER COLUMN lead_status SET DEFAULT 'new';

-- Update existing companies that have no lead_status set
UPDATE companies SET lead_status = 'new' WHERE lead_status IS NULL;
