/**
 * Upsell-katalog för månadsrapporten — ren modul (vitest-bar).
 *
 * Findings i website_snapshots mappar redan varje brist till en Axona-tjänst via
 * finding.service (SERVICES-objektet i analyze_website/findings.ts). Den här
 * katalogen mappar service-strängen → ett kundvänt upsell-erbjudande.
 *
 * Defaults kommer från strategidokumentets upsell-spelbok (docs/seo-geo-strategi.md
 * sektion 6). Edge-funktionen kan överstyra via configuration.monthlyReport.upsellCatalog.
 *
 * Per beslut: INGA priser i katalogen — rapporten väcker behovet, priset tas i dialog.
 */

import type { ReportFinding, UpsellOffer } from "./types.ts";

// service-värdena måste matcha SERVICES i analyze_website/findings.ts exakt.
export const DEFAULT_UPSELL_CATALOG: UpsellOffer[] = [
  {
    service: "Prestandaoptimering",
    label: "Prestandaoptimering",
    description:
      "Den tekniska grunden är på plats. Nästa steg är att finjustera farten ytterligare, särskilt för mobila besökare.",
    internalNote:
      "Använd internt när fältdata eller flera labbsignaler visar att fart påverkar konvertering.",
    pitch:
      "Vi finjusterar farten så att fler besökare stannar kvar och blir kunder — en direkt effekt på er affär.",
  },
  {
    service: "SEO-optimering",
    label: "SEO-optimering",
    description:
      "Ni börjar synas på Google — nästa möjlighet är att ta er hela vägen till förstasidan på fler sökord.",
    internalNote:
      "Prioritera när non-branded-sökningar, position 4–20 eller låg klickfrekvens visar konkret potential.",
    pitch:
      "Vi tar er de sista stegen till förstasidan på era viktigaste sökord — den snabbaste synlighetsvinsten just nu.",
  },
  {
    service: "AI-sök-optimering",
    label: "AI-sök-optimering",
    description:
      "Sökning flyttar till AI-svar som ChatGPT, Claude och Google AI — nästa steg är att bygga synlighet även där.",
    internalNote:
      "Internt paket för schema, tydligt expertinnehåll och AI-läsbar struktur.",
    pitch:
      "Vi strukturerar ert innehåll så att AI förstår och rekommenderar er när kunder frågar om er bransch.",
  },
  {
    service: "Google Business-paket",
    label: "Google Business-paket",
    description:
      "Nästa naturliga komplettering är Google Business, så att ni även syns i Google Maps och lokala sökresultat.",
    internalNote:
      "Bör bara prioriteras när lokal synlighet är relevant för kundtypen.",
    pitch:
      "Vi sätter upp och vårdar er Google Business-profil med en enkel rutin för recensioner — högst ROI för lokala företag.",
  },
  {
    service: "Innehåll & synlighet",
    label: "Innehåll & synlighet",
    description:
      "Innehållet fungerar — nästa steg är att göra det ännu tydligare för både Google och AI vad ni erbjuder.",
    internalNote:
      "Bra när tekniken är okej men tjänstesidor, erbjudande eller topical coverage behöver bli tydligare.",
    pitch:
      "Vi skärper innehållet så att ni dyker upp där era kunder faktiskt frågar.",
  },
];

const SEVERITY_RANK: Record<ReportFinding["severity"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/**
 * Välj upsell-erbjudanden utifrån kundens findings.
 *
 * - Grupperar findings på service och slår upp katalogposten.
 * - Sorterar så att den service som har den allvarligaste bristen kommer först.
 * - Returnerar ALLA matchande (så teamet kan byta i CRM-modalen). Mailet visar
 *   den första (högst prioriterade) — strategidokumentet: "exakt en åtgärd".
 *
 * `hiddenKeys` filtrerar bort findings som inte ska driva en upsell i kundmailet
 * (t.ex. missing_llms_txt — llms.txt är i praktiken dött).
 */
export function selectUpsells(
  findings: ReportFinding[] | null | undefined,
  catalog: UpsellOffer[] = DEFAULT_UPSELL_CATALOG,
  hiddenKeys: string[] = [],
): UpsellOffer[] {
  if (!findings || findings.length === 0) return [];
  const hidden = new Set(hiddenKeys);
  const catalogByService = new Map(catalog.map((o) => [o.service, o]));

  // Bästa (lägsta) severity-rank per service.
  const bestRankByService = new Map<string, number>();
  for (const finding of findings) {
    if (hidden.has(finding.key)) continue;
    const rank = SEVERITY_RANK[finding.severity];
    const existing = bestRankByService.get(finding.service);
    if (existing === undefined || rank < existing) {
      bestRankByService.set(finding.service, rank);
    }
  }

  return [...bestRankByService.entries()]
    .filter(([service]) => catalogByService.has(service))
    .sort((a, b) => a[1] - b[1])
    .map(([service]) => catalogByService.get(service)!);
}
