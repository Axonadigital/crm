/**
 * Remediation catalog: maps each analysis finding `key` to concrete technical
 * actions for Axona's stack (Next.js App Router + Tailwind CSS). Used by
 * buildWebsiteChecklist to turn generic findings into a checklist Claude can
 * work through with the customer's website repo open.
 *
 * `codeFixable: true`  → an action Claude can do directly in the website repo.
 * `codeFixable: false` → operational/manual work (Google Business, reviews).
 *
 * Keys mirror computeFindings() in
 * supabase/functions/analyze_website/findings.ts — keep in sync if findings change.
 */

export type RemediationArea =
  | "Prestanda"
  | "SEO"
  | "AI-sök"
  | "Google Business"
  | "Innehåll";

export type RemediationEntry = {
  codeFixable: boolean;
  area: RemediationArea;
  steps: string[];
};

export const REMEDIATION_CATALOG: Record<string, RemediationEntry> = {
  // --- Prestanda -----------------------------------------------------------
  slow_site: {
    codeFixable: true,
    area: "Prestanda",
    steps: [
      "Konvertera alla bilder till WebP/AVIF och servera via next/image med explicit width/height (undvik layout shift).",
      'Lazy-load bilder under fold (loading="lazy") och prioritera hero-bilden med priority.',
      "Koddela tunga klientkomponenter med next/dynamic och ssr:false där det går.",
      'Eliminera render-blocking CSS/JS — flytta tredjepartsskript till next/script med strategy="lazyOnload".',
      "Preconnect/preload kritiska fonts; använd next/font för självhostade typsnitt utan extra request.",
      "Aktivera caching/ISR där innehållet är statiskt; minimera klient-JS-bundeln (analysera med @next/bundle-analyzer).",
    ],
  },
  improvable_speed: {
    codeFixable: true,
    area: "Prestanda",
    steps: [
      "Optimera de tyngsta bilderna (next/image, rätt storlek, WebP/AVIF).",
      'Skjut upp icke-kritiska tredjepartsskript med next/script strategy="lazyOnload".',
      "Trimma klient-JS: gör komponenter till Server Components där interaktivitet inte behövs.",
    ],
  },

  // --- SEO -----------------------------------------------------------------
  low_seo_score: {
    codeFixable: true,
    area: "SEO",
    steps: [
      "Gå igenom Lighthouse SEO-auditen punkt för punkt.",
      "Säkerställ unika title + meta description per sida, alt-text på alla bilder och beskrivande länktext.",
      "Verifiera att sidorna är crawlbara (ingen oavsiktlig noindex/robots-blockering).",
    ],
  },
  missing_title: {
    codeFixable: true,
    area: "SEO",
    steps: [
      "Sätt en unik, sökordsrik <title> via Next.js metadata-export i app/layout.tsx (default) och per sida med generateMetadata.",
      "Håll titeln ~50–60 tecken och inkludera ort + tjänst för lokal SEO.",
    ],
  },
  noindex: {
    codeFixable: true,
    area: "SEO",
    steps: [
      "KRITISK: startsidan är blockerad från indexering. Ta bort noindex.",
      "Kontrollera metadata.robots i layout/page, eventuell X-Robots-Tag-header i middleware/next.config, och robots.txt.",
      "Begär omindexering i Google Search Console efter fix.",
    ],
  },
  missing_meta_description: {
    codeFixable: true,
    area: "SEO",
    steps: [
      "Lägg till metadata.description (≈150–160 tecken, sökordsrik och säljande) i Next.js metadata-export per sida.",
    ],
  },
  missing_sitemap: {
    codeFixable: true,
    area: "SEO",
    steps: [
      "Lägg app/sitemap.ts som genererar sitemap.xml dynamiskt från sidlistan.",
      "Referera sitemapen i robots.txt (app/robots.ts) och skicka in den i Google Search Console.",
    ],
  },
  missing_h1: {
    codeFixable: true,
    area: "SEO",
    steps: [
      "Säkerställ exakt en <h1> per sida med det primära sökordet.",
      "Bygg en logisk rubrikhierarki (h1 → h2 → h3), inte hoppande nivåer.",
    ],
  },

  // --- AI-sök --------------------------------------------------------------
  missing_schema_org: {
    codeFixable: true,
    area: "AI-sök",
    steps: [
      'Lägg JSON-LD strukturerad data som <script type="application/ld+json"> i app/layout.tsx.',
      "Använd LocalBusiness/Organization-schema: namn, adress, telefon, öppettider, geo, sameAs (sociala länkar).",
      "Lägg Service- och FAQPage-schema på relevanta sidor så AI och Google förstår utbudet.",
    ],
  },
  missing_llms_txt: {
    codeFixable: true,
    area: "AI-sök",
    steps: [
      "Skapa public/llms.txt enligt llmstxt.org: kort företagsbeskrivning, tjänster, kontaktinfo och länkar till nyckelsidor.",
      "Håll den uppdaterad så AI-modeller kan citera korrekt info om företaget.",
    ],
  },

  // --- Innehåll ------------------------------------------------------------
  missing_og_tags: {
    codeFixable: true,
    area: "Innehåll",
    steps: [
      "Lägg openGraph i Next.js metadata (title, description, url, type) + en og-bild 1200×630.",
      "Lägg twitter-card (summary_large_image) så delningar ser bra ut.",
    ],
  },

  // --- Search Console / synlighet (innehåll + SEO) -------------------------
  no_search_visibility: {
    codeFixable: true,
    area: "Innehåll",
    steps: [
      "Sajten syns knappt i Google. Bygg/optimera landningssidor för de viktigaste tjänsterna + orterna.",
      "Säkerställ indexering (sitemap inskickad, ingen noindex) och bygg internlänkning till nyckelsidor.",
      "Skapa innehåll som matchar lokala sökintentioner (tjänst + ort).",
    ],
  },
  no_clicks: {
    codeFixable: true,
    area: "Innehåll",
    steps: [
      "Visningar men inga klick → titlar/meta säljer inte i sökresultatet.",
      "Skriv om title + meta description för högre CTR (förmån + ort + call-to-action).",
      "Lägg strukturerad data för rich results (recensioner, FAQ) som sticker ut i SERP:en.",
    ],
  },
  low_position: {
    codeFixable: true,
    area: "SEO",
    steps: [
      "Nära förstasidan på flera sökord — pusha de som ligger på position 4–10 (snabbaste vinsten).",
      "Stärk on-page för måltavle-sökorden: title, H1, innehållsdjup och interna länkar.",
      "Bygg ut innehållet på de sidor som rankar för dessa termer.",
    ],
  },

  // --- Google Business (operativt, ej kod) ---------------------------------
  missing_business_profile: {
    codeFixable: false,
    area: "Google Business",
    steps: [
      "Skapa/claima en Google Business-profil (Google Business Profile) för företaget.",
      "Fyll i namn, kategori, adress, öppettider, tjänster, foton och webblänk.",
    ],
  },
  few_reviews: {
    codeFixable: false,
    area: "Google Business",
    steps: [
      "Sätt upp en rutin för att be nöjda kunder om recensioner (skicka recensionslänk efter avslutat jobb).",
      "Svara på alla recensioner — det stärker både ranking och förtroende.",
    ],
  },
  low_rating: {
    codeFixable: false,
    area: "Google Business",
    steps: [
      "Adressera grundorsaken till låga betyg och bemöt negativa recensioner professionellt.",
      "Driv in fler färska, positiva recensioner för att lyfta snittet.",
    ],
  },
};

/** Fallback for an unknown finding key (keeps the checklist robust). */
export const DEFAULT_REMEDIATION: RemediationEntry = {
  codeFixable: true,
  area: "SEO",
  steps: ["Granska bristen och åtgärda enligt beskrivningen ovan."],
};

export function getRemediation(key: string): RemediationEntry {
  return REMEDIATION_CATALOG[key] ?? DEFAULT_REMEDIATION;
}
