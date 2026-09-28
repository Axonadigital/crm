# REVIEW.md – Kodgranskning Iteration 37, 2026-04-06

## Sammanfattning

**38 omergade branches** granskade (full diff-granskning). **Inga nya merges eller commits sedan iteration 36.**
2 CRITICAL säkerhetsproblem **kvarstår i main/produktion** — fix-branches finns men väntar.
Dirty state kvarstår: `supabase/functions/users/index.ts` + `registry.json` (nya template-komponenter).

**Sedan senaste granskning:** Oförändrat. CRITICAL-fixarna har nu legat omergrade i minst 1 dag. Eskaleringsrisk.

---

## CRITICAL – Kvarstår i produktion

### 1. XSS i approve_proposal (CRITICAL) ⚠️

**Status:** Sårbar i main. Fix finns i `fix/xss-approve-proposal` — EJ mergad.

**Problem:** `approve_proposal/index.ts` interpolerar kontaktnamn, företagsnamn och offert-ID
direkt i HTML utan escaping. Angripare med kontroll över dessa fält kan injicera
godtycklig HTML/JavaScript i e-post och responsidor. Felmeddelanden läcker interna detaljer.

**Fix-branch:** Lägger till `escapeHtml()`, `encodeURI()`, generiska felmeddelanden.
**Granskning:** Korrekt implementation. Inga problem.
**Rekommendation: MERGA OMEDELBART. Fix har legat redo i 1+ dag. ESKALERA.**

### 2. Auth-bypass i postmark_events + resend_events (CRITICAL) ⚠️

**Status:** Sårbar i main. Fixar finns men EJ mergade.

**Problem:** Båda webhook-handlers gör `if (webhookSecret)` — om env-variabeln saknas
hoppas autentiseringen över helt. Vem som helst kan skicka falska events.

**Fix-branches:**
- `backend/postmark-events-input-validation` — Gör secret obligatoriskt, validerar payload, typkontrollerar RecordType/MessageID.
- `backend/resend-events-input-validation` — Secret obligatoriskt, Content-Type check, body size-gräns (64KB), eventtyp-validering mot vitlista, säker bounce-hantering.

**Resend-branchen extra noggrann:** Läser body som text först (body size-kontroll), sedan JSON.parse. Validerar bounce-meddelande med deep type-check istället för `event.data?.bounce?.message`.

**Rekommendation: MERGA BÅDA OMEDELBART. Fixar har legat redo i 1+ dag. ESKALERA.**

---

## HIGH – Merge-klara branches

### 3. Merge-contacts SQL injection-skydd

**Branch:** `backend/merge-contacts-validation-v2`
UUID-validering, typkontroll av loserId/winnerId, check loserId ≠ winnerId. Minimal diff. **Merga.**

### 4. Input-validering (8 branches, alla granskade OK)

| Branch | Funktion | Bedömning |
|--------|----------|-----------|
| `backend/users-validation-v2` | users | Email, namn, lösenords-validering. Bäst av 3 versioner. |
| `backend/send-email-input-validation` | send_email | JSON, ID-typ, variables-sanitering (max 5000 chars per variabel). Grundlig. |
| `backend/send-quote-signing-validation` | send_quote_for_signing | UUID-validering, generiska felmeddelanden. |
| `backend/calendar-sync-input-validation` | calendar_sync | Mest omfattande (200+ rader). Validerar allt inkl. attendee-emails och datumordning. |
| `backend/discord-bot-input-validation` | discord_bot | Enum-checks, längdgränser. Se anmärkning nedan. |
| `backend/serve-quote-input-validation` | serve_quote | GET-metod-check, positivt heltal. Minimal, bra. |
| `backend/google-maps-scraper-validation` | google_maps_scraper | Query-begränsning (500 chars), JSON try/catch. Se anmärkning nedan. |
| `backend/enrich-company-input-validation` | enrich_company | JSON body-validering, company_id som positivt heltal. Minimal, korrekt. **NY** |

**Anmärkningar:**
- `discord_bot`: Felklassificering via `message.includes("is required")` är fragil. Bör refaktoreras till `ValidationError`-klass efter merge.
- `google_maps_scraper`: `!error.message.includes("key")` är en heuristik som kan läcka info. Bör ersättas med generiskt meddelande.

### 5. Frontend-tester

| Branch | Tester | Bedömning |
|--------|--------|-----------|
| `frontend/quotes-test-coverage` | 32 tester (quoteCalculations + quoteStatuses) | Extraherar `quoteCalculations.ts` med ren testbar logik. Bra refaktor. Inga filraderingar. **Merga.** |
| `frontend/quotes-test-coverage-v14` | 24 tester | Alternativ, men `quotes-test-coverage` har fler tester. |
| `frontend/deals-test-coverage` | dealUtils + stages tester | **OBS:** Har scope creep — raderar CHANGELOG, LOOPS.md, scripts, serve_quote. Cherry-pick krävs. |

---

## MEDIUM – Branches med problem

### 6. Scope creep-branches (raderar filer)

Dessa branches har bra valideringskod men raderar 10-13 filer som inte tillhör deras scope:

| Branch | Bra kod att cherry-picka | Raderar |
|--------|--------------------------|---------|
| `backend/orchestrate-proposal-validation` | orchestrate_proposal validering | CHANGELOG, TASKS, LOOPS, scripts, fireflies |
| `backend/input-validation-generate-quote-pdf` | _shared/utils.ts + generate_quote_pdf | CHANGELOG, contractFields, fireflies |
| `backend/quote-pdf-input-validation` | generate_quote_pdf validering (90KB diff!) | CHANGELOG, scripts, fireflies |
| `frontend/deals-test-coverage` | deals tester | CHANGELOG, LOOPS, scripts, serve_quote |
| `frontend/fix-getcontactavatar-tests` | avatar-test fix | Raderar CHANGELOG, TASKS, LOOPS, scripts + gör stora omskrivningar av approve_proposal/fireflies |

**Rekommendation:** Cherry-pick enbart valideringsändringarna. Merga INTE hela branches.

### 7. Dirty state på main

`supabase/functions/users/index.ts` har ostagade ändringar som implementerar validering med en **annorlunda** struktur än `backend/users-validation-v2`:
- Main: TypeScript interfaces (`InviteUserInput`, `PatchUserInput`), `validateInviteInput()`/`validatePatchInput()` returnerar `{data}` eller `{error}`
- Branch: Separata hjälpfunktioner (`isValidEmail`, `isValidName`, `isValidPassword`), inline validering

**Risk:** Om branchen mergas ovanpå dirty state → merge-konflikt.
**Rekommendation:** Bestäm vilken version som ska användas. Main-versionen har bättre struktur (interfaces + Result-pattern) men branchen är mer inline.

---

## LOW – Branschrensning

### Duplicat-branches (radera efter merge av bästa version)

| Grupp | Radera | Behåll |
|-------|--------|--------|
| Users-validering | `backend/users-input-validation`, `backend/users-input-validation-v2` | `backend/users-validation-v2` |
| Merge-contacts | `backend/merge-contacts-input-validation`, `backend/merge-contacts-validation` | `backend/merge-contacts-validation-v2` |
| Quote PDF | `backend/validate-generate-quote-pdf`, `backend/input-validation-generate-quote-pdf` | `backend/quote-pdf-input-validation` (cherry-pick) |
| Quotes-tester | v1-v13, `frontend/quotes-tests`, `frontend/quotes-tests-edge-cases`, `frontend/quotes-test-coverage-2` | `frontend/quotes-test-coverage` |
| Deals-tester | `frontend/deals-unit-tests` | `frontend/deals-test-coverage` (cherry-pick) |

**Totalt ~20 branches kan raderas.**

---

## Kodkvalitetsobservationer

### Bra mönster
- Alla valideringsbranches använder tidigt return-mönster
- JSON body-parsing görs säkert med try/catch
- Felmeddelanden exponerar inte längre interna detaljer
- UUID-validering via regex där det behövs
- `calendar_sync` och `resend_events` har de mest genomarbetade strukturerna

### Systematiska problem
1. **Duplicerad valideringslogik** — `isPositiveInteger`, `EMAIL_REGEX`, `isValidEmail` definieras i 7+ branches separat. Bör extraheras till `_shared/validators.ts`.
2. **Inga tester för valideringsbranches** — Ingen enda valideringsbranch har enhetstester.
3. **Branch-explosion** — 38 branches, varav ~20 är duplicat. Behöver branch-hygienrutin.
4. **Inkonsekvent users-validering** — Dirty state på main och branch har olika implementationer.

---

## Rekommenderad merge-ordning

```
1. fix/xss-approve-proposal                    (CRITICAL)
2. backend/postmark-events-input-validation     (CRITICAL)
3. backend/resend-events-input-validation       (CRITICAL)
4. backend/merge-contacts-validation-v2         (HIGH - SQL injection)
5. backend/users-validation-v2                  (HIGH - eller commit dirty state)
6. backend/enrich-company-input-validation      (HIGH - NY)
7. backend/send-email-input-validation          (HIGH)
8. backend/send-quote-signing-validation        (HIGH)
9. backend/calendar-sync-input-validation       (HIGH)
10. backend/discord-bot-input-validation        (HIGH, fragilt felmönster)
11. backend/serve-quote-input-validation        (MEDIUM)
12. backend/google-maps-scraper-validation      (MEDIUM, heuristik i felhantering)
13. frontend/quotes-test-coverage               (MEDIUM)
14. Cherry-pick från deals-test-coverage        (MEDIUM)
15. Cherry-pick från orchestrate/quote-pdf      (LOW)
```

**Efter merge:** Radera ~20 duplicat-branches. Konsolidera valideringshelpers till `_shared/validators.ts`.

---

## Nya observationer (iteration 37)

### registry.json dirty state
`registry.json` har ostagade ändringar som lägger till template-komponenter (`templates/index.ts`, `SendEmailDialog.tsx`, `EmailTemplateList.tsx`). Dessa bör committas tillsammans med relevant feature-branch eller som separat commit.

### Valideringskod — djupare granskning

Vid förnyad diff-granskning av alla valideringsbranches bekräftas:

1. **`backend/calendar-sync-input-validation`** — Mest robusta branchen (200+ rader validering). Validerar attendee-emails, datumordning (starts_at < ends_at), timezone-längd, metadata-typ. Inga problem hittade.

2. **`backend/discord-bot-input-validation`** — Felklassificeringen `message.includes("is required")` är fortfarande det största problemet. Om ett framtida felmeddelande från Supabase/Postgres råkar innehålla "is required" klassificeras det som 400 istället för 500.

3. **`backend/send-email-input-validation`** — Variabler valideras med max 5000 chars per värde och 100 chars per nyckel. Bra djupvalidering men saknar begränsning av antal variabler (potentiell DoS med tusentals nycklar).

4. **`backend/google-maps-scraper-validation`** — `!error.message.includes("key")` filtrerar bort felmeddelanden som innehåller "key" för att undvika att läcka API-nycklar. Men detta kan också dölja legitima felsökningsmeddelanden. Bättre: alltid generiskt meddelande i response, full loggning till console.error.

5. **`backend/orchestrate-proposal-validation`** — Valideringskoden (validateDealPayload + Discord error-handling) är välskriven. **MEN** branchen raderar CHANGELOG.md, TASKS.md, LOOPS.md helt. Cherry-pick obligatoriskt.

### Sammanfattning av åtgärder

| Prioritet | Åtgärd | Blockerare |
|-----------|--------|------------|
| CRITICAL | Merga 3 säkerhetsfixar | Ingen — redo att merga |
| HIGH | Merga 8 valideringsbranches | users dirty state-konflikt |
| HIGH | Commit/stash users dirty state | Beslut: branch vs dirty state |
| MEDIUM | Cherry-pick från 5 scope-creep-branches | Manuellt arbete |
| LOW | Radera ~20 duplicat-branches | Vänta tills merges är klara |

---

*Genererad av Review-loopen, iteration 37, 2026-04-06*
