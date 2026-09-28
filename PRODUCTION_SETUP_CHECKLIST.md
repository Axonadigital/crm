# 🚀 Production Setup Checklist - Atomic CRM

Detta är en komplett checklista för att sätta upp Atomic CRM i produktion.

## 📋 Innehåll
1. [Git & GitHub Setup](#git--github-setup)
2. [Supabase Production Setup](#supabase-production-setup)
3. [Google Maps API Setup](#google-maps-api-setup)
4. [Vercel Deployment](#vercel-deployment)
5. [Domän & DNS](#domän--dns)
6. [Email Setup (Postmark)](#email-setup-postmark)
7. [Säkerhet & Miljövariabler](#säkerhet--miljövariabler)
8. [Första användaren](#första-användaren)
9. [Backup & Underhåll](#backup--underhåll)

---

## 1. Git & GitHub Setup

### ✅ Steg 1.1: Skapa GitHub Repository
- [ ] Gå till https://github.com/new
- [ ] Skapa ett nytt **privat** repository (t.ex. `axona-atomic-crm`)
- [ ] Lägg INTE till README, .gitignore eller licens (finns redan)

### ✅ Steg 1.2: Pusha till GitHub
```bash
# Kontrollera att du är i rätt mapp
cd /path/to/crm

# Lägg till GitHub som remote
git remote add origin https://github.com/[ditt-användarnamn]/axona-atomic-crm.git

# Kontrollera branch-namn (ska vara main eller master)
git branch

# Pusha till GitHub
git push -u origin main
```

### ✅ Steg 1.3: Verifiera .gitignore
Kontrollera att dessa filer/mappar INTE pushas:
- [ ] `.env.local`
- [ ] `supabase/.env.local`
- [ ] `node_modules/`
- [ ] `.DS_Store`
- [ ] `*.log`

---

## 2. Supabase Production Setup

### ✅ Steg 2.1: Skapa Supabase Project
- [ ] Gå till https://supabase.com/dashboard
- [ ] Klicka "New project"
- [ ] Välj organisation (skapa ny om det behövs)
- [ ] Projektnamn: `axona-crm-production`
- [ ] Database Password: **Spara detta säkert!** (använd en password manager)
- [ ] Region: `North Europe (Stockholm)` (närmast Sverige)
- [ ] Pricing Plan: Välj plan (Free eller Pro)
- [ ] Klicka "Create new project"

### ✅ Steg 2.2: Hämta API-nycklar
När projektet är skapat:
- [ ] Gå till Project Settings → API
- [ ] Kopiera **Project URL** (t.ex. `https://xxxxx.supabase.co`)
- [ ] Kopiera **anon/public key**
- [ ] Kopiera **service_role key** (håll denna HEMLIG!)

### ✅ Steg 2.3: Konfigurera Databas
```bash
# Länka lokalt projekt till production
npx supabase link --project-ref [ditt-projekt-ref]

# Pusha migrations till production
npx supabase db push
```

### ✅ Steg 2.4: Konfigurera Auth Settings
- [ ] Gå till Authentication → Settings
- [ ] **Site URL**: `https://din-domän.se` (eller Vercel URL tillfälligt)
- [ ] **Redirect URLs**: Lägg till:
  - `https://din-domän.se/auth/callback`
  - `https://din-domän.vercel.app/auth/callback` (om du använder Vercel)

### ✅ Steg 2.5: Konfigurera Email Templates (Auth)
- [ ] Gå till Authentication → Email Templates
- [ ] Anpassa "Confirm signup", "Reset password", etc.
- [ ] Lägg till er logotyp och företagsfärger

### ✅ Steg 2.6: Deploy Edge Functions
```bash
# Deploy alla edge functions
npx supabase functions deploy

# Eller en i taget
npx supabase functions deploy google_maps_scraper
npx supabase functions deploy users
npx supabase functions deploy postmark
```

### ✅ Steg 2.7: Sätt Edge Function Secrets
```bash
# Google Maps API Key (om ni aktiverar billing)
npx supabase secrets set GOOGLE_MAPS_API_KEY=din_nyckel_här

# Eller sätt USE_MOCK_DATA för att fortsätta använda testdata
npx supabase secrets set USE_MOCK_DATA=true
```

---

## 3. Google Maps API Setup

### ✅ Steg 3.1: Skapa Google Cloud Project
- [ ] Gå till https://console.cloud.google.com/
- [ ] Klicka "Select a project" → "New Project"
- [ ] Projektnamn: `Axona CRM`
- [ ] Klicka "Create"

### ✅ Steg 3.2: Aktivera Billing (KRÄVS för Google Maps API)
- [ ] Gå till https://console.cloud.google.com/billing
- [ ] Klicka "Link a billing account"
- [ ] Lägg till betalkort
- [ ] **OBS:** Google ger $200 gratis kredit/månad

### ✅ Steg 3.3: Aktivera APIs
- [ ] Gå till "APIs & Services" → "Library"
- [ ] Sök och aktivera:
  - [ ] **Places API**
  - [ ] **Geocoding API** (valfritt, för bättre geolokalisering)

### ✅ Steg 3.4: Skapa API-nyckel
- [ ] Gå till "APIs & Services" → "Credentials"
- [ ] Klicka "Create Credentials" → "API Key"
- [ ] Kopiera nyckeln
- [ ] Klicka "Edit API key" (rekommenderat):
  - [ ] Application restrictions: "HTTP referrers" eller "IP addresses"
  - [ ] API restrictions: Välj endast "Places API" och "Geocoding API"

### ✅ Steg 3.5: Sätt Budgetalarm
- [ ] Gå till Billing → Budgets & alerts
- [ ] Skapa budget: t.ex. 500 kr/månad
- [ ] Sätt email-notifikation vid 50%, 80%, 100%

### ✅ Steg 3.6: Lägg till i Supabase
```bash
npx supabase secrets set GOOGLE_MAPS_API_KEY=AIzaSy...din-nyckel
```

**ALTERNATIV:** Fortsätt använda mockad data
```bash
npx supabase secrets set USE_MOCK_DATA=true
```

---

## 4. Vercel Deployment

### ✅ Steg 4.1: Skapa Vercel-konto
- [ ] Gå till https://vercel.com/signup
- [ ] Logga in med GitHub

### ✅ Steg 4.2: Importera Repository
- [ ] Klicka "Add New" → "Project"
- [ ] Importera `axona-atomic-crm` från GitHub
- [ ] Framework Preset: `Vite`
- [ ] Root Directory: `./` (default)

### ✅ Steg 4.3: Konfigurera Environment Variables
Lägg till dessa i Vercel:
- [ ] `VITE_SUPABASE_URL` = `https://xxxxx.supabase.co`
- [ ] `VITE_SUPABASE_ANON_KEY` = `eyJhbG...` (från Supabase)

### ✅ Steg 4.4: Deploy
- [ ] Klicka "Deploy"
- [ ] Vänta tills bygget är klart
- [ ] Besök din Vercel URL: `https://axona-atomic-crm.vercel.app`

---

## 5. Domän & DNS

### ✅ Steg 5.1: Köp Domän
- [ ] Köp domän från t.ex. Namecheap, GoDaddy, eller Cloudflare
- [ ] Förslag: `crm.axona.se` eller `axona-crm.se`

### ✅ Steg 5.2: Konfigurera DNS i Vercel
- [ ] Gå till Vercel Project → Settings → Domains
- [ ] Lägg till din domän
- [ ] Följ instruktionerna för att uppdatera DNS-records

### ✅ Steg 5.3: Uppdatera Supabase URLs
- [ ] Gå till Supabase → Authentication → Settings
- [ ] **Site URL**: `https://crm.axona.se`
- [ ] **Redirect URLs**: `https://crm.axona.se/auth/callback`

### ✅ Steg 5.4: Vänta på SSL
- [ ] Vercel aktiverar automatiskt SSL (kan ta 5-10 min)
- [ ] Verifiera att `https://` fungerar

---

## 6. Email Setup (Postmark)

### ✅ Steg 6.1: Skapa Postmark-konto
- [ ] Gå till https://postmarkapp.com/
- [ ] Skapa konto (30 dagars gratis trial, sen ~$15/månad)

### ✅ Steg 6.2: Verifiera Domän
- [ ] Lägg till din sändande domän (t.ex. `axona.se`)
- [ ] Lägg till DKIM, SPF, och DMARC records i DNS
- [ ] Vänta på verifiering (~10 min)

### ✅ Steg 6.3: Konfigurera Inbound Email
Om ni vill att email ska sparas som noter i CRM:
- [ ] Gå till Postmark → Servers → Inbound
- [ ] Lägg till webhook URL: `https://xxxxx.supabase.co/functions/v1/postmark`
- [ ] Forwarda email till: `crm@inbound.postmarkapp.com`

### ✅ Steg 6.4: Sätt Miljövariabler
```bash
# I Supabase Edge Functions
npx supabase secrets set POSTMARK_API_KEY=din-postmark-api-nyckel
```

---

## 7. Säkerhet & Miljövariabler

### ✅ Steg 7.1: Skapa .env.production (lokal backup)
**OBS:** Spara denna fil i en säker password manager, INTE i Git!

```bash
# Supabase
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG... # HEMLIG!

# Google Maps
GOOGLE_MAPS_API_KEY=AIzaSy...

# Postmark
POSTMARK_API_KEY=xxxxx
```

### ✅ Steg 7.2: Säkerhetsinställningar
- [ ] Supabase → Authentication → Settings:
  - [ ] Aktivera "Enable email confirmations"
  - [ ] Sätt "Minimum password length" till minst 8
  - [ ] Aktivera "Enable email change confirmations"

- [ ] Supabase → Database → Policies:
  - [ ] Granska Row Level Security (RLS) policies
  - [ ] Verifiera att all data är skyddad

### ✅ Steg 7.3: Backup av Secrets
- [ ] Spara alla nycklar i 1Password, Bitwarden eller liknande
- [ ] Dela ALDRIG service_role key publikt

---

## 8. Första användaren

### ✅ Steg 8.1: Skapa Admin-användare
- [ ] Gå till `https://din-domän.se/signup`
- [ ] Skapa första användaren:
  - Email: `admin@axona.se` (eller ditt val)
  - Password: Starkt lösenord (minst 12 tecken)
  - Förnamn: Admin
  - Efternamn: Axona
- [ ] Verifiera email (om det krävs)

### ✅ Steg 8.2: Sätt som Administrator
Om användaren inte automatiskt blir admin:
```sql
-- Kör i Supabase SQL Editor
UPDATE sales
SET administrator = true
WHERE email = 'admin@axona.se';
```

### ✅ Steg 8.3: Skapa Fler Användare
- [ ] Logga in som admin
- [ ] Gå till Settings → Users
- [ ] Klicka "Add User"
- [ ] Fyll i detaljer och skicka invite

---

## 9. Backup & Underhåll

### ✅ Steg 9.1: Automatisk Backup (Supabase Pro)
Om ni har Pro-plan:
- [ ] Gå till Supabase → Database → Backups
- [ ] Aktivera "Daily backups"
- [ ] Sätt retention period (t.ex. 7 dagar)

### ✅ Steg 9.2: Manuell Backup
```bash
# Backup av databas
npx supabase db dump -f backup-$(date +%Y%m%d).sql

# Spara filen säkert (t.ex. Google Drive, Dropbox)
```

### ✅ Steg 9.3: Monitorering
- [ ] Sätt upp Supabase email-notifikationer
- [ ] Övervaka Vercel deployment-status
- [ ] Kolla Google Maps API usage månadsvis
- [ ] Kolla Postmark email-status

### ✅ Steg 9.4: Uppdateringar
```bash
# Regelbundet (1 gång/månad):
npm update
npm audit fix

# Testa lokalt först
npm run dev

# Pusha till GitHub
git add .
git commit -m "Update dependencies"
git push

# Vercel deployer automatiskt
```

---

## 📊 Kostnadskalkyl (ungefärlig)

| Tjänst | Plan | Kostnad/månad |
|--------|------|---------------|
| Supabase | Free | 0 kr (upp till 500 MB databas, 2 GB bandbredd) |
| Supabase | Pro | $25 (~270 kr) |
| Vercel | Hobby | 0 kr (personligt bruk) |
| Vercel | Pro | $20 (~215 kr) per medlem |
| Domän | - | ~100-200 kr/år |
| Google Maps API | Pay-as-you-go | 0-500 kr (beroende på användning, $200 gratis kredit) |
| Postmark | - | ~$15 (~160 kr) |
| **TOTALT (minimal setup)** | | **~0-200 kr/månad** |
| **TOTALT (professionell setup)** | | **~800-1200 kr/månad** |

---

## ✅ Final Checklist - Go Live

Innan ni går live med systemet:

- [ ] ✅ GitHub repository skapat och pushat
- [ ] ✅ Supabase production-projekt skapat
- [ ] ✅ Databas-migrationer körda i production
- [ ] ✅ Edge Functions deployade
- [ ] ✅ Google Maps API konfigurerad (eller mockdata aktiverad)
- [ ] ✅ Vercel deployment klar
- [ ] ✅ Domän konfigurerad och SSL aktivt
- [ ] ✅ Postmark (om ni använder email) konfigurerad
- [ ] ✅ Första admin-användaren skapad
- [ ] ✅ Alla nycklar säkert sparade
- [ ] ✅ Backup-strategi på plats
- [ ] ✅ Testat alla funktioner i production

---

## 🆘 Support & Hjälp

### Dokumentation
- Supabase: https://supabase.com/docs
- Vercel: https://vercel.com/docs
- Google Maps API: https://developers.google.com/maps/documentation

### Problem?
1. Kolla Supabase logs: Project → Database → Logs
2. Kolla Vercel logs: Project → Deployments → [senaste] → Logs
3. Kolla Edge Function logs: `npx supabase functions logs google_maps_scraper`

### Kontakt
- Utvecklare: [Din email]
- Axona Digital: https://axona.se

---

**Skapad:** 2026-03-16
**Senast uppdaterad:** 2026-03-16
**Version:** 1.0
