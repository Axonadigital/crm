-- Ny mejlcopy, byggd på mätdata i stället för magkänsla.
--
-- Full analys: axona-brain/analyses/2026-09-10-kall-mejl-research.md
--
-- Vad som ändras och varför:
--
-- 1. ÖPPNINGEN. Mallarna öppnade med totalpoängen ("hemsidan får 47 av 100").
--    Poängen betyder ingenting för en målare i Hackås, och att sätta betyg på
--    någons sida i ämnesraden bjuder in till försvar. Nu öppnar varje mejl med
--    bolagets eget högst rankade fynd och dess konsekvens i klartext, hämtat
--    ur skanningen (scan_finding, scan_finding_why).
--
-- 2. LÄNGDEN. 200-250 ord ned till 60-100. Gong/30MPC, 85 miljoner kalla mejl:
--    svarsfrekvensen toppar vid 51-100 ord (2,6 %) och faller till 1,6 % över
--    150 ord.
--
-- 3. TJÄNSTELISTAN BORT. Stycket om chattbot, Google-profil och "AI-tjänster
--    som ChatGPT" var det sämst mätande som fanns: modeord -57 % svarsfrekvens,
--    ordet "AI" -36 %. Tjänstebredden hör hemma i samtalet efter svaret.
--
-- 4. ASKEN. Enda copy-spaken med stor mätt effekt. Be om ett möte: -44 %.
--    Ge ett erbjudande: +28 %. Båda segmenten slutar nu i ett konkret
--    erbjudande, och bara ETT - uppföljningsmallen erbjöd tidigare två val.
--
-- 5. "DET MESTA BEHÖVER NI INTE OSS FÖR" borttaget. Det tog bort skälet att
--    svara.
--
-- 6. UPPFÖLJNINGEN tar ANDRA fyndet, inte samma. Att upprepa sig är det
--    snabbaste sättet att avslöja att mejlet är automatiskt. Den är också
--    avsiktligt två meningar: Gong mäter att korta uppföljningar ger ungefär
--    dubbelt så många svar som femmeningarsvarianter.
--
-- 7. INGEN GENITIV PÅ BOLAGSNAMN. "PO i Jämtland ABs hemsida" och
--    "Mälardalens bygg & måleris hemsida" skorrar båda, och sådant avslöjar
--    en mall direkt. Därför "hemsidan för {{company_name}}", som fungerar
--    med alla namn.
--
-- 8. SIGNATUREN LIGGER INTE I MALLARNA. Den byggs i _shared/signature.ts och
--    läggs på vid sändning, i både text och HTML. Fyra mallar med varsin
--    kopierad signatur hade varit fyra ställen att hålla i synk.
--
-- MEDVETET UTELÄMNAT, kräver Rasmus:
--   - En rad socialt bevis (+41 % mätt, näst största copy-effekten efter
--     asken). Den ska vara sann och namnge riktiga kunder eller ett riktigt
--     antal, så jag skriver den inte.

UPDATE public.email_templates SET
  subject = '{{company_name}}: {{scan_finding_lower}}',
  body = '{{greeting}}

Jag tittade på hemsidan för {{company_name}} häromdagen och hittade en sak jag tror du vill veta om. {{scan_finding_why}}

Vill du att jag skickar exakt vad som behöver ändras? Det kostar inget, och det här är {{scan_finding_effort}}.

Vill du inte höra mer från mig räcker det att säga till.'
WHERE id = 1;

UPDATE public.email_templates SET
  subject = 'Re: {{company_name}}: {{scan_finding_lower}}',
  body = '{{greeting}}

En sak till jag såg när jag var inne: {{scan_finding_2_why}}

Säg till om du vill ha listan, så skickar jag den i dag.'
WHERE id = 2;

UPDATE public.email_templates SET
  subject = '{{company_name}} — länken Google visar',
  body = '{{greeting}}

När man söker på {{company_name}} i mobilen hamnar man på {{company_website_host}}. Ingen bild på jobben, ingen prislista, inget sätt att höra av sig direkt till er.

Vill du se hur en egen förstasida för {{company_name}} skulle kunna se ut? Jag gör ett utkast och skickar över det. Det kostar inget, och du behöver inte bestämma något.

Vill du inte höra mer, säg bara till.'
WHERE id = 3;

UPDATE public.email_templates SET
  subject = 'Re: {{company_name}} — länken Google visar',
  body = '{{greeting}}

Erbjudandet om ett utkast står kvar — jag gör det och skickar över, så ser du hur det skulle kunna se ut innan du bestämmer något.

Hör jag inget stryker jag er från listan.'
WHERE id = 4;
