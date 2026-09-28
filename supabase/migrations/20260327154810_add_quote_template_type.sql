-- Migration: Add template_type to quotes for different quote templates
-- Created: 2026-03-27

ALTER TABLE "public"."quotes" 
ADD COLUMN IF NOT EXISTS "template_type" text DEFAULT 'default' CHECK (template_type IN (
  'default', 'webb', 'webb-med-support', 'seo', 'ai-konsult', 'drift'
));
