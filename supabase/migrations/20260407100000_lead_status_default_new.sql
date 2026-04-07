-- Set default lead_status to 'new' for all new companies
-- (so new inserts without explicit lead_status get 'new' automatically)
ALTER TABLE companies ALTER COLUMN lead_status SET DEFAULT 'new';
