-- Outreach-grinden + sekvensmotorns startknapp (Fas 0 + Fas 1 i leadkretsen).
--
-- Bakgrund: process_sequences hade INGEN spärrkontroll, och ingen cron
-- anropade den. Spärrarna låg i tre listor som inte kände till varandra
-- (mc_outreach_suppressions, import_blocklist, och lead_status på companies).
-- Den här migrationen ger EN sanningskälla — public.is_suppressed() — som
-- varje utgående kanal frågar, och schemalägger motorn i torrläge.
--
-- Helt additiv: inga befintliga tabeller ändras destruktivt. De två gamla
-- listorna lämnas orörda och läses av is_suppressed().

-- ---------------------------------------------------------------------------
-- 1. Explicita spärrar — en rad per e-post/domän/orgnr/företag.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.outreach_suppressions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email TEXT,
  domain TEXT,
  org_number TEXT,
  company_id BIGINT REFERENCES public.companies(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason = ANY (ARRAY[
    'manual', 'said_no', 'existing_customer', 'bad_fit', 'bounced',
    'complained', 'unsubscribed', 'scb_reklamsparr', 'sole_trader_no_consent',
    'import_deleted'
  ])),
  source TEXT NOT NULL DEFAULT 'manual',
  note TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT outreach_suppressions_has_key CHECK (
    email IS NOT NULL OR domain IS NOT NULL OR org_number IS NOT NULL OR company_id IS NOT NULL
  )
);

-- Vanlig (icke-partiell) unik constraint så PostgREST-upsert med
-- on_conflict=email,reason fungerar. NULL-email krockar aldrig. Skrivare
-- gemenar adressen; läsaren (is_suppressed) jämför ändå med lower().
ALTER TABLE public.outreach_suppressions
  DROP CONSTRAINT IF EXISTS outreach_suppressions_email_reason_key;
ALTER TABLE public.outreach_suppressions
  ADD CONSTRAINT outreach_suppressions_email_reason_key UNIQUE (email, reason);
CREATE INDEX IF NOT EXISTS outreach_suppressions_domain_idx
  ON public.outreach_suppressions (lower(domain)) WHERE domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS outreach_suppressions_org_idx
  ON public.outreach_suppressions (org_number) WHERE org_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS outreach_suppressions_company_idx
  ON public.outreach_suppressions (company_id) WHERE company_id IS NOT NULL;

ALTER TABLE public.outreach_suppressions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS outreach_suppressions_team ON public.outreach_suppressions;
CREATE POLICY outreach_suppressions_team ON public.outreach_suppressions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE public.outreach_suppressions IS
  'Explicita utskicksspärrar. Läses av public.is_suppressed() — fråga ALDRIG tabellen direkt från en kanal, fråga funktionen.';

-- Enskild firma = fysisk person = kräver förhandssamtycke för kall e-post.
-- Sätts när samtycke faktiskt finns (t.ex. de fyllde i scannern själva).
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS email_outreach_consent_at TIMESTAMPTZ;
COMMENT ON COLUMN public.companies.email_outreach_consent_at IS
  'Tidpunkt då företaget gav samtycke till e-postutskick. Krävs för enskild firma (personnummer som orgnr) — annars spärrar is_suppressed() e-post.';

-- ---------------------------------------------------------------------------
-- 2. Körlogg för sekvensmotorn — det som läses under torrkörningen.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sequence_run_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  enrollment_id BIGINT REFERENCES public.sequence_enrollments(id) ON DELETE CASCADE,
  sequence_id BIGINT,
  contact_id BIGINT,
  company_id BIGINT,
  step INTEGER,
  action_type TEXT,
  outcome TEXT NOT NULL CHECK (outcome = ANY (ARRAY[
    'sent', 'executed', 'dry_run', 'skipped_suppressed', 'skipped_cap',
    'completed', 'failed'
  ])),
  reasons TEXT[] NOT NULL DEFAULT '{}',
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sequence_run_log_created_idx ON public.sequence_run_log (created_at DESC);
CREATE INDEX IF NOT EXISTS sequence_run_log_enrollment_step_idx
  ON public.sequence_run_log (enrollment_id, step, outcome);

ALTER TABLE public.sequence_run_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sequence_run_log_read ON public.sequence_run_log;
CREATE POLICY sequence_run_log_read ON public.sequence_run_log
  FOR SELECT TO authenticated USING (true);

-- Motorns inställningar. dry_run = true tills någon medvetet slår av det.
INSERT INTO public.mc_settings (key, value)
VALUES ('sequences', '{"dry_run": true, "daily_cap": 30}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Hjälpare: domän ur URL/e-post, normaliserat orgnr, enskild firma.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.outreach_domain(p_raw TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE STRICT SET search_path TO '' AS $$
  SELECT NULLIF(
    regexp_replace(
      split_part(split_part(split_part(
        regexp_replace(lower(trim(p_raw)), '^[a-z]+://', ''),
      '/', 1), '?', 1), ':', 1),
      '^www\.', ''),
  '')
$$;

CREATE OR REPLACE FUNCTION public.outreach_org_number(p_raw TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE STRICT SET search_path TO '' AS $$
  SELECT CASE
    WHEN length(regexp_replace(p_raw, '\D', '', 'g')) >= 10
      THEN right(regexp_replace(p_raw, '\D', '', 'g'), 10)
    ELSE NULL
  END
$$;

-- Personnummer som orgnr: siffra 3–4 är en riktig månad (01–12).
-- Organisationsnummer har alltid ≥ 20 där.
CREATE OR REPLACE FUNCTION public.outreach_is_sole_trader(p_org TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path TO '' AS $$
  SELECT COALESCE(
    substring(public.outreach_org_number(p_org), 3, 2)::int BETWEEN 1 AND 12,
    false)
$$;

-- ---------------------------------------------------------------------------
-- 4. Sanningskällan. Returnerar {"suppressed": bool, "reasons": [...]}.
--    Fail-closed på anroparsidan; här samlar vi bara alla skäl.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_suppressed(
  p_email TEXT DEFAULT NULL,
  p_domain TEXT DEFAULT NULL,
  p_org_number TEXT DEFAULT NULL,
  p_company_id BIGINT DEFAULT NULL,
  p_include_cooldown BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_email TEXT := NULLIF(lower(trim(p_email)), '');
  v_domain TEXT := public.outreach_domain(COALESCE(p_domain, p_email));
  v_org TEXT := public.outreach_org_number(p_org_number);
  v_company public.companies%ROWTYPE;
  v_reasons TEXT[] := '{}';
BEGIN
  -- Hitta företaget om vi inte fick id: via orgnr, annars via domän.
  IF p_company_id IS NOT NULL THEN
    SELECT * INTO v_company FROM public.companies WHERE id = p_company_id;
  ELSIF v_org IS NOT NULL THEN
    SELECT * INTO v_company FROM public.companies
      WHERE public.outreach_org_number(org_number) = v_org LIMIT 1;
  ELSIF v_domain IS NOT NULL THEN
    SELECT * INTO v_company FROM public.companies
      WHERE public.outreach_domain(website) = v_domain LIMIT 1;
  END IF;

  IF v_company.id IS NOT NULL THEN
    v_org := COALESCE(v_org, public.outreach_org_number(v_company.org_number));
    v_domain := COALESCE(v_domain, public.outreach_domain(v_company.website));
  END IF;

  -- (a) Explicita spärrar.
  SELECT array_agg(DISTINCT reason) INTO v_reasons
  FROM public.outreach_suppressions s
  WHERE (s.expires_at IS NULL OR s.expires_at > now())
    AND (
      (v_email IS NOT NULL AND lower(s.email) = v_email)
      OR (v_domain IS NOT NULL AND lower(s.domain) = v_domain)
      OR (v_org IS NOT NULL AND public.outreach_org_number(s.org_number) = v_org)
      OR (v_company.id IS NOT NULL AND s.company_id = v_company.id)
    );
  v_reasons := COALESCE(v_reasons, '{}');

  -- (b) Legacy-listor — lämnas orörda men räknas.
  IF v_email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.mc_outreach_suppressions WHERE lower(email) = v_email
  ) THEN
    v_reasons := array_append(v_reasons, 'legacy_mc_suppression');
  END IF;
  IF v_org IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.import_blocklist WHERE public.outreach_org_number(org_number) = v_org
  ) THEN
    v_reasons := array_append(v_reasons, 'import_deleted');
  END IF;

  -- (c) Härledda skäl ur CRM-tillståndet — kräver ingen synk.
  IF v_company.id IS NOT NULL THEN
    IF v_company.lead_status = 'closed_won'
       OR v_company.fortnox_customer_number IS NOT NULL
       OR EXISTS (SELECT 1 FROM public.deals d WHERE d.company_id = v_company.id AND d.stage = 'won')
    THEN
      v_reasons := array_append(v_reasons, 'existing_customer');
    END IF;
    IF v_company.lead_status = 'not_interested' THEN
      v_reasons := array_append(v_reasons, 'said_no');
    END IF;
    IF v_company.lead_status = 'bad_fit' THEN
      v_reasons := array_append(v_reasons, 'bad_fit');
    END IF;
    -- Enskild firma utan samtycke: e-post spärrad (19 § MFL). Ringa går bra.
    IF v_email IS NOT NULL
       AND public.outreach_is_sole_trader(v_company.org_number)
       AND v_company.email_outreach_consent_at IS NULL
    THEN
      v_reasons := array_append(v_reasons, 'sole_trader_no_consent');
    END IF;
  ELSIF v_email IS NOT NULL AND public.outreach_is_sole_trader(v_org) THEN
    v_reasons := array_append(v_reasons, 'sole_trader_no_consent');
  END IF;

  -- (d) Avregistrerad i någon sekvens (matchar kontaktens e-post).
  IF v_email IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.sequence_enrollments e
    JOIN public.contacts c ON c.id = e.contact_id
    WHERE e.status = 'unsubscribed'
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(c.email_jsonb, '[]'::jsonb)) AS el
        WHERE lower(el->>'email') = v_email
      )
  ) THEN
    v_reasons := array_append(v_reasons, 'unsubscribed');
  END IF;

  -- (e) Karens: kontaktad senaste 90 dagarna. Bara vid NY enrollment —
  --     steg 2 i en pågående sekvens får inte blockeras av steg 1.
  IF p_include_cooldown AND v_email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.email_sends
    WHERE lower(to_email) = v_email
      AND created_at > now() - interval '90 days'
  ) THEN
    v_reasons := array_append(v_reasons, 'recently_contacted');
  END IF;

  SELECT COALESCE(array_agg(DISTINCT r), '{}') INTO v_reasons FROM unnest(v_reasons) AS r;

  RETURN jsonb_build_object(
    'suppressed', cardinality(v_reasons) > 0,
    'reasons', to_jsonb(v_reasons),
    'company_id', v_company.id
  );
END;
$$;

COMMENT ON FUNCTION public.is_suppressed IS
  'Enda spärrfrågan för utgående kontakt. Slår ihop explicita spärrar, legacy-listor och härledda skäl (kund, sagt nej, enskild firma utan samtycke, avregistrerad, karens).';

REVOKE ALL ON FUNCTION public.is_suppressed FROM public;
GRANT EXECUTE ON FUNCTION public.is_suppressed TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Startknappen: pg_cron → SQL → edge-funktionen, samma mönster som
--    run_backfill_tick (hemligheter ur vault, aldrig i migrationsfilen).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_process_sequences()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  edge_function_url text;
  cron_secret text;
BEGIN
  SELECT decrypted_secret INTO edge_function_url
  FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO cron_secret
  FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1;

  IF edge_function_url IS NULL OR cron_secret IS NULL THEN
    RAISE WARNING 'run_process_sequences: missing supabase_url or cron_secret in vault — skipping run';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := edge_function_url || '/functions/v1/process_sequences',
    body := jsonb_build_object('tick', true),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', cron_secret
    ),
    timeout_milliseconds := 60000
  );
END;
$$;

-- Var 5:e minut. Motorn själv är no-op när inget är förfallet, och skickar
-- ingenting så länge mc_settings.sequences.dry_run = true.
SELECT cron.schedule(
  'process-sequences',
  '*/5 * * * *',
  $$SELECT public.run_process_sequences();$$
);
