-- Mätning av förfrågningar och samtal från kundsajterna.
--
-- Bakgrund: resultatkortet i outreach-flödet får bara nämna uppmätta siffror
-- (sanningsregeln 2026-09-23). Visningar och klick finns i Search Console;
-- förfrågningar (formulär) och samtal (tel:-klick) mättes inte alls. Nu
-- postar sajterna vi bygger en händelse till edge function site_event, som
-- lagras här och summeras per kalendermånad in i website_snapshots.engagement.
-- Samtal via Google-profilen (CALL_CLICKS) finns redan i gbp_actions.
--
-- Helt additiv migration.

-- 1. En nyckel per kundsajt ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.site_event_keys (
  key text PRIMARY KEY DEFAULT encode(gen_random_bytes(16), 'hex'),
  company_id bigint NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  label text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.site_event_keys IS
  'Publik (icke-hemlig) nyckel som kundsajten skickar med varje händelse till site_event. Pekar ut företaget. Inaktivera med active=false.';
CREATE INDEX IF NOT EXISTS idx_site_event_keys_company ON public.site_event_keys(company_id);

ALTER TABLE public.site_event_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS site_event_keys_team ON public.site_event_keys;
CREATE POLICY site_event_keys_team ON public.site_event_keys
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. Händelserna --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.site_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id bigint NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('form', 'call', 'email')),
  page text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  meta jsonb
);
COMMENT ON TABLE public.site_events IS
  'En rad per förfrågan (form), samtalsklick (call) eller mejlklick (email) på en kundsajt. Skrivs enbart av edge function site_event (service role). Summeras per månad i website_snapshots.engagement.';
CREATE INDEX IF NOT EXISTS idx_site_events_company_time
  ON public.site_events(company_id, occurred_at DESC);

ALTER TABLE public.site_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS site_events_read ON public.site_events;
CREATE POLICY site_events_read ON public.site_events
  FOR SELECT TO authenticated USING (true);

-- 3. Summan per period i snapshoten ------------------------------------------
ALTER TABLE public.website_snapshots
  ADD COLUMN IF NOT EXISTS engagement jsonb;
COMMENT ON COLUMN public.website_snapshots.engagement IS
  '{ inquiries, site_calls, email_clicks, measured: true } för perioden ur site_events. NULL när sajten saknar aktiv nyckel — då är det inte "0", det är omätt.';

-- 4. Snabb summering (används av analyze_website och CRM-vyer) -----------------
CREATE OR REPLACE FUNCTION public.site_events_summary(
  p_company_id bigint, p_start date, p_end date
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT jsonb_build_object(
    'inquiries',    count(*) FILTER (WHERE kind = 'form'),
    'site_calls',   count(*) FILTER (WHERE kind = 'call'),
    'email_clicks', count(*) FILTER (WHERE kind = 'email')
  )
  FROM public.site_events
  WHERE company_id = p_company_id
    AND occurred_at >= p_start::timestamptz
    AND occurred_at < (p_end + 1)::timestamptz;
$$;
GRANT EXECUTE ON FUNCTION public.site_events_summary(bigint, date, date) TO authenticated, service_role;
