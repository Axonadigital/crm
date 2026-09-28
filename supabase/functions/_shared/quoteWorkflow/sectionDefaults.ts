/**
 * Default copy values for premium quote template sections.
 *
 * Runtime-neutral: no imports, no Deno APIs, no Node APIs.
 * Safe to import from both Deno (edge functions) and frontend (Vite/React).
 *
 * SOURCE OF TRUTH for default copy content.
 * Frontend mirror: src/lib/quoteSectionDefaults.ts
 * — keep in sync when editing defaults here.
 *
 * Normalization logic lives in normalizeSections.ts (backend only).
 * Frontend normalization logic lives in src/lib/quoteSectionDefaults.ts.
 */

// ── Types (inlined to avoid cross-runtime import issues) ──

export interface DefaultHighlightCard {
  icon: string;
  title: string;
  text: string;
}

export interface DefaultProblemCard {
  number: string;
  title: string;
  text: string;
}

export interface DefaultProcessStep {
  number: string;
  title: string;
  text: string;
}

export interface DefaultSupportCard {
  icon: string;
  title: string;
  text: string;
}

export interface DefaultTechItem {
  icon: string;
  title: string;
  text: string;
}

export interface DefaultFounder {
  initials: string;
  name: string;
  role: string;
  description: string;
}

export interface DefaultAboutFact {
  value: string;
  label: string;
}

export interface DefaultUpgradePackage {
  title: string;
  description: string;
  price: string;
  includes: string[];
  benefits: string[];
}

// ── Array defaults ──

export const DEFAULT_HIGHLIGHT_CARDS: DefaultHighlightCard[] = [
  {
    icon: "palette",
    title: "Skräddarsydd design",
    text: "Anpassad efter ert varumärke",
  },
  {
    icon: "smartphone",
    title: "Mobilanpassat",
    text: "Fungerar på alla enheter",
  },
  {
    icon: "rocket",
    title: "Snabb lansering",
    text: "Leverans inom 2-6 veckor",
  },
];

export const DEFAULT_PROBLEM_CARDS: DefaultProblemCard[] = [
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

export const DEFAULT_UPGRADE_PACKAGE: DefaultUpgradePackage = {
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

export const DEFAULT_PROCESS_STEPS: DefaultProcessStep[] = [
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

export const DEFAULT_SUPPORT_CARDS: DefaultSupportCard[] = [
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

export const DEFAULT_TECH_ITEMS: DefaultTechItem[] = [
  {
    icon: "smartphone",
    title: "Mobilanpassat",
    text: "Perfekt på alla enheter",
  },
  { icon: "search", title: "SEO-optimerat", text: "Syns på Google lokalt" },
  { icon: "zap", title: "Snabb laddtid", text: "Optimerad prestanda" },
  { icon: "lock", title: "SSL-krypterad", text: "Säker anslutning" },
];

export const DEFAULT_FOUNDERS: DefaultFounder[] = [
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

export const DEFAULT_ABOUT_FACTS: DefaultAboutFact[] = [
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
export const DEFAULT_PROCESS_SECTION_TITLE =
  "Från signering till lanserad hemsida";
export const DEFAULT_PROCESS_SECTION_TEXT =
  "En tydlig process där ni alltid vet vad som händer härnäst.";
export const DEFAULT_SUPPORT_SECTION_TITLE = "Vad som gäller efter lansering";
export const DEFAULT_TECH_SECTION_TITLE = "Byggt för att synas och prestera";
export const DEFAULT_ABOUT_SECTION_TITLE = "Vilka är Axona Digital?";
export const DEFAULT_ABOUT_SECTION_TEXT =
  "Vi är en digital byrå i Östersund som hjälper svenska företag med hemsidor, e-handel och AI-lösningar. Varje leverans ska ge mätbar effekt — inte bara se bra ut.";
export const DEFAULT_UPGRADE_BENEFITS_TITLE =
  "Fördelar med en flersidig hemsida";
export const DEFAULT_REFERENCE_CTA_LABEL = "Besök sidan →";
export const DEFAULT_PRICE_SUMMARY_TITLE = "Sammanfattning";
export const DEFAULT_TERMS_SECTION_TITLE = "Det här gäller för offerten";
