/**
 * Default copy values for premium quote template sections — frontend mirror.
 *
 * SYNC CONTRACT: This file is a copy of
 *   supabase/functions/_shared/quoteWorkflow/sectionDefaults.ts
 * kept in sync manually across the Deno↔Vite runtime boundary.
 * When editing defaults, update BOTH files.
 * A future task will automate this sync check.
 *
 * Used by:
 *  - QuoteShow.tsx: draft initialisation (pad missing array items with defaults)
 *  - QuoteSectionEditor.tsx: ArraySectionEditor knows the fixed-length shapes
 */

import type {
  QuoteGeneratedSections,
  QuoteHighlightCard,
  QuoteProblemCard,
  QuoteProcessStep,
  QuoteSupportCard,
  QuoteTechItem,
  QuoteFounderCard,
  QuoteAboutFact,
  QuoteUpgradePackage,
} from "@/components/atomic-crm/types";

export const DEFAULT_HIGHLIGHT_CARDS: QuoteHighlightCard[] = [
  { icon: "palette", title: "Skräddarsydd design", text: "Anpassad efter ert varumärke" },
  { icon: "smartphone", title: "Mobilanpassat", text: "Fungerar på alla enheter" },
  { icon: "rocket", title: "Snabb lansering", text: "Leverans inom 2-6 veckor" },
];

export const DEFAULT_PROBLEM_CARDS: QuoteProblemCard[] = [
  {
    number: "01",
    title: "Svårt att bli hittad",
    text: "Utan en hemsida syns ni inte när potentiella kunder söker efter era tjänster online. Konkurrenter med en webbplats fångar dessa förfrågningar.",
  },
  {
    number: "02",
    title: "Svårt att visa vad ni gör",
    text: "Utan en samlad plats att visa era tjänster, kompetens och kontaktuppgifter blir det svårare för kunder att bedöma och lita på er.",
  },
  {
    number: "03",
    title: "Förlorade förfrågningar",
    text: "Varje dag söker potentiella kunder online. Utan en webbplats går dessa förfrågningar till konkurrenter som syns.",
  },
];

export const DEFAULT_PACKAGE_INCLUDES: string[] = [
  "Skräddarsydd design",
  "Mobilanpassat",
  "SEO-optimerad struktur",
  "Kontaktformulär",
  "SSL-certifikat",
];

export const DEFAULT_UPGRADE_PACKAGE: NonNullable<QuoteUpgradePackage> = {
  title: "Flersidig hemsida",
  description:
    "Vill ni ha mer utrymme att presentera era tjänster, projekt och ert team? Uppgradera till en flersidig hemsida med dedikerade undersidor.",
  price: "Offert på begäran",
  includes: [
    "Upp till 5 undersidor",
    "Dedikerad tjänstesida",
    "Om oss-sida med teamet",
    "Referensprojekt-sida",
    "Blogg eller nyhetssektion",
  ],
  benefits: [
    "Mer utrymme att berätta er historia",
    "Bättre SEO med fler indexerbara sidor",
    "Professionellare intryck för större kunder",
  ],
};

export const DEFAULT_PROCESS_STEPS: QuoteProcessStep[] = [
  {
    number: "01",
    title: "Signering & uppstart",
    text: "Ni godkänner offerten. Vi samlar in material — logga, texter, bilder — och påbörjar designarbetet.",
  },
  {
    number: "02",
    title: "Demoversion klar",
    text: "Vi presenterar en komplett demoversion av er hemsida som ni kan granska och ge feedback på.",
  },
  {
    number: "03",
    title: "Korrigeringar",
    text: "Vi justerar efter era önskemål. Upp till två korrigeringsrundor ingår i priset.",
  },
  {
    number: "04",
    title: "Lansering",
    text: "Vi publicerar hemsidan, kopplar domänen och säkerställer att allt fungerar. Ni äger allt.",
  },
];

export const DEFAULT_SUPPORT_CARDS: QuoteSupportCard[] = [
  {
    icon: "check-circle",
    title: "Innan lansering",
    text: "Upp till två korrigeringsrundor ingår i priset efter att demoversionen presenterats. Vi finslipar tills ni är nöjda.",
  },
  {
    icon: "edit",
    title: "Egna ändringar",
    text: "Hemsidan byggs i Builder.io — ni kan själva göra enklare justeringar av texter och bilder utan att behöva kontakta oss.",
  },
  {
    icon: "headphones",
    title: "Support efter lansering",
    text: "Behöver ni hjälp med ändringar efter lansering? Vi finns tillgängliga på timdebitering — 1 500 kr/h exkl. moms.",
  },
  {
    icon: "shield",
    title: "Full äganderätt",
    text: "Vid leverans äger ni hemsidan helt. Inga inlåsningseffekter, inga löpande avgifter från vårt håll.",
  },
];

export const DEFAULT_TECH_ITEMS: QuoteTechItem[] = [
  { icon: "smartphone", title: "Mobilanpassat", text: "Perfekt på alla enheter" },
  { icon: "search", title: "SEO-optimerat", text: "Syns på Google lokalt" },
  { icon: "zap", title: "Snabb laddtid", text: "Optimerad prestanda" },
  { icon: "lock", title: "SSL-krypterad", text: "Säker anslutning" },
];

export const DEFAULT_FOUNDERS: QuoteFounderCard[] = [
  {
    initials: "RJ",
    name: "Rasmus Jönsson",
    role: "Medgrundare & Teknisk ansvarig",
    description:
      "Ansvarar för teknik och implementation. Fokuserar på robusta lösningar och att varje leverans ger mätbar effekt.",
  },
  {
    initials: "IP",
    name: "Isak Persson",
    role: "Medgrundare & Affärsutveckling",
    description:
      "Ansvarar för affärsutveckling och uppföljning. Varje lösning ska ha ett tydligt syfte och ett resultat ni kan följa.",
  },
];

export const DEFAULT_ABOUT_FACTS: QuoteAboutFact[] = [
  { value: "2–6 v", label: "Typisk leveranstid" },
  { value: "100%", label: "Äganderätt till kunden" },
  { value: "24h", label: "Svar på förfrågningar" },
  { value: "0 kr", label: "Löpande kostnad" },
];

// ── Scalar defaults ──

export const DEFAULT_PACKAGE_SECTION_TITLE = "Välj det som passar er";
export const DEFAULT_PACKAGE_SECTION_TEXT =
  "Paketet nedan är skräddarsytt för er verksamhet och era behov.";
export const DEFAULT_REFERENCE_SECTION_TITLE = "Hemsidor vi har byggt";
export const DEFAULT_REFERENCE_SECTION_TEXT =
  "Här är ett urval av webbplatser vi levererat — både ensidiga och flersidiga lösningar för företag i liknande branscher.";
// problem_section_title intentionally absent — derived from companySector in generate_quote_pdf
export const DEFAULT_PROCESS_SECTION_TITLE = "Från signering till lanserad hemsida";
export const DEFAULT_PROCESS_SECTION_TEXT =
  "En tydlig process där ni alltid vet vad som händer härnäst.";
export const DEFAULT_SUPPORT_SECTION_TITLE = "Vad som gäller efter lansering";
export const DEFAULT_TECH_SECTION_TITLE = "Byggt för att synas och prestera";
export const DEFAULT_ABOUT_SECTION_TITLE = "Vilka är Axona Digital?";
export const DEFAULT_ABOUT_SECTION_TEXT =
  "Vi är en digital byrå i Östersund som hjälper svenska företag med hemsidor, e-handel och AI-lösningar. Varje leverans ska ge mätbar effekt — inte bara se bra ut.";
export const DEFAULT_UPGRADE_BENEFITS_TITLE = "Fördelar med en flersidig hemsida";
export const DEFAULT_REFERENCE_CTA_LABEL = "Besök sidan →";
export const DEFAULT_PRICE_SUMMARY_TITLE = "Sammanfattning";
export const DEFAULT_TERMS_SECTION_TITLE = "Det här gäller för offerten";

/**
 * Normalise a draft sections object on the frontend.
 *
 * Rules (matching backend normalizePremiumSections):
 *  - For each fixed-length array: pad with defaults if too short.
 *    NEVER truncate — extra items are preserved so save round-trips are lossless.
 *  - For scalars: fill with default if falsy.
 *  - upgrade_package: fill default only when key is absent (null = hide upsell).
 *
 * Mutates the object in place. Idempotent.
 */
export function normalizeClientSections(
  sections: Partial<QuoteGeneratedSections>,
): void {
  const s = sections as Record<string, unknown>;

  // Arrays — pad if too short, never truncate
  if (!Array.isArray(s.highlight_cards) || (s.highlight_cards as unknown[]).length === 0)
    s.highlight_cards = [...DEFAULT_HIGHLIGHT_CARDS];

  if (!Array.isArray(s.problem_cards) || (s.problem_cards as unknown[]).length === 0)
    s.problem_cards = [...DEFAULT_PROBLEM_CARDS];

  if (!Array.isArray(s.package_includes) || (s.package_includes as unknown[]).length === 0)
    s.package_includes = [...DEFAULT_PACKAGE_INCLUDES];

  if (!("upgrade_package" in s))
    s.upgrade_package = { ...DEFAULT_UPGRADE_PACKAGE };

  // Fixed-length arrays — pad only, never truncate (extra items survive save)
  const stepsArr = Array.isArray(s.process_steps)
    ? (s.process_steps as QuoteProcessStep[])
    : [];
  if (stepsArr.length < DEFAULT_PROCESS_STEPS.length) {
    s.process_steps = [
      ...stepsArr,
      ...DEFAULT_PROCESS_STEPS.slice(stepsArr.length),
    ];
  }

  const cardsArr = Array.isArray(s.support_cards)
    ? (s.support_cards as QuoteSupportCard[])
    : [];
  if (cardsArr.length < DEFAULT_SUPPORT_CARDS.length) {
    s.support_cards = [
      ...cardsArr,
      ...DEFAULT_SUPPORT_CARDS.slice(cardsArr.length),
    ];
  }

  const techArr = Array.isArray(s.tech_items)
    ? (s.tech_items as QuoteTechItem[])
    : [];
  if (techArr.length < DEFAULT_TECH_ITEMS.length) {
    s.tech_items = [...techArr, ...DEFAULT_TECH_ITEMS.slice(techArr.length)];
  }

  const foundersArr = Array.isArray(s.founders)
    ? (s.founders as QuoteFounderCard[])
    : [];
  if (foundersArr.length < DEFAULT_FOUNDERS.length) {
    s.founders = [
      ...foundersArr,
      ...DEFAULT_FOUNDERS.slice(foundersArr.length),
    ];
  }

  if (!Array.isArray(s.about_facts) || (s.about_facts as unknown[]).length === 0)
    s.about_facts = [...DEFAULT_ABOUT_FACTS];

  // Scalars
  if (!s.package_section_title) s.package_section_title = DEFAULT_PACKAGE_SECTION_TITLE;
  if (!s.package_section_text) s.package_section_text = DEFAULT_PACKAGE_SECTION_TEXT;
  if (!s.reference_section_title) s.reference_section_title = DEFAULT_REFERENCE_SECTION_TITLE;
  if (!s.reference_section_text) s.reference_section_text = DEFAULT_REFERENCE_SECTION_TEXT;
  if (!s.process_section_title) s.process_section_title = DEFAULT_PROCESS_SECTION_TITLE;
  if (!s.process_section_text) s.process_section_text = DEFAULT_PROCESS_SECTION_TEXT;
  if (!s.support_section_title) s.support_section_title = DEFAULT_SUPPORT_SECTION_TITLE;
  if (!s.tech_section_title) s.tech_section_title = DEFAULT_TECH_SECTION_TITLE;
  if (!s.about_section_title) s.about_section_title = DEFAULT_ABOUT_SECTION_TITLE;
  if (!s.about_section_text) s.about_section_text = DEFAULT_ABOUT_SECTION_TEXT;
  if (!s.upgrade_benefits_title) s.upgrade_benefits_title = DEFAULT_UPGRADE_BENEFITS_TITLE;
  if (!s.reference_cta_label) s.reference_cta_label = DEFAULT_REFERENCE_CTA_LABEL;
  if (!s.price_summary_title) s.price_summary_title = DEFAULT_PRICE_SUMMARY_TITLE;
  if (!s.terms_section_title) s.terms_section_title = DEFAULT_TERMS_SECTION_TITLE;
}
