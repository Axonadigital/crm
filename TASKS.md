# TASKS.md – Uppgiftsbacklog

## Så fungerar det

- `[ ] Uppgift` = **Godkänd** – looparna får jobba på denna
- `[x] Uppgift` = **Klar**
- `[ ] [FÖRSLAG] Uppgift` = **Väntar på godkännande** – looparna rör INTE dessa

**Godkänna:** Ta bort `[FÖRSLAG]` så att raden blir `[ ] Uppgift`
**Avslå:** Radera raden

---

## Godkända uppgifter

### Prio 1 – Kritiskt

- [x] **Fixa trasiga tester** – 2 failande tester i `getContactAvatar.spec.ts`
- [x] **Öka testtäckning: deals-modulen** – Deals är kärnfunktionalitet. Bara 1 testfil.
- [ ] **Öka testtäckning: quotes-modulen** – Nybyggd modul utan tester. Affärskritiskt.
- [ ] **Ta bort krav på efternamn för kontakt** – Ta bort `required()` på `last_name` i `ContactInputs.tsx`. Snabb fix.
- [ ] **Fixa mobilvy: navbar och layout** – Navbaren längst ner syns bara till hälften. Rutor och text utanför skärmen. Granska `MobileLayout`, `MobileNavigation` och alla mobil-komponenter. Säkerställ full paritet med desktop-funktioner.

### Prio 2 – Högt värde

- [ ] **Öka testtäckning: contacts-modulen** – Bara 1 integrationstest. Behöver unit tests.
- [ ] **Öka testtäckning: companies-modulen** – Saknar tester helt.
- [ ] **E2E-tester för kritiska flöden** – Playwright konfigurerat men inga tester.
- [ ] **Edge function input-validering** – Flera edge functions saknar robust validering.
- [ ] **Föreslå telefon/mejl från företagsprofil vid kontaktskapande** – När man skapar en kontakt under ett företag, visa företagets befintliga telefonnummer/mejl som förslag. Koppla `AutocompleteCompanyInput` till att populera suggestions i `ContactInputs.tsx`.
- [ ] **Lägg till löpande kostnad på deals** – Ny kolumn `recurring_amount` (+ ev. `recurring_interval`) på `deals`-tabellen. Uppdatera `DealInputs.tsx`, dealkort och revenue-beräkningar i dashboard. Kräver migration.
- [ ] **Ta bort signeringsruta från 12-sidors offert + fixa avtalslayout** – Ta bort `buildTermsAndSignatureSection` från premium-PDF:en (`generate_quote_pdf/index.ts`). Förbättra layouten på DocuSeal-signeringsavtalet så det matchar offertens design.
- [ ] **Mata in call_logs i offertens AI-analys** – Utöka `generate_quote_text` så den hämtar `call_logs` (samtalsanteckningar, outcome, notes) för företaget/dealen och inkluderar dem i Claude-prompten utöver Fireflies-mötesanalysen.
- [ ] **Scraper: stöd för flera telefonnummer** – `auto_scrape` och `enrich_company` hämtar bara ett telefonnummer. Spara alla hittade nummer (t.ex. `phone_numbers` JSONB-array). Kräver migration + uppdatering av scraper-logik.

### Prio 3 – Förbättringar

- [ ] **Prestandaoptimering: databasvyer** – Granska N+1-problem och saknade index.
- [ ] **Konsistent felhantering i edge functions** – Standardisera error responses.
- [ ] **Refaktorering av stora filer** – Bryt ut logik från filer >400 rader.
- [ ] **Förbättra personalisering av 12-sidors offert** – AI-texterna blir för lika mellan kunder. Inkludera mer kundspecifik kontext (call_logs, branschdata, specifika behov) i prompten. Refaktorera prompt-strukturen. Beror på att call_logs matas in först.
- [ ] **Kundanpassade referensbilder i offerten** – Byt ut hårdkodade `DEFAULT_REFERENCES` mot dynamiskt urval baserat på bransch/behov. Ev. admin-UI för att välja referensprojekt per offert.
- [ ] **Optimera Loops-förbrukning** – Byt modell (haiku för enklare loops, sonnet för review), öka intervallet (30min+), ev. Opus bara för planering. Granska `start-loops.sh`.

---

## Claude-förslag (väntar på godkännande)

> Dessa har identifierats av Claude genom research och kodgranskning.
> Godkänn genom att flytta upp till "Godkända uppgifter" och ta bort [FÖRSLAG].

### Större projekt (kräver planering)

- [ ] [FÖRSLAG] **Dashboard: close revenues med företagslista och datum** – Utöka dashboard så man kan se vilka företag/deals som ingår i stängd revenue, med belopp och datum. Gör dashboarden mer motiverande. STÖRRE PROJEKT.
- [ ] [FÖRSLAG] **Uppföljningssystem efter kundgodkännande** – Koppla `approve_proposal`-flödet till sekvens-systemet. Auto-mejl som påminner om info vi behöver + påminnelser vid uteblivet svar. STÖRRE PROJEKT.
- [ ] [FÖRSLAG] **Sociala medier-material för kunder (Remotion?)** – Skapa bild/video-material kunden kan lägga ut på Facebook/Instagram om att hemsidan är live. Utred Remotion vs Canva API vs statiska templates. STÖRRE PROJEKT.

### Säkerhet

- [ ] [FÖRSLAG] **Fixa XSS i approve_proposal htmlPage()** – HTML-injection via företagsnamn. CRITICAL.
- [ ] [FÖRSLAG] **Fixa XSS i approve_proposal email-body** – Kontaktnamn utan escaping i HTML-email. CRITICAL.
- [ ] [FÖRSLAG] **Timing-safe HMAC i fireflies_webhook** – Sårbar för timing attacks.
- [ ] [FÖRSLAG] **SSRF-validering i send_quote_for_signing** – Tomt allowedPrefixes tillåter alla URL:er.

### Kodkvalitet

- [ ] [FÖRSLAG] **Race condition i fireflies_webhook idempotency** – SELECT + INSERT ej atomärt.
- [ ] [FÖRSLAG] **Undvik mutation av quote-objekt i approve_proposal** – Muterar DB-objekt direkt.
- [ ] [FÖRSLAG] **Ta bort any-cast i TranscriptionDetailDialog** – Saknar typsäkerhet.
- [ ] [FÖRSLAG] **Tester för edge functions** – fireflies_webhook, approve_proposal saknar tester.

### UX-förbättringar

- [ ] [FÖRSLAG] **Bättre default stängningsdatum på deals** – Default idag, borde vara +14 dagar.
- [ ] [FÖRSLAG] **Bekräftelsedialog vid arkivering av deal** – Ingen "Är du säker?".
- [ ] [FÖRSLAG] **Visa stängningsdatum + förfallen-varning på DealCard** – Kanban visar inget datum.
- [ ] [FÖRSLAG] **Bekräftelsedialog på Settings "Reset to defaults"** – Farlig åtgärd utan bekräftelse.
- [ ] [FÖRSLAG] **Bättre default due_date på tasks** – Uppgifter omedelbart förfallna.
- [ ] [FÖRSLAG] **"Rensa alla filter"-knapp i kontaktlistan** – Måste klicka bort filter individuellt.
- [ ] [FÖRSLAG] **CompanyShow mobil: tabs för kontakter/deals** – Saknas i mobilvy.

### Datamodell

- [ ] [FÖRSLAG] **Konsolidera ägarskapskolumner** – Tre kolumner med liknande syfte.
- [ ] [FÖRSLAG] **Konsolidera lead_status och pipeline_state** – Överlappande statusmodeller.
- [ ] [FÖRSLAG] **Uppdatera activity_log-vyn** – Saknar quotes, call_logs, calendar_events.
- [ ] [FÖRSLAG] **Index på deals.stage + deals.updated_at** – Saknade index.
- [ ] [FÖRSLAG] **Lägg till created_at/updated_at på contacts** – Enda tabellen utan dessa.
- [ ] [FÖRSLAG] **Fixa quote_number_seq per-år** – Återställs aldrig vid årsskifte.
- [ ] [FÖRSLAG] **Skärp RLS delete-policies** – Alla inloggade kan radera vem som helsts data.

### Integrationer

- [ ] [FÖRSLAG] **Webhook health monitoring** – Dashboard-widget för integrationshälsa.
- [ ] [FÖRSLAG] **Retry/backoff för externa API-anrop** – Exponential backoff i _shared/.
- [ ] [FÖRSLAG] **Fortnox-integration** – Auto-faktura vid signerad offert.
- [ ] [FÖRSLAG] **"Behöver ändringar"-knapp i proposal Discord** – Reject/review-länk.
- [ ] [FÖRSLAG] **Konsolidera valideringshelpers till _shared/validators.ts** – isPositiveInteger, EMAIL_REGEX, isValidEmail dupliceras i 7+ edge functions. Extrahera efter merge av valideringsbranches.
- [ ] [FÖRSLAG] **Enhetstester för edge function-validering** – Ingen valideringsbranch har tester. Lägg till efter konsolidering.
- [ ] [FÖRSLAG] **Ersätt discord_bot felklassificering med ValidationError-klass** – `message.includes("is required")` är fragilt, bör använda custom error-klass.
- [ ] [FÖRSLAG] **Lös users/index.ts dirty state vs branch-konflikt** – Två olika valideringsimplementationer (main dirty state vs backend/users-validation-v2). Välj en.

### UX-problem (analys 2026-04-06, iteration 2, se RESEARCH.md)

- [ ] [FÖRSLAG] **Obligatoriska fält saknar visuell markering** – form.tsx:80. Lägg till asterisk (*) på required fält. LÅG komplexitet, HÖG allvarlighet.
- [ ] [FÖRSLAG] **Task-radering utan bekräftelsedialog** – Task.tsx:204. Direkt delete utan "Är du säker?". LÅG komplexitet, HÖG allvarlighet.
- [ ] [FÖRSLAG] **Blank sida under listladdning** – DealList.tsx:73 returnerar null vid isPending. Lägg till skeleton/spinner. LÅG komplexitet, HÖG allvarlighet.
- [ ] [FÖRSLAG] **Formulärfält döljer valideringsfel** – helperText={false} i DealInputs.tsx. Aktivera inline-validering. LÅG-MEDEL komplexitet.
- [ ] [FÖRSLAG] **Tomma listor utan onboarding-CTA** – ListNoResults.tsx:18. Visa "Skapa din första..." med knapp. LÅG komplexitet.
- [ ] [FÖRSLAG] **Breadcrumbs på detaljsidor (desktop)** – DealShow, CompanyShow, ContactShow saknar hierarkisk navigering. LÅG-MEDEL komplexitet.
- [ ] [FÖRSLAG] **ContactAside dold på mobil utan indikation** – ContactAside.tsx:37. Samma problem som CompanyAside. MEDEL komplexitet.
- [ ] [FÖRSLAG] **Kanban saknar tangentbordsnavigering (WCAG)** – DealListContent.tsx. hello-pangea/dnd behöver ARIA-config. MEDEL komplexitet.
- [ ] [FÖRSLAG] **Begränsa antal variabler i send_email** – send_email validerar variabel-längd men inte antal. Potentiell DoS med tusentals nycklar. Lägg till max 50 variabler.
- [ ] [FÖRSLAG] **Ersätt google_maps_scraper felfiltrering** – `!error.message.includes("key")` är fragilt. Använd alltid generiskt felmeddelande i response, logga fullt till console.error.
- [ ] [FÖRSLAG] **Commit registry.json template-ändringar** – Ostagade ändringar lägger till template-komponenter. Bör committas med relevant feature eller separat.

---

## Nästa iteration

**Fokus:** Quotes-modul testtäckning + edge function input-validering.
