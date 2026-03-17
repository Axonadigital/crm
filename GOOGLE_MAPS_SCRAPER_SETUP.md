# Google Maps Scraper Setup

## Översikt

Denna funktion låter dig söka och importera företag från Google Maps direkt till ditt CRM. Den använder Google Maps Places API för att hämta företagsinformation.

## Funktioner

- Sök efter företag på Google Maps med naturliga sökfrågor (t.ex. "restauranger i Stockholm")
- Hämta företagsinformation inkl. namn, adress, telefon, webbplats, betyg och recensioner
- Välj vilka företag du vill importera
- Automatisk import till CRM:et

## Setup

### 1. Skaffa Google Maps API-nyckel

1. Gå till [Google Cloud Console](https://console.cloud.google.com/)
2. Skapa ett nytt projekt eller välj ett befintligt
3. Aktivera följande API:er:
   - Places API
   - Geocoding API (valfritt, för bättre geolokalisering)
4. Skapa en API-nyckel under "Credentials"
5. Rekommendera att begränsa nyckeln till endast Places API för säkerhet

### 2. Lägg till API-nyckel i Supabase

Du måste lägga till API-nyckeln som en miljövariabel i Supabase.

#### Lokal utveckling

Lägg till följande i `supabase/.env.local`:

```bash
GOOGLE_MAPS_API_KEY=din_api_nyckel_här
```

#### Production (Supabase Dashboard)

1. Gå till din Supabase-dashboard
2. Navigera till Project Settings → Edge Functions → Secrets
3. Lägg till en ny secret:
   - Name: `GOOGLE_MAPS_API_KEY`
   - Value: Din API-nyckel

### 3. Deploy Edge Function

Om du kör lokalt räcker det att starta om Supabase:

```bash
npx supabase functions serve google_maps_scraper
```

För production:

```bash
npx supabase functions deploy google_maps_scraper --no-verify-jwt
```

**OBS:** Ta bort `--no-verify-jwt` om du vill ha JWT-verifiering aktiverad.

### 4. Sätt upp API-begränsningar (rekommenderat)

För att undvika oväntade kostnader, sätt upp quotas i Google Cloud Console:

1. Gå till "APIs & Services" → "Quotas"
2. Sök efter "Places API"
3. Sätt en lämplig daglig/månatlig kvot

## Användning

1. Gå till företagslistan i CRM:et
2. Klicka på knappen "Importera från Google Maps"
3. Ange en sökfråga (t.ex. "frisörer i Göteborg")
4. Välj max antal resultat (1-50)
5. Klicka "Sök"
6. Markera de företag du vill importera
7. Klicka "Importera"

## Kostnader

Google Maps Places API är **inte gratis**. Aktuella priser (2024):

- Text Search: $32 per 1000 requests
- Place Details: $17 per 1000 requests

Varje sökning gör:
- 1 Text Search request
- N Place Details requests (N = antal resultat)

**Exempel:** En sökning med 20 resultat = 1 + 20 = 21 requests ≈ $0.67

Google ger $200 gratis kredit per månad, vilket räcker till ca:
- 300 sökningar med 20 resultat vardera

## Alternativa lösningar

Om du vill undvika kostnader kan du överväga:

1. **Outscraper API** - Bättre priser för bulk-scraping
2. **Serpapi** - Google Search scraping
3. **Manuell CSV-import** - Använd befintlig import-funktion

## Felsökning

### "GOOGLE_MAPS_API_KEY saknas i miljövariabler"

- Kontrollera att du har lagt till nyckeln i Supabase secrets
- Starta om Edge Function efter att ha lagt till nyckeln

### "Google Maps API fel: REQUEST_DENIED"

- Kontrollera att Places API är aktiverat i Google Cloud Console
- Kontrollera att API-nyckeln har rätt behörigheter

### "Scraping misslyckades: 429 Too Many Requests"

- Du har överskridit din quota
- Vänta eller öka din quota i Google Cloud Console

### Import misslyckas

- Kontrollera att du har rätt behörigheter i CRM:et
- Kontrollera att företagsnamnet inte redan finns (om duplicering inte är tillåtet)

## Support

För frågor eller problem, kontakta utvecklingsteamet.
