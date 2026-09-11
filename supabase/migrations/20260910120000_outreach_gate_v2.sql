-- Grinden v2 (2026-09-10) — bolagsform avgör, inte e-postdomänen.
--
-- Rasmus invändning, och han har rätt: väldigt många aktiebolag använder
-- @gmail.com eller @telia.com. Att spärra på gratisdomän hade tagit bort 21
-- riktiga aktiebolag av 39 gratisdomänadresser. Det är bolagsformen som avgör
-- om 19 § MFL kräver förhandssamtycke, ingenting annat.
--
-- Ny ordning:
--   juridisk person (AB/HB/KB/ek.för.)  → får mejlas, oavsett e-postdomän
--   enskild firma                        → kräver samtycke (som förut)
--   okänd bolagsform                     → håll tillbaka tills orgnr hämtats
--
-- Bolagsformen styrks på två sätt: organisationsnumret (siffra 3–4 är en månad
-- hos fysisk person) ELLER bolagsnamnets suffix. Namnet räcker för 285 av 490
-- bolag och kostar ingenting att läsa. Effekt på dagens data: 71 av 105
-- adresser får mejlas, mot 27 med den felaktiga gratisdomänregeln.
--
-- Dessutom två datafel som gjorde att vi hade mejlat fel bolag helt:
--   info@kreditrapporten.se låg på TVÅ olika bolag (kreditupplysningssajtens
--   egen adress, skrapad från sidan om bolaget), och region@regionjh.se låg på
--   Specialisttandvården. Båda spärras nu automatiskt.

-- 1. Bolagsform -------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.outreach_company_form(p_name text, p_org text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT CASE
    -- Organisationsnumret är starkast: siffra 3–4 = månad ⇒ fysisk person.
    WHEN public.outreach_org_number(p_org) IS NOT NULL
      THEN CASE WHEN public.outreach_is_sole_trader(p_org) THEN 'enskild' ELSE 'juridisk' END
    -- Annars bolagsnamnets suffix. "AB" som eget ord, inte som del av ett namn.
    WHEN COALESCE(p_name, '') ~* '(\mAB\M|\maktiebolag\M|\mHB\M|\mhandelsbolag\M|\mKB\M|\mkommanditbolag\M|ek\.? *för|\mekonomisk förening\M|\mstiftelse\M|\mförening\M|\mkommun\M|\mregion\M)'
      THEN 'juridisk'
    ELSE 'okand'
  END
$$;

COMMENT ON FUNCTION public.outreach_company_form(text, text) IS
  'juridisk | enskild | okand. Avgör om 19 § MFL kräver förhandssamtycke. Använd ALDRIG e-postdomänen till detta — aktiebolag har ofta gmail.';

-- 2. E-postadresser som tillhör någon annan ---------------------------------------

-- Kataloger, kreditupplysning och bolagsdata. Berikningen plockar den adress som
-- råkar stå på sidan, och då blir det sajtens egen adress i stället för bolagets.
CREATE OR REPLACE FUNCTION public.outreach_is_directory_domain(p_domain text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT COALESCE(public.outreach_domain(p_domain), '') = ANY (ARRAY[
    'kreditrapporten.se','bolagsfakta.se','allabolag.se','ratsit.se','merinfo.se',
    'hitta.se','eniro.se','proff.se','boolag.se','largestcompanies.com',
    'bolagsverket.se','birthday.se','upplysning.se','vainu.io','1177.se',
    'tripadvisor.se','tripadvisor.com','booking.com','yelp.com','bokadirekt.se'
  ])
$$;

-- Fria e-postleverantörer. Används BARA för att avgöra om en domänmiss är
-- misstänkt — en gmail-adress matchar aldrig bolagets hemsida, och det är
-- helt normalt. Listan får aldrig användas till att bedöma bolagsform.
CREATE OR REPLACE FUNCTION public.outreach_is_free_mailbox(p_domain text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT COALESCE(public.outreach_domain(p_domain), '') = ANY (ARRAY[
    'gmail.com','googlemail.com','hotmail.com','hotmail.se','outlook.com','live.se',
    'live.com','msn.com','telia.com','telia.se','icloud.com','me.com','mac.com',
    'yahoo.com','yahoo.se','spray.se','comhem.se','bredband.net','bahnhof.se',
    'tele2.se','glocalnet.se','passagen.se','swipnet.se','home.se'
  ])
$$;

-- Städar bort det som gör att adressen studsar: mellanslag, avslutande punkt
-- eller komma. "walltinsakeri.magnus@yahoo.se." blir giltig.
CREATE OR REPLACE FUNCTION public.outreach_clean_email(p_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT NULLIF(
    regexp_replace(lower(trim(COALESCE(p_raw, ''))), '[\s.,;:]+$', ''),
  '')
$$;

-- 3. Grinden ----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_suppressed(
  p_email text DEFAULT NULL::text,
  p_domain text DEFAULT NULL::text,
  p_org_number text DEFAULT NULL::text,
  p_company_id bigint DEFAULT NULL::bigint,
  p_include_cooldown boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_email TEXT := public.outreach_clean_email(p_email);
  v_email_domain TEXT := public.outreach_domain(split_part(public.outreach_clean_email(p_email), '@', 2));
  v_domain TEXT := public.outreach_domain(COALESCE(p_domain, p_email));
  v_org TEXT := public.outreach_org_number(p_org_number);
  v_company public.companies%ROWTYPE;
  v_site_domain TEXT;
  v_form TEXT;
  v_reasons TEXT[] := '{}';
BEGIN
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

  SELECT array_agg(DISTINCT reason) INTO v_reasons
  FROM public.outreach_suppressions s
  WHERE (s.expires_at IS NULL OR s.expires_at > now())
    AND (
      (v_email IS NOT NULL AND public.outreach_clean_email(s.email) = v_email)
      OR (v_email_domain IS NOT NULL AND lower(s.domain) = v_email_domain)
      OR (v_org IS NOT NULL AND public.outreach_org_number(s.org_number) = v_org)
      OR (v_company.id IS NOT NULL AND s.company_id = v_company.id)
    );
  v_reasons := COALESCE(v_reasons, '{}');

  IF v_email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.mc_outreach_suppressions WHERE public.outreach_clean_email(email) = v_email
  ) THEN
    v_reasons := array_append(v_reasons, 'legacy_mc_suppression');
  END IF;
  IF v_org IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.import_blocklist WHERE public.outreach_org_number(org_number) = v_org
  ) THEN
    v_reasons := array_append(v_reasons, 'import_deleted');
  END IF;

  -- Adressen tillhör en katalog- eller kreditupplysningssajt, inte bolaget.
  IF v_email_domain IS NOT NULL AND public.outreach_is_directory_domain(v_email_domain) THEN
    v_reasons := array_append(v_reasons, 'third_party_email');
  END IF;

  IF v_company.id IS NOT NULL THEN
    v_site_domain := public.outreach_domain(v_company.website);

    -- Adressen pekar på en helt annan företagsdomän än bolagets egen hemsida.
    -- Hoppas över när hemsidan SJÄLV är en katalogsida (då är adressen den
    -- pålitligare av de två) eller när adressen ligger hos en fri leverantör.
    IF v_email_domain IS NOT NULL
       AND v_site_domain IS NOT NULL
       AND v_email_domain <> v_site_domain
       AND NOT public.outreach_is_free_mailbox(v_email_domain)
       AND NOT public.outreach_is_directory_domain(v_site_domain)
    THEN
      v_reasons := array_append(v_reasons, 'email_domain_mismatch');
    END IF;

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

    -- 19 § MFL. Bolagsformen avgör — ALDRIG e-postdomänen.
    IF v_email IS NOT NULL AND v_company.email_outreach_consent_at IS NULL THEN
      v_form := public.outreach_company_form(v_company.name, v_company.org_number);
      IF v_form = 'enskild' THEN
        v_reasons := array_append(v_reasons, 'sole_trader_no_consent');
      ELSIF v_form = 'okand' THEN
        v_reasons := array_append(v_reasons, 'unverified_company_form');
      END IF;
    END IF;

  ELSIF v_email IS NOT NULL AND public.outreach_is_sole_trader(v_org) THEN
    v_reasons := array_append(v_reasons, 'sole_trader_no_consent');
  END IF;

  IF v_email IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.sequence_enrollments e
    JOIN public.contacts c ON c.id = e.contact_id
    WHERE e.status = 'unsubscribed'
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(c.email_jsonb, '[]'::jsonb)) AS el
        WHERE public.outreach_clean_email(el->>'email') = v_email
      )
  ) THEN
    v_reasons := array_append(v_reasons, 'unsubscribed');
  END IF;

  IF p_include_cooldown AND v_email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.email_sends
    WHERE public.outreach_clean_email(to_email) = v_email
      AND created_at > now() - interval '90 days'
  ) THEN
    v_reasons := array_append(v_reasons, 'recently_contacted');
  END IF;

  SELECT COALESCE(array_agg(DISTINCT r), '{}') INTO v_reasons FROM unnest(v_reasons) AS r;

  RETURN jsonb_build_object(
    'suppressed', cardinality(v_reasons) > 0,
    'reasons', to_jsonb(v_reasons),
    'company_id', v_company.id,
    'company_form', COALESCE(v_form,
      public.outreach_company_form(v_company.name, COALESCE(v_company.org_number, p_org_number)))
  );
END;
$function$;

-- 4. Städa adresserna som redan ligger inne ----------------------------------------
-- Bara avslutande skräptecken tas bort; ingen adress raderas eller byts ut.
-- De felaktiga adresserna (kreditrapporten.se m.fl.) lämnas kvar men spärras
-- av grinden ovan, så inget går förlorat och beslutet går att ändra.

UPDATE public.companies
SET email = public.outreach_clean_email(email)
WHERE email IS NOT NULL
  AND email <> public.outreach_clean_email(email);

-- 5. Sekvensloggen får rymma de nya skälen -----------------------------------------

ALTER TABLE public.sequence_run_log DROP CONSTRAINT IF EXISTS sequence_run_log_outcome_check;
ALTER TABLE public.sequence_run_log ADD CONSTRAINT sequence_run_log_outcome_check
  CHECK (outcome = ANY (ARRAY[
    'sent', 'executed', 'dry_run', 'skipped_suppressed', 'skipped_cap',
    'completed', 'failed', 'enrolled', 'skipped_no_contact'
  ]));
