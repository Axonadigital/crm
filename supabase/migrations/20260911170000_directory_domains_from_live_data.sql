-- Grindens katalogslista utökas med de domäner som faktiskt låg i
-- companies.website 2026-09-11.
--
-- Bakgrund: sex av trettioen utskicksbara företag hade en katalogsajt
-- registrerad som "hemsida", och e-postadressen var katalogens egen —
-- info@northdata.com (två företag), prenumeration@jamtlandstidning.se,
-- support@industritorget.se, info@budguiden.se. Utan de här raderna
-- passerar de grinden och räknas som leads.
--
-- Listan hade 'vainu.io'; datan innehöll 'haku.vainu.com'.
--
-- Speglas av THIRD_PARTY_HOSTS i _shared/emailDiscovery.ts.
CREATE OR REPLACE FUNCTION public.outreach_is_directory_domain(p_domain text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT COALESCE(public.outreach_domain(p_domain), '') = ANY (ARRAY[
    'kreditrapporten.se','bolagsfakta.se','allabolag.se','ratsit.se','merinfo.se',
    'hitta.se','eniro.se','proff.se','boolag.se','largestcompanies.com',
    'bolagsverket.se','birthday.se','upplysning.se','vainu.io','1177.se',
    'tripadvisor.se','tripadvisor.com','booking.com','yelp.com','bokadirekt.se',
    -- Tillagda 2026-09-11 utifrån skarp data.
    'northdata.com','budguiden.se','industritorget.se','krafman.se',
    'jamtlandstidning.se','alltombolag.se','reglei.se','slussen.biz',
    'vainu.com','nordicnet.se','gulasidorna.se','blocket.se',
    'ltz.se','op.se','svt.se'
  ])
$function$;
