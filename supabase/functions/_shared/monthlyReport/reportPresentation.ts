/**
 * reportPresentation — ren modul (vitest-bar).
 *
 * Beräknar EN gång ur view_model vilka kundvända sektioner/siffror som är
 * "presentabla", plus en ton. Samma policy konsumeras av alla tre lager (PDF,
 * mejl-HTML, AI-prompt) så de aldrig säger emot varandra.
 *
 * Grundprincip (beslut 2026-06-25): minimera hårt — led med det positiva, dölj
 * de råa siffror Axona själv ansvarar för (laddtid, prestandapoäng, teknisk
 * grund) och låt svagheter leva kvar BARA som framåtblickande möjligheter i
 * åtgärdsplanen/upsell.
 *
 * Hederlighetsgrind: vi DÖLJER och OMFORMULERAR sann data. Vi hittar ALDRIG på
 * positiva siffror, trender eller status. Allt som visas måste vara sant.
 */

import type {
  PresentationPolicy,
  ReportMetrics,
  ReportTone,
  ReportViewModel,
} from "./types.ts";

export type { PresentationPolicy, ReportTone } from "./types.ts";

/**
 * Tillåtande standard (visa allt) — back-compat när ingen view_model/policy
 * finns att härleda ur (t.ex. äldre lagrade rapporter utan presentation-fält).
 */
export const DEFAULT_PRESENTATION: PresentationPolicy = {
  tone: "balanced",
  showClicks: true,
  showImpressions: true,
  showCtr: true,
  showPositionAbsolute: true,
  showPositionTrend: true,
  showPerformanceScore: true,
  showLcp: true,
  showPageExperience: true,
  showFourParts: true,
  showMethodology: true,
  filterZeroClickQueries: false,
};

/** Visa procentmått (klick/visningar/ctr) bara när det inte är en tydlig nedgång. */
function showTrendMetric(trend: ReportMetrics[keyof ReportMetrics]): boolean {
  const t = trend as { current: number | null; deltaPct: number | null };
  if (t.current == null) return false;
  return t.deltaPct == null || t.deltaPct >= 0;
}

function countSignals(vm: ReportViewModel): {
  positives: number;
  concerns: number;
} {
  const m = vm.metrics;
  let positives = 0;
  let concerns = 0;

  if (m.clicks.deltaPct != null && m.clicks.deltaPct > 0) positives++;
  if (m.impressions.deltaPct != null && m.impressions.deltaPct > 0) positives++;
  if (m.position.deltaAbsolute != null && m.position.deltaAbsolute < 0)
    positives++;
  if (m.performance_score.current != null && m.performance_score.current >= 80)
    positives++;
  if (m.lcp_ms.current != null && m.lcp_ms.current <= 2500) positives++;

  if (m.clicks.deltaPct != null && m.clicks.deltaPct < 0) concerns++;
  if (m.impressions.deltaPct != null && m.impressions.deltaPct < 0) concerns++;
  if (m.position.deltaAbsolute != null && m.position.deltaAbsolute > 0)
    concerns++;

  for (const status of Object.values(vm.statuses)) {
    if (status === "good") positives++;
    if (status === "poor") concerns++;
  }

  return { positives, concerns };
}

/**
 * Härleder den automatiska presentations-policyn ur view_model. Rena, sanna
 * regler — inget hittas på, allt svagt göms eller ramas om.
 */
export function buildPresentationPolicy(
  vm: ReportViewModel,
): PresentationPolicy {
  const m = vm.metrics;
  const { positives, concerns } = countSignals(vm);

  const tone: ReportTone =
    positives >= 2 && concerns === 0
      ? "celebrate"
      : positives >= 1
        ? "balanced"
        : "reassure";

  const hasFieldData =
    m.field_lcp_ms.current != null ||
    m.field_inp_ms.current != null ||
    m.field_cls.current != null;

  return {
    tone,
    showClicks: showTrendMetric(m.clicks),
    showImpressions: showTrendMetric(m.impressions),
    showCtr: showTrendMetric(m.ctr),
    // Visa råtalet bara när det faktiskt är förstasida (1–10).
    showPositionAbsolute:
      m.position.current != null && m.position.current <= 10,
    // Visa förbättringstrenden även när råtalet döljs (uppmuntrande, sant).
    showPositionTrend:
      m.position.deltaAbsolute != null && m.position.deltaAbsolute < 0,
    // Axona-ägda råa tal: visa bara när de faktiskt är bra.
    showPerformanceScore:
      m.performance_score.current != null && m.performance_score.current >= 80,
    showLcp: m.lcp_ms.current != null && m.lcp_ms.current <= 2500,
    showPageExperience: vm.statuses.pageExperience === "good" && hasFieldData,
    // Beslut: ta bort scorecarden helt.
    showFourParts: false,
    // Metodavsnittet finns mest för att bortförklara "Fältdata saknas"/labbtest
    // — onödigt när de döljs.
    showMethodology: false,
    filterZeroClickQueries: true,
  };
}

/** base ⊕ override (override vinner; null/undefined-fält ignoreras). */
export function resolvePresentation(
  base: PresentationPolicy,
  overrides: Partial<PresentationPolicy> | null | undefined,
): PresentationPolicy {
  if (!overrides) return base;
  const clean: Partial<PresentationPolicy> = {};
  for (const [key, value] of Object.entries(overrides)) {
    if (value != null) {
      (clean as Record<string, unknown>)[key] = value;
    }
  }
  return { ...base, ...clean };
}
