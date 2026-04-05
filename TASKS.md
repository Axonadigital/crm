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

### Prio 2 – Högt värde

- [ ] **Öka testtäckning: contacts-modulen** – Bara 1 integrationstest. Behöver unit tests.
- [ ] **Öka testtäckning: companies-modulen** – Saknar tester helt.
- [ ] **E2E-tester för kritiska flöden** – Playwright konfigurerat men inga tester.
- [ ] **Edge function input-validering** – Flera edge functions saknar robust validering.

### Prio 3 – Förbättringar

- [ ] **Prestandaoptimering: databasvyer** – Granska N+1-problem och saknade index.
- [ ] **Konsistent felhantering i edge functions** – Standardisera error responses.
- [ ] **Refaktorering av stora filer** – Bryt ut logik från filer >400 rader.

---

## Claude-förslag (väntar på godkännande)

> Dessa har identifierats av Claude genom research och kodgranskning.
> Godkänn genom att flytta upp till "Godkända uppgifter" och ta bort [FÖRSLAG].

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

---

## Nästa iteration

**Fokus:** Quotes-modul testtäckning + edge function input-validering.
