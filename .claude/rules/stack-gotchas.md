# Stack Gotchas — Atomic CRM

> Known limitations and non-obvious constraints in this project's stack.
> These exist because previous sessions burned time discovering them the hard way.

## Supabase

### Production project ref
- **Production project ref:** `<FYLL_I_PROJECT_REF>` (TODO: Rasmus, pinna här)
- Alltid använd denna ref vid `supabase link` eller `--project-ref` flaggor
- Kör ALDRIG deploy mot en annan ref utan att fråga först

### RLS och auth.uid()
- `auth.uid()` returnerar NULL i vissa kontexter (service role, edge functions
  utan user JWT, triggers). Detta har historiskt varit rotorsaken till flera
  bug reports där "delete deal" eller liknande operationer misslyckats tyst
- När du debuggar "det går inte att radera/uppdatera X" — kolla RLS-policyn
  FÖRST innan du rör frontend-koden
- Verifiera med: `SELECT auth.uid();` i en query körd AS den aktuella rollen

### Edge function deploy
- Se `/deploy` (global skill) + `/safe-deploy` (detta projekt) — kör alltid
  båda för produktion
- MCP deploy klarar inte stora shared imports → fall tillbaka till CLI direkt
- `--no-verify-jwt` är default för interna funktioner (t.ex. webhooks)
- För användar-autentiserade endpoints: omitta flaggan medvetet

## Discord integration (Gideon bot)

### Webhooks vs bot API — VIKTIGT
- **Webhook-meddelanden stödjer INTE components** (buttons, select menus, etc.)
  Detta är en hård Discord API-begränsning. Försök inte implementera det.
- För interaktiva meddelanden (knappar, celebrations med reaktioner) måste
  man använda bot-API:t (skicka som bot user, inte via webhook)
- Celebrations och CRM-notifikationer som bara ska visa text → webhook är ok
- Celebrations med interaktioner → måste gå via Gideon bot-endpointen

### Message splitting
- Discord har 2000-teckens gräns per meddelande — splitta långa meddelanden
  vid radbrytningar, aldrig mitt i ord eller kod-block

## DocuSeal (e-signering)

- Rollnamn i templates måste matcha EXAKT det som sätts i API-anropet
  (case-sensitive). Vanliga fel: "Signatör" vs "Signer" vs "signer"
- Kolla alltid template-schemat i DocuSeal-dashboarden innan du skriver
  submission-payload
- Submissions är inte idempotenta — försök inte retry utan att först kolla
  om en submission redan skapats

## Stack-sammanfattning (snabb referens)

- **Frontend:** React 19 + TypeScript + Vite + shadcn-admin-kit
- **Backend:** Supabase (PostgreSQL + Edge Functions + RLS)
- **Integrations:** Discord (Gideon bot), DocuSeal, Google Calendar, Fireflies
- **Deploy:** Vercel (frontend) + Supabase CLI (edge functions)
