/**
 * buildMonthlyReportPrompts — ren modul (vitest-bar).
 *
 * Bygger {prompt, systemPrompt} för Anthropic-anropet, modellerat på
 * quoteGeneration.ts buildQuoteGenerationPrompts. Reglerna kommer från
 * strategidokumentets sektion 7 (docs/seo-geo-strategi.md): kundvänt, trend
 * inte naket tal, exakt en åtgärd, inga tekniska termer, inga priser.
 */

import type {
  PresentationPolicy,
  ReportFinding,
  ReportMetrics,
  ReportTone,
  UpsellOffer,
} from "./types.ts";

export type BuildReportPromptInput = {
  companyName: string;
  contactName: string | null;
  /** Människoläsbar period, t.ex. "juni 2026". */
  periodLabel: string;
  metrics: ReportMetrics;
  /** Den valda (högst prioriterade) upsellen, eller null om inga brister. */
  upsell: UpsellOffer | null;
  /**
   * Prioriterade findings (max 3 används) som åtgärdsplanen byggs av. Varje
   * post blir EN action_plan-post med samma `key`.
   */
  recommendations: ReportFinding[];
  /** GEO-beredskap ur crawl-data (kundvänt formulerad rad). */
  geoReadiness: string;
  /** Har kunden GSC-data alls denna period? Styr om sökstatistik nämns. */
  hasSearchData: boolean;
  /**
   * Presentations-policy: styr vilka råa siffror AI:n överhuvudtaget får se, så
   * den inte kan skriva ut svaga, Axona-ägda tal (t.ex. "45/100", "6,1 s").
   */
  presentation: PresentationPolicy;
};

function fmtNum(value: number | null): string {
  if (value == null) return "–";
  return value.toLocaleString("sv-SE", { maximumFractionDigits: 0 });
}

function fmtDelta(deltaPct: number | null): string {
  if (deltaPct == null) return "(ingen jämförelse mot förra månaden ännu)";
  const rounded = Math.round(deltaPct);
  if (rounded === 0) return "(oförändrat mot förra månaden)";
  return rounded > 0
    ? `(+${rounded}% mot förra månaden)`
    : `(${rounded}% mot förra månaden)`;
}

function fmtPct(value: number | null | undefined): string {
  if (typeof value !== "number") return "–";
  return `${(value * 100).toLocaleString("sv-SE", { maximumFractionDigits: 1 })} %`;
}

function buildSearchContextBlock(
  metrics: ReportMetrics,
  pres: PresentationPolicy,
): string[] {
  const lines: string[] = [];

  if (metrics.topPages.length > 0) {
    lines.push(
      `- Viktigaste landningssidor: ${metrics.topPages
        .slice(0, 3)
        .map(
          (page) =>
            `${page.page} (${fmtNum(page.clicks)} klick, ${fmtNum(page.impressions)} visningar, klickfrekvens ${fmtPct(page.ctr)})`,
        )
        .join("; ")}`,
    );
  }

  const opportunities = metrics.opportunities
    .filter((item) => !pres.filterZeroClickQueries || item.clicks > 0)
    .slice(0, 3);
  if (opportunities.length > 0) {
    lines.push(
      `- Konkreta sökmöjligheter: ${opportunities
        .map((item) => {
          const reason =
            item.kind === "low_ctr"
              ? "många ser resultatet men få klickar"
              : item.kind === "position_4_10"
                ? "redan på första sidan och kan lyftas"
                : "nära första sidan";
          return `${item.query} (${reason}, ${fmtNum(item.impressions)} visningar, position ${item.position.toLocaleString("sv-SE", { maximumFractionDigits: 1 })})`;
        })
        .join("; ")}`,
    );
  }

  return lines;
}

/** Bara med i prompten när SEO-optimering är den föreslagna tjänsten. */
function buildKeywordMovementBlock(metrics: ReportMetrics): string {
  const movers = metrics.keywordMovers;
  if (
    !movers ||
    (movers.improved.length === 0 && movers.declined.length === 0)
  ) {
    return "";
  }
  const fmtMover = (m: { query: string; previous: number; current: number }) =>
    `${m.query} (${m.previous.toFixed(1)} → ${m.current.toFixed(1)})`;
  const lines: string[] = [];
  if (movers.improved.length > 0) {
    lines.push(
      `- Förbättrade sökordspositioner: ${movers.improved.map(fmtMover).join("; ")}`,
    );
  }
  if (movers.declined.length > 0) {
    lines.push(
      `- Försämrade sökordspositioner: ${movers.declined.map(fmtMover).join("; ")}`,
    );
  }
  return `\nSökordsrörelser mot förra månaden (lägre position är bättre):\n${lines.join("\n")}`;
}

/** Bara med i prompten när SEO-optimering är den föreslagna tjänsten. */
function buildKeywordOpportunitiesBlock(metrics: ReportMetrics): string {
  const opportunities = metrics.keywordOpportunities ?? [];
  if (opportunities.length === 0) return "";
  const lines = opportunities.map(
    (k) =>
      `${k.query} (${k.impressions} visningar, position ${k.position.toFixed(1)})`,
  );
  return `\nSökord med visningar men utanför topp 3 — konkreta exempel att nämna som vad vi bör optimera för:\n- ${lines.join("; ")}`;
}

function buildBrandDiscoveryBlock(metrics: ReportMetrics): string[] {
  const branded = metrics.branded;
  const nonBranded = metrics.nonBranded;
  if (!branded || !nonBranded) return [];

  const totalClicks = branded.clicks + nonBranded.clicks;
  const brandShare = totalClicks > 0 ? branded.clicks / totalClicks : null;
  const brandText =
    brandShare == null
      ? "andel okänd"
      : `${Math.round(brandShare * 100)} % av klicken`;
  const interpretation =
    brandShare != null && brandShare >= 0.7 && nonBranded.clicks < 5
      ? "tolka som att kunden främst hittas av personer som redan känner till namnet; formulera nästa steg mot tjänste-/behovssökningar"
      : "tolka som balans mellan varumärkessökningar och upptäcktssökningar";

  return [
    `- Varumärke vs upptäckt: ${fmtNum(branded.clicks)} varumärkesklick (${branded.queries} sökord) och ${fmtNum(nonBranded.clicks)} upptäcktsklick (${nonBranded.queries} sökord), ${brandText}; ${interpretation}.`,
  ];
}

function orderRecommendationsForService(
  recommendations: ReportFinding[],
  upsell: UpsellOffer | null,
): ReportFinding[] {
  const service = upsell?.service;
  if (!service) return recommendations;
  const matching = recommendations.filter((r) => r.service === service);
  const rest = recommendations.filter((r) => r.service !== service);
  if (matching.length > 0) return [...matching, ...rest];
  return [
    {
      key: "selected_recommended_service",
      severity: "medium",
      title: upsell.description,
      description: upsell.pitch,
      service,
    },
    ...recommendations,
  ];
}

function buildMetricsBlock(
  metrics: ReportMetrics,
  hasSearchData: boolean,
  pres: PresentationPolicy,
): string {
  const lines: string[] = [];
  if (hasSearchData) {
    // Klick/visningar matas bara in när de inte är en tydlig nedgång — annars
    // ska AI:n inte ens kunna nämna det negativa talet.
    if (pres.showClicks) {
      lines.push(
        `- Klick från Google: ${fmtNum(metrics.clicks.current)} ${fmtDelta(metrics.clicks.deltaPct)}`,
      );
    }
    if (pres.showImpressions) {
      lines.push(
        `- Visningar i Google: ${fmtNum(metrics.impressions.current)} ${fmtDelta(metrics.impressions.deltaPct)}`,
      );
    }
    if (pres.showPositionAbsolute && metrics.position.current != null) {
      const posDelta =
        metrics.position.deltaAbsolute == null
          ? "(ingen jämförelse ännu)"
          : metrics.position.deltaAbsolute === 0
            ? "(oförändrat)"
            : metrics.position.deltaAbsolute < 0
              ? `(förbättrats ${Math.abs(metrics.position.deltaAbsolute).toFixed(1)} platser — lägre är bättre)`
              : `(försämrats ${metrics.position.deltaAbsolute.toFixed(1)} platser)`;
      lines.push(
        `- Snittposition i Google: ${metrics.position.current.toFixed(1)} ${posDelta}`,
      );
    } else if (
      pres.showPositionTrend &&
      metrics.position.deltaAbsolute != null &&
      metrics.position.deltaAbsolute < 0
    ) {
      // Lyft den positiva trenden men ge INTE det exakta (svaga) positionstalet.
      lines.push(
        `- Snittposition: förbättrades ${Math.abs(metrics.position.deltaAbsolute).toFixed(1)} platser (lägre är bättre) — nämn som positiv trend, ange INTE det exakta positionstalet.`,
      );
    }
    const queries = pres.filterZeroClickQueries
      ? metrics.topQueries.filter((q) => q.clicks > 0)
      : metrics.topQueries;
    if (queries.length > 0) {
      lines.push(
        `- Sökord som gav flest klick: ${queries.map((q) => q.query).join(", ")}`,
      );
    }
    lines.push(...buildSearchContextBlock(metrics, pres));
    lines.push(...buildBrandDiscoveryBlock(metrics));
  } else {
    lines.push(
      "- Sökdata (Google Search Console) saknas för den här kunden — nämn inte klick/visningar/position.",
    );
  }
  // Prestanda/laddtid är Axona-ägda. Råtalet matas in BARA när det är bra;
  // annars en sifferlös möjlighets-rad så AI:n aldrig skriver ut svaga tal.
  if (metrics.performance_score.current != null) {
    lines.push(
      pres.showPerformanceScore
        ? `- Hastighetspoäng (mobil, 0–100): ${metrics.performance_score.current} ${fmtDelta(metrics.performance_score.deltaPct)}`
        : "- Prestanda: utvecklingsmöjlighet — nämn som framåtblickande möjlighet kopplad till Prestandaoptimering. Ange ALDRIG exakt poäng.",
    );
  }
  if (metrics.lcp_ms.current != null) {
    lines.push(
      pres.showLcp
        ? `- Laddtid (sekunder): ${(metrics.lcp_ms.current / 1000).toFixed(1)} (bör vara under 2,5)`
        : "- Laddtid: utvecklingsmöjlighet — nämn som framåtblickande möjlighet kopplad till Prestandaoptimering. Ange ALDRIG exakt sekundtal.",
    );
  }
  if (metrics.reviews_count.current != null) {
    lines.push(
      `- Antal Google-recensioner: ${fmtNum(metrics.reviews_count.current)}`,
    );
  }
  return lines.join("\n");
}

const TONE_GUIDANCE: Record<ReportTone, string> = {
  celebrate:
    "TON: Fira månaden. Kunden presterar tydligt bra — lyft framgångarna med självförtroende (utan att överdriva) och rama nästa steg som att bygga vidare på ett styrkeläge.",
  balanced:
    "TON: Uppmuntrande och balanserad. Led med det som fungerar och rama förbättringen som en naturlig nästa möjlighet.",
  reassure:
    "TON: Trygg och framåtblickande. Underlaget är tunt på tydliga vinster — undvik att dröja vid svaga tal, lyft det stabila/positiva som finns och fokusera på vägen framåt. Måla ALDRIG upp månaden som ett misslyckande.",
};

const SYSTEM_PROMPT = `Du skriver ett kort, månatligt statusmail från webbyrån Axona Digital till en kund om hur kundens hemsida presterar.

Ton och regler (följ exakt):
- Skriv på svenska, varmt och konkret, som en hjälpsam rådgivare — aldrig säljig eller teknisk jargong.
- Börja sammanfattningen med det som fungerade bäst eller var mest stabilt. Om allt saknar jämförelse: börja med vad rapporten visar tydligt.
- Efter det positiva: nämn högst en förbättringsmöjlighet och koppla den till den föreslagna tjänsten.
- Förklara siffror i klartext. Använd ALDRIG förkortningar som CTR, LCP, CWV, SERP.
- Lyft trend, inte naket tal ("300 klick, +18%" — inte bara "300 klick").
- Om snittposition nämns: förklara EN gång att lägre tal är bättre.
- Föreslå EXAKT EN konkret åtgärd, kopplad till den föreslagna tjänsten. Nämn ALDRIG pris.
- Var ärlig: om en siffra gått ner, formulera det sakligt och lösningsorienterat.
- Om en svag siffra nämns: förklara varför den går att förbättra genom tjänsten, inte som ett löst problem.
- Led ALLTID med det positiva. Nämn svagheter bara som framåtblickande möjligheter kopplade till den föreslagna tjänsten — aldrig som ett konstaterat misslyckande.
- Axona har byggt kundens sajt. Presentera ALDRIG en siffra Axona ansvarar för (laddtid, prestandapoäng, teknisk grund) som dålig, och skriv ALDRIG ut ett exakt svagt sådant tal (t.ex. "45 av 100" eller "6,1 sekunder"). Står det "utvecklingsmöjlighet" i underlaget: behåll det sifferlöst och framåtblickande.
- Hitta ALDRIG på siffror, trender eller status. Använd enbart det som faktiskt står i månadens underlag nedan — allt du skriver måste vara sant.
- Inga emojis i texten (mailmallen lägger till sina egna ikoner).
- Ordval: undvik "saknar", "missar", "problem", "brist", "måste". Använd
  istället "nästa steg", "nästa möjlighet", "komplettera", "stärka", "bygga
  vidare" — rapporten ska sälja nästa nivå, inte lista brister.

Åtgärdsplanen (action_plan):
- Skapa EXAKT en post per prioritering som listas under "Prioriteringar", med SAMMA "key".
- Listas inga prioriteringar: skapa då EN post med key "fortsatt_forbattring" om fortsatt, lätt förbättring.
- Varje post är kundvänd och konkret. Knyt "what_we_see" till en faktisk siffra ur månadens data när det går.
- "how_we_help" ska namnge Axona-tjänsten (fältet "Tjänst" för prioriteringen) och beskriva insatsen konkret.
- "next_step" är en tydlig, lågtröskel-inbjudan (t.ex. "Hör av er så sätter vi en plan"). ALDRIG pris.
- Håll varje fält till 1–2 meningar.

Svara ENDAST med ett JSON-objekt med exakt dessa fält (inga andra, ingen markdown runt):
{
  "greeting": "Hälsningsfras, t.ex. 'Hej Anna,' (om namn saknas: 'Hej,')",
  "summary": "1–2 meningar: först vad som gick bra/stabilt, sedan den viktigaste förbättringsmöjligheten.",
  "recommended_action": "Exakt en rekommenderad åtgärd, formulerad som ett konkret erbjudande kopplat till den föreslagna tjänsten.",
  "upsell_pitch": "1–2 meningar som motiverar varför just den tjänsten hjälper kunden nu. Inget pris.",
  "action_plan": [
    {
      "key": "samma key som prioriteringen",
      "what_we_see": "Vad vi ser, gärna med siffran.",
      "what_it_means": "Vad det betyder för affären, i klartext.",
      "how_we_help": "Så löser vi det — konkret insats, namnge tjänsten.",
      "next_step": "Nästa steg — tydlig inbjudan, inget pris."
    }
  ]
}`;

export function buildMonthlyReportPrompts(input: BuildReportPromptInput): {
  prompt: string;
  systemPrompt: string;
} {
  const greetingName = input.contactName?.trim()
    ? input.contactName.trim().split(/\s+/)[0]
    : null;

  const upsellBlock = input.upsell
    ? `Föreslagen tjänst att rekommendera:\n- Tjänst: ${input.upsell.label}\n- Nästa möjlighet för kunden: ${input.upsell.description}\n- Pitch-vinkel att utgå från: ${input.upsell.pitch}`
    : "Inga tydliga möjligheter stack ut den här månaden. Föreslå då en lätt, fortsatt förbättring (t.ex. fortsatt innehållsarbete) utan att överdriva problem.";
  const keywordMovementBlock =
    input.upsell?.service === "SEO-optimering"
      ? buildKeywordMovementBlock(input.metrics)
      : "";
  const keywordOpportunitiesBlock =
    input.upsell?.service === "SEO-optimering"
      ? buildKeywordOpportunitiesBlock(input.metrics)
      : "";

  const priorities = orderRecommendationsForService(
    input.recommendations,
    input.upsell,
  ).slice(0, 3);
  const prioritiesBlock = priorities.length
    ? `Prioriteringar (skapa en action_plan-post per rad, samma key):\n${priorities
        .map(
          (r) =>
            `- key: ${r.key} | Iakttagelse: ${r.title} | Bakgrund: ${r.description} | Tjänst: ${r.service}`,
        )
        .join("\n")}`
    : 'Prioriteringar: inga tydliga möjligheter — skapa en enda action_plan-post med key "fortsatt_forbattring".';

  const prompt = `Kund: ${input.companyName}
Kontaktperson: ${greetingName ?? "okänd (använd 'Hej,')"}
Period: ${input.periodLabel}

${TONE_GUIDANCE[input.presentation.tone]}

Månadens siffror:
${buildMetricsBlock(input.metrics, input.hasSearchData, input.presentation)}

Synlighet i AI-sök (beredskap): ${input.geoReadiness}

${upsellBlock}
${keywordMovementBlock}
${keywordOpportunitiesBlock}

${prioritiesBlock}

Skriv mailinnehållet enligt systeminstruktionen. Kom ihåg: börja med det positiva, trend inte naket tal, exakt en åtgärd i texten, en action_plan-post per prioritering med samma key, inga priser, inga tekniska förkortningar, och aldrig ett exakt svagt Axona-ägt tal.`;

  return { prompt, systemPrompt: SYSTEM_PROMPT };
}
