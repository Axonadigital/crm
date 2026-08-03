import type {
  ReportAiContent,
  ReportSnapshot,
  ReportStatus,
  ReportViewModel,
} from "./types.ts";
import { computeReportMetrics } from "./computeReportMetrics.ts";
import { CUSTOMER_HIDDEN_FINDING_KEYS } from "./buildReportEmailHtml.ts";

const SOURCE_LABELS: Record<string, string> = {
  pagespeed: "PageSpeed",
  seo_crawl: "Teknisk SEO",
  business_profile: "Google Business",
  search_console: "Google Search Console",
};

function googleStatus(snapshot: ReportSnapshot): ReportStatus {
  const search = snapshot.search_console;
  if (!search) return "missing";
  if (search.impressions === 0 || search.position > 20) return "poor";
  const ctr =
    search.ctr ??
    (search.impressions > 0 ? search.clicks / search.impressions : 0);
  if (search.position > 10 || (search.impressions >= 50 && ctr < 0.02)) {
    return "needs_attention";
  }
  return "good";
}

function pageExperienceStatus(snapshot: ReportSnapshot): ReportStatus {
  const field = snapshot.field_data;
  if (field) {
    const ratings = [field.lcp_rating, field.inp_rating, field.cls_rating];
    if (ratings.includes("POOR")) return "poor";
    if (ratings.includes("NEEDS_IMPROVEMENT")) return "needs_attention";
    if (ratings.some(Boolean)) return "good";
  }
  if (snapshot.performance_score == null) return "missing";
  if (snapshot.performance_score < 50) return "poor";
  const weakLabSignals = [
    snapshot.performance_score < 80,
    typeof snapshot.pagespeed?.cls === "number" && snapshot.pagespeed.cls > 0.1,
    typeof snapshot.pagespeed?.tbt_ms === "number" &&
      snapshot.pagespeed.tbt_ms > 300,
  ].filter(Boolean).length;
  return weakLabSignals > 1 ? "needs_attention" : "good";
}

function localStatus(snapshot: ReportSnapshot): ReportStatus {
  const business = snapshot.business_profile;
  if (!business) return "missing";
  if (!business.found) return "poor";
  if (
    (business.reviews_count != null && business.reviews_count < 5) ||
    (business.rating != null && business.rating < 4)
  ) {
    return "needs_attention";
  }
  return "good";
}

function technicalChecks(snapshot: ReportSnapshot) {
  const checks = snapshot.seo_checks;
  return [
    {
      key: "indexable",
      label: "Indexerbar",
      passed: checks ? checks.indexable !== false : null,
      explanation: "Avgör om Google får lägga till sidan i sökresultatet.",
    },
    {
      key: "title",
      label: "Sidtitel",
      passed: checks ? Boolean(checks.title) : null,
      explanation: "Beskriver sidan för både sökmotorer och besökare.",
    },
    {
      key: "meta_description",
      label: "Metabeskrivning",
      passed: checks ? Boolean(checks.meta_description) : null,
      explanation: "Påverkar hur attraktivt sökresultatet blir att klicka på.",
    },
    {
      key: "h1",
      label: "Huvudrubrik",
      passed: checks ? Boolean(checks.h1) : null,
      explanation: "Gör sidans huvudämne tydligt.",
    },
    {
      key: "sitemap",
      label: "Sitemap",
      passed: checks ? Boolean(checks.sitemap) : null,
      explanation: "Hjälper Google hitta sajtens sidor.",
    },
    {
      key: "robots",
      label: "Robots.txt",
      passed: checks ? Boolean(checks.robots) : null,
      explanation: "Styr vilka delar av sajten sökmotorer får läsa.",
    },
    {
      key: "schema_org",
      label: "Strukturerad data",
      passed: checks ? Boolean(checks.schema_org) : null,
      explanation: "Hjälper Google och AI-tjänster förstå verksamheten.",
    },
    {
      key: "og_tags",
      label: "Delningsmetadata",
      passed: checks ? Boolean(checks.og_tags) : null,
      explanation: "Ger professionella länkar i sociala medier och chattar.",
    },
  ];
}

function technicalStatus(
  checks: ReturnType<typeof technicalChecks>,
): ReportStatus {
  if (checks.every((check) => check.passed == null)) return "missing";
  const failed = checks.filter((check) => check.passed === false).length;
  if (failed >= 3) return "poor";
  if (failed > 0) return "needs_attention";
  return "good";
}

export function buildReportViewModel(input: {
  companyName: string;
  periodLabel: string;
  latest: ReportSnapshot;
  previous: ReportSnapshot | null;
}): ReportViewModel {
  const { latest, previous } = input;
  const checks = technicalChecks(latest);
  const hidden = new Set(CUSTOMER_HIDDEN_FINDING_KEYS);
  const recommendations = (latest.findings ?? []).filter(
    (finding) => !hidden.has(finding.key),
  );
  const sourceEntries = Object.entries(latest.source_status ?? {});
  const missingSources = sourceEntries
    .filter(([, state]) => state.status !== "available")
    .map(([key]) => SOURCE_LABELS[key] ?? key);
  const available =
    latest.data_coverage?.available_sources ??
    Math.max(0, sourceEntries.length - missingSources.length);
  const total = latest.data_coverage?.total_sources ?? 4;

  return {
    version: 2,
    companyName: input.companyName,
    period: {
      start: latest.period_start ?? "",
      end: latest.period_end ?? "",
      label: input.periodLabel,
    },
    comparisonPeriod:
      previous?.period_start && previous?.period_end
        ? { start: previous.period_start, end: previous.period_end }
        : null,
    coverage: {
      available,
      total,
      ratio: total > 0 ? available / total : 0,
      missingSources,
    },
    metrics: computeReportMetrics(latest, previous),
    statuses: {
      googleVisibility: googleStatus(latest),
      pageExperience: pageExperienceStatus(latest),
      localVisibility: localStatus(latest),
      technicalFoundation: technicalStatus(checks),
    },
    technicalChecks: checks,
    recommendations,
    primaryRecommendation: recommendations[0] ?? null,
  };
}

/** "april" – används bara för att namnge jämförelseperioden, ej hela datum. */
function monthNameSv(periodISO: string): string {
  return new Date(`${periodISO}T00:00:00Z`).toLocaleDateString("sv-SE", {
    month: "long",
    timeZone: "UTC",
  });
}

/**
 * Vad siffrorna jämförs mot i löptext. En kalendermånads rapportperiod →
 * "månaden före" (som tidigare). Flermånadersperioder (t.ex. juni–juli) fick
 * annars alltid samma hårdkodade fras trots att jämförelsen faktiskt gäller
 * en lika lång period längre bak (april–maj) — läsaren tolkade det som att
 * juli jämfördes mot juni.
 */
function comparisonLabelFor(viewModel: ReportViewModel): string {
  const { period, comparisonPeriod } = viewModel;
  const isSingleMonth = period.start.slice(0, 7) === period.end.slice(0, 7);
  if (isSingleMonth) return "månaden före";
  if (!comparisonPeriod) return "föregående period";
  return `perioden innan (${monthNameSv(comparisonPeriod.start)}–${monthNameSv(comparisonPeriod.end)})`;
}

function trendPhrase(value: number | null, comparisonLabel: string): string {
  if (value == null) return `utan säker jämförelse mot ${comparisonLabel}`;
  if (Math.abs(value) < 0.5)
    return `på ungefär samma nivå som ${comparisonLabel}`;
  return value > 0
    ? `${Math.round(value)} % högre än ${comparisonLabel}`
    : `${Math.abs(Math.round(value))} % lägre än ${comparisonLabel}`;
}

function positiveFallbackSignal(viewModel: ReportViewModel): string {
  const metrics = viewModel.metrics;
  const comparisonLabel = comparisonLabelFor(viewModel);
  if (metrics.clicks.deltaPct != null && metrics.clicks.deltaPct > 0) {
    return `Det starkaste tecknet är att klicken från Google blev ${trendPhrase(metrics.clicks.deltaPct, comparisonLabel)}.`;
  }
  if (
    metrics.impressions.deltaPct != null &&
    metrics.impressions.deltaPct > 0
  ) {
    return `Det starkaste tecknet är att ni syntes ${trendPhrase(metrics.impressions.deltaPct, comparisonLabel)} i Google.`;
  }
  if (
    metrics.position.deltaAbsolute != null &&
    metrics.position.deltaAbsolute < 0
  ) {
    return `Snittpositionen förbättrades ${Math.abs(metrics.position.deltaAbsolute).toFixed(1)} steg, där lägre tal är bättre.`;
  }
  if (metrics.clicks.current != null) {
    return `Google gav ${metrics.clicks.current.toLocaleString("sv-SE")} besök till er webbplats och utvecklingen var ${trendPhrase(metrics.clicks.deltaPct, comparisonLabel)}.`;
  }
  return `Rapporten visar sidans tekniska och lokala nuläge för ${viewModel.period.label}.`;
}

function improvementFallbackSignal(viewModel: ReportViewModel): string {
  const metrics = viewModel.metrics;
  // Visa inte det råa sekundtalet när policyn döljer det (Axona-ägd siffra).
  const showLcp = viewModel.presentation?.showLcp ?? true;
  if (metrics.lcp_ms.current != null && metrics.lcp_ms.current > 2500) {
    return showLcp
      ? `Den tydligaste förbättringen är laddtiden på ${(metrics.lcp_ms.current / 1000).toFixed(1)} sekunder, där snabbare sida kan minska avhopp innan besökaren tar kontakt.`
      : "Den tydligaste möjligheten framåt är en snabbare sida, vilket kan minska avhopp innan besökaren tar kontakt.";
  }
  if (viewModel.primaryRecommendation) {
    return `${viewModel.primaryRecommendation.title} är nästa tydliga möjlighet att stärka resultatet.`;
  }
  if (metrics.position.current != null && metrics.position.current > 10) {
    return "Nästa möjlighet är att flytta fler sökord närmare första sidan i Google.";
  }
  return "Nästa steg är att fortsätta förstärka den synlighet som redan finns.";
}

/** Deterministisk åtgärdsplan (top 3 findings) när AI-texten saknas/underkänns. */
function buildFallbackActionPlan(
  viewModel: ReportViewModel,
): ReportAiContent["action_plan"] {
  const top = viewModel.recommendations.slice(0, 3);
  if (top.length === 0) {
    return [
      {
        key: "fortsatt_forbattring",
        what_we_see:
          "Inga tydliga kritiska brister hittades i månadens underlag.",
        what_it_means:
          "Grunden är på plats — nu handlar det om att fortsätta bygga synlighet steg för steg.",
        how_we_help:
          "Vi fortsätter med löpande innehålls- och synlighetsarbete så att utvecklingen håller i sig.",
        next_step: "Hör av er så stämmer vi av nästa fokus tillsammans.",
      },
    ];
  }
  return top.map((rec) => ({
    key: rec.key,
    what_we_see: rec.title,
    what_it_means: rec.description,
    how_we_help: `Med ${rec.service} arbetar vi praktiskt med just det här och gör förbättringen mätbar över tid.`,
    next_step: "Hör av er så lägger vi en konkret plan för nästa steg.",
  }));
}

export function buildFallbackReportContent(
  viewModel: ReportViewModel,
  recipientName: string | null,
): ReportAiContent {
  const searchSummary = `${positiveFallbackSignal(viewModel)} ${improvementFallbackSignal(viewModel)}`;
  const recommendation = viewModel.primaryRecommendation;
  return {
    greeting: recipientName?.trim()
      ? `Hej ${recipientName.trim().split(/\s+/)[0]},`
      : "Hej,",
    summary: searchSummary,
    recommended_action: recommendation
      ? `Vi rekommenderar att börja med ${recommendation.service.toLowerCase()}: ${recommendation.title.toLowerCase()}.`
      : "Vi rekommenderar att fortsätta följa utvecklingen och göra en riktad innehållsförbättring under nästa månad.",
    upsell_pitch: recommendation
      ? `${recommendation.description} Med ${recommendation.service} kan vi arbeta praktiskt med just den delen och göra förbättringen mätbar över tid.`
      : "Sajten har inga tydliga kritiska brister i de källor som kunde analyseras.",
    action_plan: buildFallbackActionPlan(viewModel),
  };
}
