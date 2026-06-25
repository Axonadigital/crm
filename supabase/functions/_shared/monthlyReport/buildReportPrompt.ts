/**
 * buildMonthlyReportPrompts — ren modul (vitest-bar).
 *
 * Bygger {prompt, systemPrompt} för Anthropic-anropet, modellerat på
 * quoteGeneration.ts buildQuoteGenerationPrompts. Reglerna kommer från
 * strategidokumentets sektion 7 (docs/seo-geo-strategi.md): kundvänt, trend
 * inte naket tal, exakt en åtgärd, inga tekniska termer, inga priser.
 */

import type { ReportFinding, ReportMetrics, UpsellOffer } from "./types.ts";

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

function buildMetricsBlock(
  metrics: ReportMetrics,
  hasSearchData: boolean,
): string {
  const lines: string[] = [];
  if (hasSearchData) {
    lines.push(
      `- Klick från Google: ${fmtNum(metrics.clicks.current)} ${fmtDelta(metrics.clicks.deltaPct)}`,
    );
    lines.push(
      `- Visningar i Google: ${fmtNum(metrics.impressions.current)} ${fmtDelta(metrics.impressions.deltaPct)}`,
    );
    if (metrics.position.current != null) {
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
    }
    if (metrics.topQueries.length > 0) {
      lines.push(
        `- Sökord som gav flest klick: ${metrics.topQueries.map((q) => q.query).join(", ")}`,
      );
    }
  } else {
    lines.push(
      "- Sökdata (Google Search Console) saknas för den här kunden — nämn inte klick/visningar/position.",
    );
  }
  if (metrics.performance_score.current != null) {
    lines.push(
      `- Hastighetspoäng (mobil, 0–100): ${metrics.performance_score.current} ${fmtDelta(metrics.performance_score.deltaPct)}`,
    );
  }
  if (metrics.lcp_ms.current != null) {
    lines.push(
      `- Laddtid (sekunder): ${(metrics.lcp_ms.current / 1000).toFixed(1)} (bör vara under 2,5)`,
    );
  }
  if (metrics.reviews_count.current != null) {
    lines.push(
      `- Antal Google-recensioner: ${fmtNum(metrics.reviews_count.current)}`,
    );
  }
  return lines.join("\n");
}

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
- Inga emojis i texten (mailmallen lägger till sina egna ikoner).

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
    ? `Föreslagen tjänst att rekommendera:\n- Tjänst: ${input.upsell.label}\n- Behov hos kunden: ${input.upsell.description}\n- Pitch-vinkel att utgå från: ${input.upsell.pitch}`
    : "Inga tydliga brister hittades den här månaden. Föreslå då en lätt, fortsatt förbättring (t.ex. fortsatt innehållsarbete) utan att överdriva problem.";

  const priorities = input.recommendations.slice(0, 3);
  const prioritiesBlock = priorities.length
    ? `Prioriteringar (skapa en action_plan-post per rad, samma key):\n${priorities
        .map(
          (r) =>
            `- key: ${r.key} | Problem: ${r.title} | Bakgrund: ${r.description} | Tjänst: ${r.service}`,
        )
        .join("\n")}`
    : 'Prioriteringar: inga tydliga brister — skapa en enda action_plan-post med key "fortsatt_forbattring".';

  const prompt = `Kund: ${input.companyName}
Kontaktperson: ${greetingName ?? "okänd (använd 'Hej,')"}
Period: ${input.periodLabel}

Månadens siffror:
${buildMetricsBlock(input.metrics, input.hasSearchData)}

Synlighet i AI-sök (beredskap): ${input.geoReadiness}

${upsellBlock}

${prioritiesBlock}

Skriv mailinnehållet enligt systeminstruktionen. Kom ihåg: börja med det positiva, trend inte naket tal, exakt en åtgärd i texten, en action_plan-post per prioritering med samma key, inga priser, inga tekniska förkortningar.`;

  return { prompt, systemPrompt: SYSTEM_PROMPT };
}
