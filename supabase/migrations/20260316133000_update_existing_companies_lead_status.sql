-- Migration: Update existing companies with default lead_status
-- Created: 2026-03-16
-- Description: Sets lead_status to 'new' for companies that don't have one set

UPDATE companies
SET lead_status = 'new'
WHERE lead_status IS NULL;

-- For companies we know are interested (from previous migration data)
UPDATE companies
SET lead_status = 'interested'
WHERE name IN (
  'Elkompetens i Jämtland AB',
  'Roddar VVS',
  'EOEL jämtlan',
  'Östesunds elservice ab'
) AND (lead_status IS NULL OR lead_status = 'new');

-- For companies with closed deals
UPDATE companies
SET lead_status = 'closed_won'
WHERE name IN (
  'Kunt Ab',
  'Isakssons måleri',
  'Victorias städservice'
) AND (lead_status IS NULL OR lead_status = 'new');

-- For companies that are not interested
UPDATE companies
SET lead_status = 'not_interested'
WHERE name IN (
  'AB Östersunds Bilelektriska',
  'Nilssons EL AB Östersund',
  'Lundgrens VVS AB | Rörmokare Östersund & Brunflo',
  'Lundgrens VVS AB',
  'Gustafsson Mats Måleri -',
  'Klockeruds VVS',
  'Jämtlands parkett slip ab'
) AND (lead_status IS NULL OR lead_status = 'new');

-- For companies that have been contacted
UPDATE companies
SET lead_status = 'contacted'
WHERE name IN (
  'Elektrikern i Jämtland AB',
  'HHES AB',
  'mb färg och kakel',
  'Fjellströms bygg östersund',
  'jbk and company östersund',
  'Pelle målare AB',
  'Sjöbergs måleri och golv Ab',
  'Arelia elservice'
) AND (lead_status IS NULL OR lead_status = 'new');
