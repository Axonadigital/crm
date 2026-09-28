// Copy för fyrstegsflödet "Outreach v5: uppmätt fynd", per krokfamilj.
//
// Bakgrund: research 2026-09-25 (~/axona-outreach-jev/research/RAPPORT.md,
// 113 fynd viktade med Jev). Det som fungerar mot små lokala företag är
// (1) en uppmätt observation om deras egen sajt, gjord samma dag,
// (2) ett arbetsprov som erbjudande — aldrig instruktioner de kan följa själva,
// (3) en namngiven referens i samma bransch, (4) uppföljningar med innehåll:
// 42–58 % av alla svar kommer från steg 2–4. Under 90 ord, en tanke, en fråga.
//
// Regler som gäller varje mening (sanningsregeln 2026-09-23, playbooken):
//  - påstå aldrig något om mottagarens NULÄGE som inte är uppmätt i fyndet;
//    beskriv vad leveransen visar eller vad som gäller efter åtgärd;
//  - inga priser, inga siffror om resultat, inga superlativ;
//  - "du" till läsaren, "ni/er" om företaget (Språkrådet);
//  - opt-out-raden sist (20 § MFL).
//
// Steg 1 öppning, steg 2 leveransen (bild eller "vad jag behöver"), steg 3
// referensen, steg 4 breakup. Varje familj bär sin egen text; motorn väljer
// familj på skanningens första mailable-fynd (scanFindings.rankFindings).

import { rankFindings, type ScanFinding } from "./scanFindings.ts";

export const OPT_OUT = "Säg till om du inte vill ha fler mejl från mig.";
export const VEM =
  "Jag driver Axona Digital i Östersund, vi bygger hemsidor åt lokala företag.";
/** Playbookens tak. Testerna håller varje renderad text under det. */
export const MAX_WORDS = 90;

export type KrokFamily =
  | "unreachable"
  | "slow-mobile"
  | "poor-crux"
  | "not-mobile"
  | "no-https"
  | "noindex"
  | "parked"
  | "no-gbp"
  | "no-site";

const FAMILY_BY_FINDING: Record<string, KrokFamily> = {
  unreachable: "unreachable",
  "http-error": "unreachable",
  "slow-mobile": "slow-mobile",
  "poor-crux": "poor-crux",
  "not-mobile": "not-mobile",
  "no-https": "no-https",
  noindex: "noindex",
  "robots-blocks-all": "noindex",
  parked: "parked",
  "no-gbp": "no-gbp",
  "no-site": "no-site",
  "no-real-website": "no-site",
};

export interface KrokContext {
  /** Kort bolagsnamn som det ska stå i mejlet. */
  namn: string;
  /** Värdnamn utan www, eller bolagsnamnet när sajt saknas. */
  sajt: string;
  ort: string;
  /** "i dag", "i går" eller "den 23 september" — se observationDay(). */
  dag: string;
  /** Uppmätt värde ur fyndets rubrik, t.ex. "38" ur "Långsam på mobil (38/100)". */
  varde: string | null;
  /** Namngiven referens i samma bransch, eller null. */
  referens: string | null;
}

interface FamilyCopy {
  /** Ämnesrad: 2–4 ord, gemener där det går, som en fråga. */
  amne: (c: KrokContext) => string;
  oppning: (c: KrokContext) => string;
  /** Erbjudandet med resultatet inbakat — vad leveransen visar, inte vad kunderna gör. */
  erbjudande: (c: KrokContext) => string;
  cta: (c: KrokContext) => string;
  /** Steg 2: kräver leveransen en bild (URL på enrollmenten) eller är den text? */
  bild: boolean;
  bildIntro: (c: KrokContext) => string;
  bildFraga: (c: KrokContext) => string;
  /** Steg 4. */
  breakup: (c: KrokContext) => string;
}

const BILD_CTA = "Vill du ha bilden? Två dagar, kostar inget.";
const BILD_INTRO_MOBIL = (c: KrokContext) =>
  `Här är bilden jag skrev om: ${c.sajt} i mobilen som den ser ut nu, och som den blir när det som drar ner mätningen mest är åtgärdat.`;
const BILD_FRAGA = () =>
  "Är det något ni vill gå vidare med? Svara så berättar jag vad som krävs och vad det skulle kosta. Ingen brådska.";
const BREAKUP_BILD = () =>
  "Jag lägger ner det här från min sida nu. Bilden gäller om ni vill plocka upp det senare, det är bara att svara på det här mejlet.";

export const FAMILIES: Record<KrokFamily, FamilyCopy> = {
  "slow-mobile": {
    amne: (c) => `${c.sajt} i mobilen?`,
    oppning: (c) =>
      `Jag kikade på ${c.sajt} ${c.dag} och Googles mobilmätning gav den ${c.varde} av 100. Känner ni igen siffran?`,
    erbjudande: (c) =>
      `Om ni vill tar vi fram en före/efter-bild av er startsida i mobilen: som den är nu, och som den blir när det som drar ner mätningen mest är åtgärdat.`,
    cta: () => BILD_CTA,
    bild: true,
    bildIntro: BILD_INTRO_MOBIL,
    bildFraga: BILD_FRAGA,
    breakup: BREAKUP_BILD,
  },
  "poor-crux": {
    amne: (c) => `${c.sajt} enligt Google?`,
    oppning: (c) =>
      `Jag kikade på ${c.sajt} ${c.dag}. Googles data från riktiga besökare säger att sidan upplevs som långsam. Stämmer det med er bild?`,
    erbjudande: () =>
      `Om ni vill tar vi fram en före/efter-bild av er startsida: som den är nu, och som den blir när det som drar ner mest är åtgärdat.`,
    cta: () => BILD_CTA,
    bild: true,
    bildIntro: BILD_INTRO_MOBIL,
    bildFraga: BILD_FRAGA,
    breakup: BREAKUP_BILD,
  },
  "not-mobile": {
    amne: (c) => `${c.sajt} i telefonen?`,
    oppning: (c) =>
      `Jag öppnade ${c.sajt} i telefonen ${c.dag} och fick den i datorstorlek: man får nypa och zooma för att läsa. Ser ni samma sak?`,
    erbjudande: () =>
      `Om ni vill tar vi fram en före/efter-bild av startsidan: som den är nu, och som den blir anpassad för telefonen.`,
    cta: () => BILD_CTA,
    bild: true,
    bildIntro: (c) =>
      `Här är bilden jag skrev om: ${c.sajt} i telefonen som den är nu, och som den blir anpassad för mobil.`,
    bildFraga: BILD_FRAGA,
    breakup: BREAKUP_BILD,
  },
  unreachable: {
    amne: (c) => `${c.sajt} svarar inte?`,
    oppning: (c) =>
      `Jag försökte öppna ${c.sajt} ${c.dag} och fick inget svar från servern. Är det känt hos er?`,
    erbjudande: () =>
      `Om ni vill tar vi reda på vad som hänt och får upp sidan igen, på samma adress som förut, med samma innehåll.`,
    cta: () => "Vill du att jag tittar på det? Besked inom två dagar, kostar inget.",
    bild: false,
    bildIntro: (c) =>
      `Jag lovade ett besked om ${c.sajt}. För att kunna säga var det stannar behöver jag veta var domänen och webbhotellet ligger, eller ett namn på den som skötte sidan senast.`,
    bildFraga: () =>
      "Svara med det du vet, så återkommer jag inom två dagar med vad som hänt och vad som krävs.",
    breakup: () =>
      "Jag lägger ner det här från min sida nu. Vill ni ha upp sidan igen senare är det bara att svara på det här mejlet.",
  },
  "no-https": {
    amne: (c) => `"Inte säker" på ${c.sajt}?`,
    oppning: (c) =>
      `Jag öppnade ${c.sajt} ${c.dag} och webbläsaren varnar "Inte säker" bredvid adressen, eftersom sidan saknar HTTPS-certifikat. Har ni sett det?`,
    erbjudande: () =>
      `Om ni vill ordnar vi certifikatet åt er, så att adressfältet visar ett hänglås i stället för varningen.`,
    cta: () => "Vill du att vi fixar det? Klart inom en dag, kostar inget.",
    bild: false,
    bildIntro: (c) =>
      `För att ordna certifikatet på ${c.sajt} behöver jag veta vilket webbhotell sidan ligger på. Oftast räcker ett namn, resten tar jag reda på.`,
    bildFraga: () =>
      "Svara med webbhotellet, så är det gjort inom en dag och jag skickar en skärmbild på hänglåset.",
    breakup: () =>
      "Jag lägger ner det här från min sida nu. Vill ni ha certifikatet ordnat senare är det bara att svara.",
  },
  noindex: {
    amne: (c) => `${c.sajt} avstängd från Google?`,
    oppning: (c) =>
      `Jag tittade på ${c.sajt} ${c.dag}: sidan har en inställning (noindex) som ber Google att inte visa den i sökresultaten. Är det avsiktligt?`,
    erbjudande: () =>
      `Om inte tar vi bort spärren åt er, så att sidan får visas i Googles sökresultat igen.`,
    cta: () => "Vill du att vi gör det? Klart inom en dag, kostar inget.",
    bild: false,
    bildIntro: (c) =>
      `För att ta bort spärren på ${c.sajt} behöver jag veta var sidan är byggd (WordPress, Wix, Loopia eller något annat). Ett namn räcker.`,
    bildFraga: () =>
      "Svara med det, så är det gjort inom en dag och jag skickar en skärmbild när Google visar sidan igen.",
    breakup: () =>
      "Jag lägger ner det här från min sida nu. Vill ni ha spärren borttagen senare är det bara att svara.",
  },
  parked: {
    amne: (c) => `${c.sajt} visar en platshållare?`,
    oppning: (c) =>
      `Jag öppnade ${c.sajt} ${c.dag} och fick upp webbhotellets standardsida i stället för er. Är sidan på gång, eller har den fastnat?`,
    erbjudande: (c) =>
      `Om ni vill skissar jag en förstasida för ${c.namn}, med vad ni gör, var, och hur man når er, och skickar den.`,
    cta: () => "Vill du se skissen? Den tar en vecka och kostar inget.",
    bild: true,
    bildIntro: (c) =>
      `Här är skissen jag skrev om: en förstasida för ${c.namn} med vad ni gör, var, och hur man når er.`,
    bildFraga: () =>
      "Är det åt rätt håll? Svara med vad som ska ändras, eller om ni vill att vi bygger den. Ingen brådska.",
    breakup: () =>
      "Jag lägger ner det här från min sida nu. Skissen gäller om ni vill plocka upp det senare, det är bara att svara.",
  },
  "no-gbp": {
    amne: (c) => `${c.namn} på Google Maps?`,
    oppning: (c) =>
      `Jag sökte på ${c.namn} på Google Maps ${c.dag} och hittade ingen företagsprofil. Har jag letat på fel namn, eller saknas den?`,
    erbjudande: () =>
      `Om den saknas sätter vi upp och verifierar den åt er, så att ni syns på kartan med nummer, öppettider och omdömen.`,
    cta: () => "Vill du att vi gör det? Uppe inom en vecka, kostar inget.",
    bild: false,
    bildIntro: (c) =>
      `För att sätta upp profilen för ${c.namn} behöver jag: er adress som den ska stå på kartan, öppettider, telefonnummer och två eller tre bilder på er eller era jobb.`,
    bildFraga: () =>
      "Svara med det ni har, så sätter jag upp profilen och skickar länken när Google godkänt den.",
    breakup: () =>
      "Jag lägger ner det här från min sida nu. Vill ni ha profilen uppsatt senare är det bara att svara.",
  },
  "no-site": {
    amne: (c) => `${c.namn} utan hemsida?`,
    oppning: (c) =>
      `Jag sökte på ${c.namn} ${c.dag} och hittade ingen egen hemsida, bara katalogsidor med telefonnummer. Har jag missat den?`,
    erbjudande: () =>
      `Om inte skissar jag gärna en förstasida för er, med vad ni gör, var, och hur man når er, och skickar den.`,
    cta: () => "Vill du se skissen? Den tar en vecka och kostar inget.",
    bild: true,
    bildIntro: (c) =>
      `Här är skissen jag skrev om: en förstasida för ${c.namn} med vad ni gör, var, och hur man når er.`,
    bildFraga: () =>
      "Är det åt rätt håll? Svara med vad som ska ändras, eller om ni vill att vi bygger den. Ingen brådska.",
    breakup: () =>
      "Jag lägger ner det här från min sida nu. Skissen gäller om ni vill plocka upp det senare, det är bara att svara.",
  },
};

/** Referenskund i samma bransch. Alla fem är publika hemsidecase på axonadigital.se/referenser. */
const REFERENCES: Record<string, string> = {
  vvs: "Roddar VVS",
  el: "Östersunds Elservice",
  bygg: "Tullus Bygg & Entreprenad",
  maleri_golv: "Isakssonmåleri",
  stad: "Viktorias Städservice",
};

/**
 * Allabolags länk bär branschen: /foretag/{namn}/{ort}/{bransch}/{id}.
 * "byggmästare" för Jemtel AB säger mer än ett namn som slutar på "-el".
 */
export function branchFromAllabolag(url: string | null | undefined): "el" | "vvs" | "bygg" | "maleri_golv" | "stad" | null {
  const slug = decodeURIComponent((url ?? "").split("/foretag/")[1]?.split("/")[2] ?? "").toLowerCase();
  if (!slug) return null;
  if (/elinstall|elektr|\bel\b|eltjänst|elservice/.test(slug)) return "el";
  if (/vvs|rör|värme|sanitet/.test(slug)) return "vvs";
  if (/bygg|snicker|tak|murar|betong|anläggning/.test(slug)) return "bygg";
  if (/måler|golv|tapet/.test(slug)) return "maleri_golv";
  if (/städ|rengör|lokalvård/.test(slug)) return "stad";
  return null;
}

export function referenceFor(
  segment: string | null | undefined,
  companyName: string | null | undefined,
  allabolagUrl?: string | null,
): string | null {
  const branch = branchFromAllabolag(allabolagUrl);
  if (branch === "el") return REFERENCES.el;
  if (branch === "vvs") return REFERENCES.vvs;
  if (branch === "bygg") return REFERENCES.bygg;
  if (branch === "maleri_golv") return REFERENCES.maleri_golv;
  if (branch === "stad") return REFERENCES.stad;
  const n = (companyName ?? "").toLowerCase();
  if (segment === "vvs_el") {
    return /\bel\b|elektr|elinstall|elservice|eltjänst|elteknik/.test(n)
      ? REFERENCES.el
      : REFERENCES.vvs;
  }
  if (segment === "bygg") return REFERENCES.bygg;
  if (segment === "maleri_golv") return REFERENCES.maleri_golv;
  if (/städ/.test(n)) return REFERENCES.stad;
  return null;
}

/** Familj för skanningens första mailable-fynd, eller null. */
export function familyFor(findings: unknown): {
  family: KrokFamily;
  finding: ScanFinding;
} | null {
  for (const finding of rankFindings(findings)) {
    const family = FAMILY_BY_FINDING[finding.id];
    if (family) return { family, finding };
  }
  return null;
}

/** "38" ur "Långsam på mobil (38/100)". */
export function measuredValue(title: string): string | null {
  return title.match(/(\d+)\/100/)?.[1] ?? null;
}

const MONTHS = [
  "januari", "februari", "mars", "april", "maj", "juni",
  "juli", "augusti", "september", "oktober", "november", "december",
];

/**
 * Hur observationen dateras i mejlet. "i dag" får bara stå där om
 * skanningen gjordes samma dag (svensk tid) — motorn kräver dessutom att
 * skanningen är färsk innan steg 1 går, se outreachFlow.scanIsFresh.
 */
export function observationDay(
  scannedAt: string | Date,
  now: Date = new Date(),
  timeZone = "Europe/Stockholm",
): string {
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const scanned = new Date(scannedAt);
  const a = fmt.format(scanned);
  const b = fmt.format(now);
  if (a === b) return "i dag";
  const yesterday = fmt.format(new Date(now.getTime() - 86_400_000));
  if (a === yesterday) return "i går";
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone, month: "numeric", day: "numeric" })
    .formatToParts(scanned);
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const month = Number(parts.find((p) => p.type === "month")?.value ?? "1");
  return `den ${Number(day)} ${MONTHS[month - 1]}`;
}

export interface KrokVars {
  krok_familj: string;
  krok_bild_kravs: "1" | "0";
  krok_amne: string;
  krok_oppning: string;
  krok_erbjudande: string;
  krok_referens: string;
  krok_cta: string;
  krok_bild_intro: string;
  krok_bild_fraga: string;
  krok_referens_mening: string;
  krok_breakup: string;
  vem: string;
  opt_out: string;
}

/**
 * Alla mallvariabler för familjen. Saknas familj returneras ett tomt objekt,
 * så renderingskontrollen i process_sequences stoppar mejlet (nycklarna finns
 * inte) i stället för att skicka något utan krok.
 */
export function krokVars(family: KrokFamily, c: KrokContext): KrokVars {
  const f = FAMILIES[family];
  const referens = c.referens
    ? ` Vi byggde hemsidan åt ${c.referens}, se axonadigital.se/referenser.`
    : "";
  return {
    krok_familj: family,
    krok_bild_kravs: f.bild ? "1" : "0",
    krok_amne: f.amne(c),
    krok_oppning: f.oppning(c),
    krok_erbjudande: f.erbjudande(c),
    krok_referens: referens,
    krok_cta: f.cta(c),
    krok_bild_intro: f.bildIntro(c),
    krok_bild_fraga: f.bildFraga(c),
    // Steg 3: referensen står för sig själv, som ett eget mejl. Utan referens
    // i branschen faller steget tillbaka på det andra fyndet (motorn) eller
    // en kort fråga.
    krok_referens_mening: c.referens
      ? `Vi byggde hemsidan åt ${c.referens} här i trakten. Den ligger på axonadigital.se/referenser, om du vill se vad en sida för ett företag som ert kan se ut som.`
      : "",
    krok_breakup: f.breakup(c),
    vem: VEM,
    opt_out: OPT_OUT,
  };
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
