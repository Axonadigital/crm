# Fortnox-integration — analys och plan

> Underlag: https://api.fortnox.se/apidocs (OpenAPI, 233 endpoints) + https://www.fortnox.se/developer/checklist
> Skriven 2026-07-14. Ingen kod byggd ännu.

## 1. Vad Fortnox-API:t faktiskt är

- **Base URL:** `https://api.fortnox.se/3/` — JSON (eller XML). Auth-endpoints ligger på `https://apps.fortnox.se/oauth-v1/`.
- **Auth:** OAuth 2.0. Client-Id + Client-Secret från developerportalen.
- **Rate limit:** 25 requests / 5 sek (= 300/min) per client-id **och** tenant. Överskridning → HTTP 429. Ingen `Retry-After` dokumenterad → exponentiell backoff krävs.
- **Paginering:** `page`, `limit` (1–500, default 100), `offset`. Delta-hämtning via `lastmodified`.
- **Webhooks:** **finns inte.** All statusuppdatering (betald/förfallen) måste pollas.
- **Scopes** (alla ger både läs och skriv — read-only finns inte):
  | Scope | Krävs för | Licenskrav i Fortnox |
  |---|---|---|
  | `customer` | Kunder | Kundfaktura eller Order |
  | `invoice` | Fakturor | Kundfaktura eller Order |
  | `article` | Artiklar | Kundfaktura eller Order |
  | `payment` | Inbetalningar på faktura | Bokföring/Order/Kundfaktura |
  | `settings` | Betalningsvillkor, etiketter | Valfri |
  | `companyinformation` | Företagsuppgifter | Valfri |
  | `bookkeeping` | Verifikat, kontoplan | Bokföring eller Kundfaktura |

## 2. Tre beslut som styr hela bygget

### 2.1 Service account, inte refresh tokens

Standardflödet ger access token (1 h) + refresh token (45 dagar) som **roterar vid varje användning** — den gamla blir ogiltig direkt. Det betyder att ett avbrutet anrop, en race mellan två samtidiga jobb, eller 45 dagars tystnad = kopplingen dör och någon måste logga in i Fortnox manuellt igen.

Fortnox har ett alternativ: kör auktoriseringen **en gång** med `account_type=service`, spara `tenantId`, och hämta därefter tokens med `grant_type=client_credentials` (headers: `Authorization: Basic base64(id:secret)` + `TenantId`). Ingen användarinteraktion, ingen roterande token, inget som kan gå sönder om 45 dagar.

**Beslut: service account + client_credentials.** Auth-code-flödet används bara vid engångs-consenten.

### 2.2 Fortnox äger fakturadata — CRM speglar den

Vi bygger ingen egen faktura-logik (moms, bokföringskonton, OCR, påminnelser). CRM:et
- **skriver** kunder och fakturautkast till Fortnox,
- **läser tillbaka** status och speglar i en lokal tabell för statistik och listvyer.

Enda sanningen för ekonomi är Fortnox. Detta undviker den klassiska härvan där två system har olika uppfattning om vad kunden är skyldig.

### 2.3 Ingen automatisk bokföring eller utskick

En faktura skapad via API:t är **inte** bokförd (`Booked=false`) och **inte** skickad (`Sent=false`) förrän man aktivt anropar `/bookkeep` respektive `/email`. Vi utnyttjar det: CRM skapar utkast, en människa klickar "Skicka" i CRM eller i Fortnox. Vi anropar aldrig `/bookkeep` automatiskt.

## 3. Kopplingen mot befintlig datamodell

Vad som redan finns och passar:
- `companies.org_number` (unikt index) → matchar Fortnox `OrganisationNumber`. Detta blir nyckeln som förhindrar dubbletter.
- `quotes` + `quote_line_items` har redan `vat_rate`, `payment_terms`, `subtotal`, `discount_percent` → mappar rakt mot Fortnox `InvoiceRows`.
- `deals.stage = 'won'` + `recurring_amount`/`recurring_interval` → trigger för fakturering resp. avtalsfakturering.
- pg_cron + pg_net + `vault.decrypted_secrets` + `x-cron-secret`-mönstret från rapport-pipelinen → återanvänds rakt av för polling.
- Edge function-mönstret från `send_quote_for_signing` (CORS, manuell auth, secrets, `createErrorResponse`) → mall för Fortnox-funktionerna.

Vad som saknas och måste byggas:
- **Ingen tabell för OAuth-tokens.** Ny tabell `integration_tokens` (RLS: deny all, bara service role).
- **Inga fakturafält på `companies`:** fakturamejl, betalningsvillkor, momstyp, `fortnox_customer_number`.
- **Inga fakturatabeller** över huvud taget.

### Fältmappning (kärnan)

| CRM | Fortnox Customer |
|---|---|
| `companies.name` | `Name` (enda obligatoriska fältet) |
| `companies.org_number` | `OrganisationNumber` |
| `companies.address/zipcode/city` | `Address1`, `ZipCode`, `City` |
| ny `billing_email` | `EmailInvoice` |
| ny `payment_terms` | `TermsOfPayment` |
| — | `Type: COMPANY`, `VATType: SEVAT`, `CountryCode: SE` |
| `companies.id` | `ExternalReference` ← bakåtlänk |

| CRM | Fortnox Invoice |
|---|---|
| `quotes.company_id` → `fortnox_customer_number` | `CustomerNumber` (obligatorisk) |
| `quote_line_items.description` | `InvoiceRows[].Description` |
| `quote_line_items.unit_price` | `InvoiceRows[].Price` |
| `quote_line_items.quantity` | `InvoiceRows[].DeliveredQuantity` |
| `quotes.vat_rate` | `InvoiceRows[].VAT` |
| `quotes.payment_terms` | `TermsOfPayment` |
| `deals.id` / `quotes.id` | `ExternalInvoiceReference1/2` ← bakåtlänk |

Fakturor som läses tillbaka ger allt du efterfrågade:
`Sent` (utskickad), `Booked` (bokförd), `Balance`/`TotalToPay` (kvar att betala), `DueDate`, `Total`, `TotalVAT`, `Cancelled`, `Reminders`.
Och `GET /3/invoices` har färdiga filter: `unpaid`, `unpaidoverdue`, `fullypaid`, `cancelled`, `unbooked`.

## 4. Fasplan

### Fas 0 — Förberedelser (ingen kod)
1. **Verifiera licens:** Fortnox-abonnemanget måste innehålla **Kundfaktura** (eller Order). Utan den ger `customer`/`invoice`-scope 403 oavsett hur rätt koden är.
2. Registrera integration i developerportalen → Client-Id + Client-Secret.
3. Skapa **testdatabas** (upp till 30 st) — allt byggs och verifieras mot test först.
4. Sätt redirect URI (en engångs-callback, t.ex. `https://<crm>/fortnox/callback`).
5. Publicering behövs **inte** — detta är en privat intern integration.

### Fas 1 — Auth-fundament
- Migration: `integration_tokens` (provider, tenant_id, access_token, expires_at) — RLS deny all.
- `_shared/fortnox/client.ts`: hämtar/cachar access token via client_credentials, rate-limit-throttle (max 25/5s), exponentiell backoff på 429/5xx, typade fel.
- Engångs-edge function `fortnox_connect` för consent-flödet (`account_type=service`) → sparar `tenantId`.
- Verifiering: `GET /3/companyinformation` returnerar Axonas företagsnamn.

### Fas 2 — Läsa fakturor + statistik (störst värde, lägst risk)
- Migration: `fortnox_invoices` (spegel, PK `document_number`, FK `company_id` matchad på org.nr) + vy `fortnox_invoice_stats`.
- Edge function `fortnox_sync_invoices`: full backfill vid första körning, därefter delta via `lastmodified`.
- pg_cron var 15:e minut (samma vault/cron-secret-mönster som rapport-pipelinen).
- Frontend: ny `/invoices`-vy — obetalda, förfallna, ej utskickade, betalda — plus widget på dashboard och fakturaflik på kundkortet.

**Efter Fas 2 har du all statistik du bad om, utan att CRM:et någonsin skrivit till Fortnox.**

### Fas 3 — Kundsynk
- Migration: `companies.fortnox_customer_number`, `billing_email`, `payment_terms`, `vat_type`.
- Edge function `fortnox_sync_customer`: matcha på org.nr → uppdatera, annars skapa.
- Knapp "Skapa i Fortnox" på företagskortet + bulk-synk. Aldrig automatisk skrivning utan klick i detta läge.

### Fas 4 — Skapa faktura från offert/affär
- Migration: `quotes.fortnox_invoice_number` (unik → idempotensskydd mot dubbelfakturering).
- Edge function `fortnox_create_invoice`: quote → InvoiceRows, skapar **obokfört utkast**.
- UI: "Fakturera" på signerad offert / vunnen deal → utkast + länk till Fortnox + knapp "Skicka via e-post" (`GET /3/invoices/{nr}/email`).
- Fri-textrader kräver `AccountNumber`. Lägg därför upp Axonas standardtjänster som **artiklar** i Fortnox (webbsida, SEO-abonnemang, AI-automation) så konto och moms sätts rätt automatiskt.

### Fas 5 — Avtalsfakturering (återkommande intäkter)
- `deals.recurring_amount` → Fortnox **Contracts** (`/3/contracts`), som fakturerar automatiskt varje månad.
- Detta är den stora vinsten för abonnemangsintäkterna, men bygg det först när Fas 2–4 är stabila.

## 5. Risker att hålla ögonen på

| Risk | Hantering |
|---|---|
| Fel licens i Fortnox → 403 på allt | Verifieras i Fas 0, innan en rad kod skrivs |
| Dubbelfakturering | Unikt constraint `quotes.fortnox_invoice_number` + jobbtabell, aldrig "fire and forget" |
| Dubblettkunder i Fortnox | Matcha alltid på `OrganisationNumber` före `POST /3/customers` |
| 429 vid backfill | Throttle i den delade klienten, inte i varje anropare |
| Client-Secret läcker | Endast Supabase secrets, aldrig i frontend, alla anrop via edge function |
| Ingen webhook → gammal data | Cron var 15:e min + "senast synkad"-stämpel synlig i UI |
| Moms/bokföringskonto blir fel | Artiklar i Fortnox äger konto och momssats, inte CRM |
