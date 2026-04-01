# Layout- och designanalys: axonadigital.se

Analyserad: 2026-03-27

---

## 1. Designsprak (overblick)

Axona Digitals hemsida anvander ett **dark-first, minimalistiskt designsprak** med tydliga kontraster mellan morklaggda hero/CTA-sektioner och ljusa innehallssektioner. Designen ar sparsmakad och modern med formagor som paminner om premiumbyraer. Typografin dominerar layouten — inga stora illustrationer eller komplexa grafiska element. Distinkta inslag ar kommentarsstilade sektionsmarkeringar (`// Tjänster`), rundade knappar och subtila tonfallsgradients mellan sektioner.

---

## 2. Fargpaletten

| Roll | Varde | Anvandning |
|---|---|---|
| Primarbakgrund (mork) | `#0a0a0a` | Hero-sektion, CTA-sektion |
| Sekundarbakgrund (mork) | `#0F0F11` | Footer |
| Ljus bakgrund | `bg-slate-50` / vit | Tjanster, process, om oss, blogg, FAQ |
| Accentfarg | `text-blue-400` / `text-blue-500` | Sektionsmarkeringar (`// Rubrik`), dekorativa accenter |
| Vit (text + knappar) | `#ffffff` | CTA-knappar pa mork bakgrund, rubriker mot mork bakgrund |
| Gra hierarki (text) | `text-grey-200` through `text-grey-600` | Brødtext, subtitlar, navigeringslanktext |
| Kant/separator | `border-grey-200` (ljus) / `border-grey-800` (mork) | Sektionsseparatorer, kortkantar |

Gradients:
- Overgangselement mellan mork och ljus sektion: `bg-gradient-to-b from-[#0a0a0a] to-white`, hojd `h-10 md:h-20`

---

## 3. Typografi

**Typsnitt:** Inter (variable font, Google Fonts eller liknande)

| Element | Storlek | Vikt | Ovrigt |
|---|---|---|---|
| H1 (hero-rubrik) | `text-4xl` (mobil) / `text-6xl` (desktop) | Bold | |
| H2 (sektionsrubriker) | `text-4xl` / `text-[42px]` | Bold | |
| H3 (kortrubriker) | `text-2xl` | Semibold | |
| Sektionsetikett | `text-xs` | Semibold | `uppercase`, `tracking-[3px]` eller `tracking-wider`, accentfarg (blue) |
| Brødtext | `text-base` / `text-lg` | Regular/Medium | |
| Knaptext | `text-base` | Semibold | |
| Footer-lanktext | `text-sm` | Regular | `text-grey-500`, hover: vit |
| Support-text | `text-xs` | Regular | `text-grey-600` |

---

## 4. Navigering

**Typ:** Horisontell, sticky (fixed header)

**Bakgrund:** Mork (foljer hero-sektionens `#0a0a0a`)

**Struktur:**
- Vanster: Axona Digital-logotyp (lankad till startsidan)
- Hoger: Fyra lankpunkter — `Tjänster`, `Om oss`, `Blogg`, `Boka gratis samtal`
- `Boka gratis samtal` ar stilad som en knapp (CTA), ovriga ar textlankar

**Responsivitet:** Mobilanpassad (burger-meny eller hopfallbar struktur impliciteras av responsiv CSS)

---

## 5. Hero-sektionen

**Bakgrund:** `#0a0a0a` (helt mork)

**Layout:** Enkelt centrerat kolumnformat — allt innehall ar horisontellt centrerat

**Innehall ovifran och ned:**
1. Sektionsetikett: `// Byggt för svenska SMF` — liten text, accent-bla, versal, gles spatiering
2. Huvudrubrik: "Mer tid för det som faktiskt driver ert bolag" — stor vit bold text
3. Brødtext: Beskrivning av tjanster (webbplatser, AI-chatbottar, automationsfloden) — `text-grey-500`
4. Tva CTA-knappar (horisontellt parat):
   - Primar: "Boka ett gratis samtal" — vit bakgrund, mork text, `rounded-full`, `px-6 py-3.5`
   - Sekundar: "Se vad vi gör" — textlank/outline-stil
5. Stodtext: "Kostnadsfritt och utan förpliktelse. Svar inom 24h." — `text-xs text-grey-600`

**Inga bilder eller grafiska element i hero-sektionen** — ren typografisk layout.

---

## 6. Sektionsstruktur (ovifran och ned)

### Sektion 1 — Hero
- Bakgrund: Mork (`#0a0a0a`)
- Syfte: Positionering och primart CTA
- Layout: Centrerad enkelkolumn

### Sektion 2 — Tjänster (karusell)
- Bakgrund: Vit/ljus
- Syfte: Presentera tre tjanstekategorier
- Layout: Horisontell karusell med tre synliga kort
- Transition fran hero via `bg-gradient-to-b from-[#0a0a0a] to-white`

### Sektion 3 — Process (fyrstegsprocedur)
- Bakgrund: Ljus/vit
- Syfte: Forklara hur samarbetet ser ut (steg 01-04)
- Layout: Fyra kolumner pa desktop (`lg:grid-cols-4`)
- Stegen heter: Forstå, Strukturera, Implementera, Optimera

### Sektion 4 — Om oss
- Bakgrund: Vit
- Syfte: Presentera grundarna
- Layout: Tva kolumner pa desktop (`md:grid-cols-2`)
- Innehaller sektionsetikett, rubrik, introduktionstext, tva grundarkort

### Sektion 5 — FAQ (accordion)
- Bakgrund: Vit
- Syfte: Besvara vanliga fragor
- Layout: Enkelkolumn, accordion-stil
- Sex Q&A-par om tidsplan, pris, teknik, kvalitet, integrationer, geografi

### Sektion 6 — CTA-block
- Bakgrund: Mork (`#0a0a0a`)
- Syfte: Konvertering — boka samtal
- Layout: Centrerad enkelkolumn
- Innehaller stor rubrik, beskrivningstext, knapp, stodtext

### Sektion 7 — Blogg
- Bakgrund: Vit
- Syfte: Innehallsmarknadsforing
- Layout: Tre kolumner (`lg:grid-cols-3`)
- Tre blogginlaggskort med SVG-illustrationer

### Sektion 8 — Footer
- Bakgrund: `#0F0F11`
- Layout: Fyra kolumner (`lg:grid-cols-4`)
- Se dedikerat footer-avsnitt nedan

---

## 7. Kortstruktur

### Tjanstkort (karusell)
- Bredd: Fixerad eller procentuell, synliga i en rad
- Hojd pa bildcontainer: `h-[240px]`
- Hornradier: `rounded-lg`
- Innehall: Previewnbild/illustration overst, rubrik (H3), kortfattad beskrivningtext
- Tre typer av inre illustrationer: webbplatspreview, chatbottkonversation, problemlosningsramverk

### Grundarkort (Om oss)
- Fotodimension: `w-[120px] h-[120px] sm:w-[180px] sm:h-[180px]`
- Hornradier pa foto: `rounded-2xl`
- Fotobakgrund (platshallare): `bg-grey-200`
- Innehall: Foto, namn, titel, kort bio-text

### Blogginlaggskort
- Innehall: SVG-illustration overst, rubrik, "Las mer ->" lank
- CSS-klass: `.blog-card`
- Hover-effekt pa lanktexten: `group-hover:text-grey-600`

---

## 8. Footer-struktur

**Bakgrund:** `#0F0F11`

**Layout:** `grid-cols-1 md:grid-cols-2 lg:grid-cols-4`

**Kolumner:**

| Kolumn | Innehall |
|---|---|
| 1. Varumarke | Axona Digital-logotyp (med diamantsymbol), vision/mission-text |
| 2. Tjanster | Lankar: AI-chatbot for hemsidan, Webbplatser, AI-losningar |
| 3. Snabblanktar | Lankar: Tjanster, Blogg, Kontakt, Integritetspolicy |
| 4. Kontakt | E-post (info@axonadigital.se) med postikon, Plats (Ostersund, Jamtland, Sverige) med kartniksikon |

**Typografi i footer:**
- Lanktext: `text-sm text-grey-500`, hover: `text-white`
- Kantseparator mot overstaliggande sektion: `border-t border-grey-800`
- Padding: `py-16`
- Gap: `gap-8 md:gap-12`

**Botten (full bredd):** Copyright-text

---

## 9. Visuella sarskiljandelement

- **Kommentarsetiketter:** Sektionsrubriker inleds med `// Sektionsnamn` i liten versal accentfarg — ger en kodstil estetik
- **Rundade knappar:** Alla CTA-knappar anvander `rounded-full` (pill-form), inte `rounded-md`
- **Svart/vit kontrast:** Sidan alternerar konsekvent mellan helhelt mork och helhelt ljus bakgrund — ingen gra mellanzonssektion
- **Processnummer:** Stegen i processsektionen ar numrerade `01`–`04` med nollpad format
- **Inga heroillustrationer:** Hero-sektionen ar rent typografisk utan bakgrundsbild eller grafik
- **Gradientoverganger:** Tunna gradientelement (`h-10 md:h-20`) smolter ihop mork och ljus sektion
- **Diamantsymbol:** Anvands tillsammans med logotypen i footer

---

## 10. Spacing-system

| Egenskap | Varden |
|---|---|
| Max bredd (container) | `max-w-[1400px]`, centrerad med `mx-auto` |
| Horisontell padding | `px-4 sm:px-6 md:px-8 lg:px-16` |
| Vertikal sektionspaddding | `py-16 md:py-24` |
| Grid gap (kort) | `gap-4 md:gap-8` |
| Grid gap (footer) | `gap-8 md:gap-12` |
| Knapppadding | `px-6 py-3.5` |
