// Resultatkortet: en referenskunds UPPMÄTTA siffror ur månadsrapporten
// (Search Console), som en mening i steg 3 av outreach-flödet.
//
// Varför bara uppmätt och bara namngivet: research 2026-09-25 — förklarad
// social proof +41 % svar, branschspecifik +88 %; prognoser för mottagaren
// ("ni kan få X förfrågningar") sänker bokade möten 15 % och bryter mot
// sanningsregeln. Förfrågningar och samtal mäts inte i dag och får därför
// inte nämnas; visningar och klick gör det.

export interface MetricPair {
  current?: number | null;
  previous?: number | null;
  deltaPct?: number | null;
}
export interface ReportMetricsLike {
  clicks?: MetricPair | null;
  impressions?: MetricPair | null;
  ctr?: MetricPair | null;
}

const MONTHS = ["januari","februari","mars","april","maj","juni","juli","augusti","september","oktober","november","december"];

/** "augusti 2026" ur en period-kolumn (YYYY-MM-DD). */
export function periodLabel(period: string): string {
  const m = period.match(/^(\d{4})-(\d{2})/);
  if (!m) return period;
  return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** 1240 → "1 240" (tunt mellanslag ger fel i vissa mejlklienter, vanligt räcker). */
export function sv(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/**
 * Meningen, eller null om siffrorna inte räcker. Kräver visningar OCH klick
 * med minst 100 visningar — under det är kortet mer pinsamt än övertygande.
 * Deltat nämns bara när det är positivt och minst 10 %: ett minus eller ett
 * brus säger inget om sidan.
 */
export function resultCardText(input: {
  customer: string;
  period: string;
  metrics: ReportMetricsLike | null | undefined;
}): string | null {
  const imp = input.metrics?.impressions?.current;
  const clicks = input.metrics?.clicks?.current;
  if (imp == null || clicks == null || !Number.isFinite(imp) || !Number.isFinite(clicks)) return null;
  if (imp < 100 || clicks < 1) return null;
  const delta = input.metrics?.clicks?.deltaPct;
  const trend = delta != null && Number.isFinite(delta) && delta >= 10
    ? `, ${sv(delta)} % fler klick än månaden innan`
    : "";
  return (
    `Ett exempel på vad det ger: ${input.customer} hade i ${periodLabel(input.period)} ` +
    `${sv(imp)} visningar på Google och ${sv(clicks)} klick till sidan${trend}. ` +
    `Det är deras uppmätta siffror, inte en prognos för er.`
  );
}
