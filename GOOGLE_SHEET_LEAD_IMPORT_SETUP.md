# Google Sheet Lead Import Setup

## Översikt

Lead-importen använder ett publicerat Google Sheet som CSV-källa och edge functionen `import_google_sheet_leads`.
Flödet är:

1. Hämta nästa batch från `lead_import_sources`
2. Importera nya bolag till `companies`
3. Starta `enrich_company` för varje ny rad
4. Sätt `prospecting_status` till `call_ready` eller `needs_review`

## Secrets

Sätt följande secrets i Supabase:

```bash
CRON_SECRET=valfri-lang-hemlig-strang
SERPER_API_KEY=...
GOOGLE_API_KEY=... # om enrich-funktionerna använder den i er miljö
GOOGLE_CX=...      # om enrich-funktionerna använder den i er miljö
```

`CRON_SECRET` används både av `process_sequences` och `import_google_sheet_leads`.

## Deploy

Deploya minst dessa funktioner:

```bash
npx supabase functions deploy import_google_sheet_leads --no-verify-jwt
npx supabase functions deploy enrich_company --no-verify-jwt
```

`enrich_company` kan fortfarande köras med vanlig användar-auth från CRM:et, men behöver även acceptera interna cron-anrop för auto-enrichment efter import.

## Manuell körning

Via CRM:
- Gå till `/lead_import_sources`
- Klicka på `Importera nästa batch`

Via HTTP:

```bash
curl -X POST \
  "$SUPABASE_URL/functions/v1/import_google_sheet_leads" \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: $CRON_SECRET" \
  -d '{"batch_size":50}'
```

## Schemalagd morgonkörning

Exempel med extern cron:

```bash
curl -X POST \
  "$SUPABASE_URL/functions/v1/import_google_sheet_leads" \
  -H "x-cron-secret: $CRON_SECRET"
```

Rekommenderat schema:
- varje vardag mellan `06:00` och `07:00`
- en körning per dag i v1

## Driftanteckningar

- Källan som importeras styrs av den aktiva raden i `lead_import_sources`
- `last_imported_row` avgör vilken rad som hämtas nästa gång
- Funktionen har en enkel spärr mot parallella körningar via `claim_lead_import_source`
- Om sheetets kolumnstruktur ändras behöver mappningen i `import_google_sheet_leads/index.ts` uppdateras
