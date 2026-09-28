# Axona Digital — Varumärkesguide

Extraherad från https://www.axonadigital.se/

Overgripande känsla i ett ord: **Precis**

---

## Färger

### Bakgrundsfärger

| Roll | Hex | Notering |
|------|-----|----------|
| Primär bakgrund (dark) | `#0a0a0a` | Används på hero och de flesta sektioner |
| Sekundär bakgrund (dark) | `#0f0f11` | Footer och alternativa sektioner |
| Djup bakgrund (dark) | `#111111` | Fördjupade kort och paneler |
| Ljus bakgrund (light) | `#ffffff` | Mellanliggande sektioner med ljust tema |
| Ljus sekundär (light) | `#f5f5f5` | Kortytor, slate-50 ekvivalent |

Sidan övergår mellan mörkt och ljust: hero är `#0a0a0a`, sedan fade till vitt, sedan tillbaka. Default-tema är dark mode.

### Textfärger

| Roll | Hex | Notering |
|------|-----|----------|
| Primär text (dark bg) | `#ffffff` | Rubriker och body på mörk bakgrund |
| Sekundär text | `#d4d4d4` | Brödtext, grey-300-ekvivalent |
| Dämpad text | `#737373` | Metadata, etiketter, grey-500-ekvivalent |
| Svag text | `#404040` | Placeholders, grey-700-ekvivalent |
| Primär text (light bg) | `#0a0a0a` | Rubriker och body på ljus bakgrund |

### Accentfärger

| Roll | Hex | Notering |
|------|-----|----------|
| Accent blå (primär) | `#60a5fa` | blue-400 — länkfärg, diamant-ikon i logotyp, interaktiva element |
| Accent blå (hover) | `#3b82f6` | blue-500 — hover-tillstånd |
| Starka CTA-knappar | `#ffffff` | Vita knappar med mörk text på mörk bakgrund |

Ingen sekundär accentfärg används konsekvent. Paletten är avsiktligt avskalad — kontrast skapas via ljus/mörk-växling, inte via multipla färger.

### Gränser

| Roll | Hex | Notering |
|------|-----|----------|
| Subtil gräns (dark) | `#262626` | grey-800-ekvivalent |
| Subtil gräns (light) | `#e5e5e5` | grey-200-ekvivalent |

---

## Typografi

### Typsnittsfamiljer

| Roll | Typsnitt | Stack |
|------|----------|-------|
| Primärt | **Inter** | `"Inter", "Inter Fallback", Arial, ui-sans-serif, system-ui, sans-serif` |
| Monospace | **Geist Mono** | `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono"` |

Inter används som variabelfont med stödvikterna 300, 400, 500, 600, 700 och 800.

### Typografisk skala

| Element | Storlek (Tailwind) | Ungefärlig px | Vikt |
|---------|-------------------|---------------|------|
| Hero-rubrik | text-5xl / text-6xl | 48–60px | 700 (bold) |
| Sektionsrubrik | text-4xl | 36px | 700 (bold) |
| Underrubrik | text-2xl | 24px | 700 (bold) |
| Brödtext | text-base / text-lg | 16–18px | 400 (regular) |
| Etikett / kapsyl | text-xs | 12px | 600 (semibold), uppercase, letter-spacing 3px |
| Knapptext | text-xs | 12px | 600 (semibold), uppercase, wider tracking |

Radavstånd: tight (1.25) för rubriker, relaxed (1.625) för brödtext.

---

## Knappstilar

### Primärknapp (mörk bakgrund)

```
Bakgrund:  #ffffff
Text:      #0a0a0a
Storlek:   text-xs, font-semibold, uppercase, letter-spacing wider
Padding:   px-6 py-3.5
Radier:    rounded-full (helt rund)
Hover:     bakgrund #e5e5e5, övergång 150ms
```

### Sekundärknapp / textlänk

```
Färg:      #737373
Hover:     #ffffff
Underline: ingen
Transition: 150ms
```

Axona Digital undviker fyllda färgknappar i blått. Accentblå används enbart för text/ikoner, aldrig som knappbakgrund.

---

## Kort och sektionsstyling

### Kortkort

```
Bakgrund:    #f5f5f5 (ljust läge) / #111111 (mörkt läge)
Radier:      rounded-lg (10px) till rounded-2xl (16px)
Padding:     p-6 till p-8
Skugga:      0 3px 3px rgba(0,0,0,0.12) (subtil)
Kantlinje:   1px solid #262626 (mörkt) / #e5e5e5 (ljust)
```

### Bildkort (case studies / blogg)

```
Höjd:        h-[240px]
Radier:      rounded-lg
Bakgrund:    grey-100 / gradient-overlay
```

---

## Gradienter och specialeffekter

### Bakgrundsövergång (hero → content)

```css
background: linear-gradient(to bottom, #0a0a0a, #ffffff);
```

Används för att mjukt övergå mellan hero-sektionen och ljusare innehåll.

### Subtil glow / inset shadow

```css
box-shadow: inset 4px 0 24px rgba(0, 0, 0, 0.3);
```

Används på navigations-sidebar och djupa paneler för djupkänsla.

### Blur-effekter

```
--blur-sm:  8px   — subtila overlay-effekter
--blur-lg:  16px  — backdrop blur på modaler och glaskort
--blur-3xl: 64px  — dekorativa bakgrundselement (estimerat)
```

---

## Ton och röst

### Karaktär

Direkt, kunnig och mänsklig. Axona Digital skriver som en kompetent kollega, inte som ett företag. De förklarar komplex teknik utan jargong och lyfter alltid nyttan för kunden snarare än tekniken i sig.

### Formellt vs. informellt

Informellt men professionellt. "Ni" används konsekvent (formellt ni på svenska, men med lättsam ton). Inga krångliga meningsstrukturer.

### Meningslängd

Korta till medellånga meningar. Punktsatser och listor föredras framför långa stycken. Max 2–3 meningar per stycke.

### Nyckelprinciper

- Problem-lösning-struktur: identifiera smärtan, presentera lösningen
- Konkreta resultat: "Utan att ni behöver förstå tekniken"
- Enkelhet framhävs aktivt: tekniken är osynlig, resultatet är synligt
- Personlig ton: grundarfoton används, inga stockbilder på anonyma team

### Exempel på röst

- "En hemsida som jobbar för affären" — resultatorienterat, inte teknikorienterat
- "Dygnet runt" — kortfattat, tydligt värde
- "Lösningar som faktiskt gör skillnad" — "faktiskt" signalerar äkthet och motverkar marketingsklang

---

## Bildstil

### Foton

Autentiska porträttfoton av grundarna (Rasmus Jönsson och Isak Persson). Inga generiska stockbilder. Få, välvalda foton.

### Illustrationer och mockups

Skärmdumpar av riktiga kundprojekt (t.ex. Isakssons Måleri). Processdiagram i enkel, linjär stil (sitemap → wireframe-flöde). Chattbot-mockups i SVG-format med konversationsbubblor.

### Ikoner

Minimal ikonanvändning. Mail och plats i footer. Diamantsymbolen (♦) i accent-blå används som logotypaccentelement. Inga dekorativa ikonbibliotek.

### Fotostil

Ljust och naturligt. Inga dramatiska filter. Foton på grundarna är avslappnade men professionella — kontor eller neutral bakgrund.

---

## Övrigt

### Border-radius

```
Standard kortradier:  0.625rem (10px) — var(--radius)
Knappar:              9999px (rounded-full)
Bilder/avatarer:      16px (rounded-2xl)
```

### Animationer

Subtila övergångar på 150ms (standard). Pulse och ping för status-indikatorer. Inga flashiga animationer — rörelsen är funktionell, inte dekorativ.

### Rutnät och layout

Maxbredd: 80rem (1280px, 7xl). Sektionspadding: py-16 till py-24. Mobilanpassad med responsiv kolumnlayout (1 → 2 → 3 kolumner).
