// Resultatkortet: en referenskunds UPPMÄTTA siffror ur månadsrapporten
// (Search Console), som en mening i steg 3 av outreach-flödet.
//
// Varför bara uppmätt och bara namngivet: research 2026-09-25 — förklarad
// social proof +41 % svar, branschspecifik +88 %; prognoser för mottagaren
// ("ni kan få X förfrågningar") sänker bokade möten 15 % och bryter mot
// sanningsregeln. Förfrågningar och samtal nämns BARA när de finns mätta i
// referenskundens rapport (site_events + Google-profilen, sedan 2026-09-26);
// saknas måttet står bara visningar och klick.

export interface MetricPair {
  current?: number | null;
  previous?: number | null;
  deltaPct?: number | null;
}
export interface ReportMetricsLike {
  clicks?: MetricPair | null;
  impressions?: MetricPair | null;
  ctr?: MetricPair | null;
  /** Förfrågningar via formuläret på sidan. current null = omätt. */
  inquiries?: MetricPair | null;
  /** Samtal startade från sidan och Google-profilen. current null = omätt. */
  calls?: MetricPair | null;
}

/**
 * "14 förfrågningar via formuläret och 23 samtal" — bara det som är mätt och
 * över noll. Talen markeras med ** (fetstil i HTML, se signature.ts).
 */
export function engagementClause(metrics: ReportMetricsLike | null | undefined): string {
  const inq = metrics?.inquiries?.current;
  const calls = metrics?.calls?.current;
  const parts: string[] = [];
  if (inq != null && Number.isFinite(inq) && inq >= 1) {
    parts.push(`**${sv(inq)} ${inq === 1 ? "förfrågan" : "förfrågningar"}** via formuläret på sidan`);
  }
  if (calls != null && Number.isFinite(calls) && calls >= 1) {
    parts.push(`**${sv(calls)} samtal** startade från sidan`);
  }
  return parts.join(" och ");
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
 *
 * Ordföljd och fetstil (2026-09-26): perioden står FÖRE kundnamnet så att
 * årtalet aldrig hamnar intill visningstalet ("augusti 2026 1 812" lästes
 * som ett enda tal), och de uppmätta talen markeras med ** som blir
 * <strong> i HTML-delen och ren text i textdelen.
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
  const engagement = engagementClause(input.metrics);
  const tail = engagement ? ` Det gav ${engagement}.` : "";
  return (
    `Ett exempel på vad det ger: i ${periodLabel(input.period)} hade ${input.customer} ` +
    `**${sv(imp)} visningar** på Google och **${sv(clicks)} klick** till sidan${trend}.${tail} ` +
    `Det är deras uppmätta siffror, inte en prognos för er.`
  );
}
