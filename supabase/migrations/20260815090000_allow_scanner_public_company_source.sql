-- Migration: Allow scanner_public as a companies.source value
-- Created: 2026-08-15
-- Description: The public scanner (lead-magnet) has always inserted new
--              companies with source = 'scanner_public', but chk_companies_source
--              never included that value. Every attempt to create a brand-new
--              company from a scanner lead has therefore been silently rejected
--              by PostgREST since the integration was built (lead.ts swallows
--              the error so the visitor's scan never breaks). Reusing an
--              existing company (PATCH, not INSERT) was unaffected, which is
--              why it looked like it "sometimes" worked. Purely additive —
--              no existing rows or values change.

ALTER TABLE public.companies DROP CONSTRAINT chk_companies_source;

ALTER TABLE public.companies ADD CONSTRAINT chk_companies_source
  CHECK (
    (source IS NULL) OR (source = ANY (ARRAY[
      'manual'::text,
      'google_maps'::text,
      'google_search'::text,
      'import'::text,
      'website'::text,
      'referral'::text,
      'hitta'::text,
      'allabolag'::text,
      'eniro'::text,
      'field'::text,
      'scanner_public'::text
    ]))
  );
