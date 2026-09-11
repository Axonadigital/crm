/**
 * Branschklassificerare — vilket ERBJUDANDE ett företag ska få, inte hur bra
 * deras hemsida är.
 *
 * Bakgrund (2026-09-11): leadkretsen var byggd på EN premiss — dålig hemsida.
 * Två tredjedelar av alla scannade företag (56 av 86) låg över 50 poäng och
 * fångades därför av ingen sekvens alls. De företagen behöver inte en ny
 * hemsida, men många av dem har ett återkommande handjobb som ett internt
 * system löser. För att kunna säga något konkret i mejlet måste vi veta
 * vilken bransch de är i.
 *
 * Tre källor i fallande tillförlitlighet:
 *   1. SNI-kod  — officiell och entydig. Bolagsverkets egen indelning.
 *   2. Googles Places-kategori — finns ibland, men är oftast "establishment".
 *   3. Företagsnamnet — sist, och märkt som låg tillit.
 *
 * Modulen är ren och innehåller INGEN copy. Vad varje segment ska erbjudas
 * bestäms i mallarna, inte här.
 */

export type IndustrySegment =
  | "tandvard"
  | "bygg"
  | "vvs_el"
  | "maleri_golv"
  | "transport"
  | "fastighet"
  | "salong"
  | "restaurang"
  | "ovrigt";

export const ALL_SEGMENTS: IndustrySegment[] = [
  "tandvard", "bygg", "vvs_el", "maleri_golv", "transport",
  "fastighet", "salong", "restaurang", "ovrigt",
];

/** Läsbara etiketter för CRM:et och Mission Control. */
export const SEGMENT_LABELS: Record<IndustrySegment, string> = {
  tandvard: "Tandvård",
  bygg: "Bygg & entreprenad",
  vvs_el: "VVS & el",
  maleri_golv: "Måleri, golv & kakel",
  transport: "Transport & åkeri",
  fastighet: "Fastighet & städ",
  salong: "Salong & friskvård",
  restaurang: "Restaurang & café",
  ovrigt: "Övrigt",
};

/**
 * SNI 2007. Fyra siffror räcker för vår indelning.
 * Specialfallen står före de breda intervallen — 43.21 (el) och 43.22 (VVS)
 * är installatörer, inte byggare, och ska ha ett annat erbjudande.
 */
function sniToSegment(code: number): IndustrySegment | null {
  // Exakta koder först.
  const exact: Record<number, IndustrySegment> = {
    8623: "tandvard",   // tandläkarverksamhet
    4321: "vvs_el",     // elinstallationer
    4322: "vvs_el",     // VVS- och klimatinstallationer
    4333: "maleri_golv", // golv- och väggbeläggningsarbeten
    4334: "maleri_golv", // måleri- och glasmästeriarbeten
    9602: "salong",     // hår- och skönhetsvård
  };
  if (exact[code]) return exact[code];

  const two = Math.floor(code / 100);
  if (two === 41 || two === 42 || two === 43) return "bygg";
  if (two >= 49 && two <= 53) return "transport";
  if (two === 56) return "restaurang";
  if (two === 68 || two === 81) return "fastighet";
  if (two === 96) return "salong";
  if (two === 86) return "tandvard";
  return null;
}

/** "43.22" och "4322" ger samma svar. Okänt ger null, inte en gissning. */
export function segmentFromSni(
  raw: string | null | undefined,
): IndustrySegment | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length < 2) return null;
  const code = Number.parseInt(digits.slice(0, 4).padEnd(4, "0"), 10);
  if (!Number.isFinite(code)) return null;
  return sniToSegment(code);
}

/** Googles toppkategorier som inte säger något om branschen. */
const EMPTY_PLACES_CATEGORIES = new Set([
  "establishment", "point_of_interest", "store", "business", "finance",
  "health", "food", "general_contractor_", "premise",
]);

const PLACES_MAP: Record<string, IndustrySegment> = {
  dentist: "tandvard",
  dental_clinic: "tandvard",
  doctor: "tandvard",
  plumber: "vvs_el",
  electrician: "vvs_el",
  hvac_contractor: "vvs_el",
  painter: "maleri_golv",
  flooring_contractor: "maleri_golv",
  roofing_contractor: "bygg",
  general_contractor: "bygg",
  carpenter: "bygg",
  masonry_contractor: "bygg",
  moving_company: "transport",
  taxi_stand: "transport",
  trucking_company: "transport",
  car_rental: "transport",
  real_estate_agency: "fastighet",
  cleaning_service: "fastighet",
  hair_care: "salong",
  beauty_salon: "salong",
  spa: "salong",
  physiotherapist: "salong",
  restaurant: "restaurang",
  cafe: "restaurang",
  bakery: "restaurang",
  bar: "restaurang",
  meal_takeaway: "restaurang",
};

export function segmentFromPlacesCategory(
  raw: string | null | undefined,
): IndustrySegment | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase().replace(/\s+/g, "_");
  if (EMPTY_PLACES_CATEGORIES.has(key)) return null;
  return PLACES_MAP[key] ?? null;
}

/**
 * Namnmönster, prövade i ordning. De SPECIFIKA står före de generiska:
 * "Vvs Entreprenad" ska bli vvs_el och inte bygg, och "ByggKeramik" sätter
 * kakel trots att namnet börjar på Bygg.
 *
 * Bygg prövas före fastighet: "Backmans Bygg & Fastighetsservice AB" är en
 * byggfirma som också sköter fastigheter, inte tvärtom. Ledordet vinner.
 *
 * "el" kan aldrig matchas som delsträng — hotell, handel och modell innehåller
 * bokstäverna. Därför ordgräns eller ett efterled som gör det entydigt.
 * Samma sak gäller efterleden: "elservice" utan ordgräns matchade inuti
 * "kakelservice" och gjorde en kakelfirma till en elfirma.
 */
const NAME_PATTERNS: [IndustrySegment, RegExp][] = [
  ["tandvard", /tandl[äa]k|tandv[åa]rd|tandklinik|tandhygien|dental|dentist|tandteknik|tandfen/],
  ["salong", /fris[öo]r|salong|skönhet|massage|naprapat|kiropraktor|hudv[åa]rd|barberare/],
  ["restaurang", /restaurang|pizzeri|caf[ée]\b|bageri|konditori|catering|krog|glassbar/],
  ["vvs_el", /\bvvs\b|\br[öo]r\b|r[öo]rläggeri|ventilation|\bkyla\b|elektr|\bel\b|\bel[-\s]?(service|installation|entreprenad|firma|tekn|montage|arbete)|energi\b/],
  ["maleri_golv", /m[åa]leri|m[åa]lare|\bf[äa]rg\b|kakel|keramik|\bgolv|plattsätt|tapets/],
  ["transport", /[åa]keri|transport|taxi|\bflytt|budbil|logistik|kranbil|bussbolag|schakt/],
  ["bygg", /bygg|snickeri|snickare|snickr|entrepren|\bmark\b|markservice|markarbet|\btak\b|takteknik|takl[äa]gg|pl[åa]tslag|\bmur\b|murare|murning|fasad|betong|anl[äa]ggning|gr[äa]v|borrtj[äa]nst|borrning|skorsten|grund\b/],
  ["fastighet", /st[äa]dservice|st[äa]dfirma|\bst[äa]d\b|lokalv[åa]rd|fastighetsservice|fastighetssk[öo]t|f[öo]rvaltning/],
];

export function segmentFromName(
  raw: string | null | undefined,
): IndustrySegment | null {
  if (!raw) return null;
  const name = raw.toLowerCase();
  for (const [segment, pattern] of NAME_PATTERNS) {
    if (pattern.test(name)) return segment;
  }
  return null;
}

/**
 * Allabolags egen branschindelning, utvunnen ur länken. Deras URL:er ser ut så
 * här: /foretag/{namn}/{ort}/{bransch}/{id} — branschen står alltså gratis i
 * adressen, utan att sidan behöver skrapas.
 *
 * Det här visade sig vara en bättre källa än SNI i praktiken: SNI-koden går
 * inte att läsa ur sidans HTML längre (regexen gav "next-head=" 2026-09-11),
 * medan 156 företag redan hade allabolag-länken sparad i enrichment_data.
 */
const ALLABOLAG_MAP: Record<string, IndustrySegment> = {
  "byggmastare": "bygg",
  "entreprenorer": "bygg",
  "byggentreprenader-infrastruktur": "bygg",
  "byggnadssnickerier": "bygg",
  "markarbeten": "bygg",
  "takarbeten": "bygg",
  "vvs-arbeten-material-och-produkter": "vvs_el",
  "vvs-arbeten": "vvs_el",
  "elinstallationer": "vvs_el",
  "elarbeten": "vvs_el",
  "ventilation": "vvs_el",
  "malare": "maleri_golv",
  "maleriarbeten": "maleri_golv",
  "golv-och-mattlaggning": "maleri_golv",
  "transportformedling": "transport",
  "passagerartransporter": "transport",
  "akerier": "transport",
  "taxi": "transport",
  "flyttfirmor": "transport",
  "stadservice": "fastighet",
  "fastighetsforvaltning": "fastighet",
  "fastighetsbolag-lokaler": "fastighet",
  "fastighetsbolag-bostader": "fastighet",
  "restauranger": "restaurang",
  "kafeer": "restaurang",
  "bagerier": "restaurang",
  "catering": "restaurang",
  "tandlakare": "tandvard",
  "tandvard": "tandvard",
  "frisorer": "salong",
  "skonhetsvard": "salong",
  "massage": "salong",
};

/** å/ä/ö → a/a/o, så procentkodning och svenska tecken ger samma nyckel. */
function slugKey(raw: string): string {
  let value = raw.trim().toLowerCase();
  try {
    value = decodeURIComponent(value);
  } catch {
    // Trasig procentkodning — fortsätt med råvärdet.
  }
  return value
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/é/g, "e")
    .replace(/[^a-z0-9-]/g, "");
}

/** Plockar branschdelen ur en allabolag-länk. */
export function allabolagCategoryFromUrl(
  url: string | null | undefined,
): string | null {
  if (!url || !url.includes("allabolag.se")) return null;
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return null;
  }
  const parts = path.split("/").filter((p) => p !== "");
  // ["foretag", namn, ort, bransch, id] — branschen är fjärde delen.
  if (parts.length < 4) return null;
  const category = parts[3];
  if (!category || category === "-") return null;
  return category;
}

export function segmentFromAllabolagCategory(
  raw: string | null | undefined,
): IndustrySegment | null {
  if (!raw) return null;
  return ALLABOLAG_MAP[slugKey(raw)] ?? null;
}

export interface ClassifyInput {
  name?: string | null;
  /** companies.industry — oftast Googles Places-kategori. */
  industry?: string | null;
  sniCode?: string | null;
  /** companies.allabolag_url eller länken ur enrichment_data. */
  allabolagUrl?: string | null;
}

export interface Classification {
  segment: IndustrySegment;
  source: "sni" | "allabolag" | "places" | "name" | "none";
  confidence: "high" | "medium" | "low" | "none";
}

/**
 * Klassificerar ett företag. Ett okänt företag blir "ovrigt" med källa
 * "none" — aldrig en gissning som ser ut som ett faktum.
 */
export function classifyCompany(input: ClassifyInput): Classification {
  const fromSni = segmentFromSni(input.sniCode);
  if (fromSni) return { segment: fromSni, source: "sni", confidence: "high" };

  const fromAllabolag = segmentFromAllabolagCategory(
    allabolagCategoryFromUrl(input.allabolagUrl),
  );
  if (fromAllabolag) {
    // "byggmästare" är Allabolags breda samlingspost. Säger namnet däremot
    // entydigt VVS eller kakel är det en precisering inom samma familj, och
    // då är namnet det bättre svaret — Östersunds Kakelservice AB ligger
    // under byggmästare men ska ha kakelerbjudandet.
    const refined = segmentFromName(input.name);
    if (
      fromAllabolag === "bygg" &&
      (refined === "vvs_el" || refined === "maleri_golv")
    ) {
      return { segment: refined, source: "name", confidence: "medium" };
    }
    return { segment: fromAllabolag, source: "allabolag", confidence: "high" };
  }

  const fromPlaces = segmentFromPlacesCategory(input.industry);
  if (fromPlaces) {
    return { segment: fromPlaces, source: "places", confidence: "medium" };
  }

  const fromName = segmentFromName(input.name);
  if (fromName) return { segment: fromName, source: "name", confidence: "low" };

  return { segment: "ovrigt", source: "none", confidence: "none" };
}
