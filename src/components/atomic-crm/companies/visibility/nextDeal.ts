import type { Company, WebsiteFinding, WebsiteSnapshot } from "../../types";

type NextDealInput = {
  company: Company;
  snapshot: WebsiteSnapshot;
  finding?: WebsiteFinding;
  brandShare: number | null;
};

export type NextDealRecommendation = {
  packageName: string;
  why: string;
  evidence: string[];
  action: string;
  salesArgument: string;
};

function percent(value: number): string {
  return `${Math.round(value * 100)} %`;
}

function formatNumber(value: number): string {
  return value.toLocaleString("sv-SE");
}

function serviceAction(service?: string): string {
  switch (service) {
    case "Google Ads":
      return "Sätt upp en fokuserad kampanj mot sökord där kunden redan syns men ännu inte vinner klick.";
    case "Lokal SEO":
      return "Optimera Google Business-profilen, recensionerna och lokala landningssidor.";
    case "Teknisk SEO":
      return "Prioritera tekniska förbättringar som gör sidan lättare att tolka, indexera och konvertera.";
    case "Konverteringsoptimering":
      return "Förbättra sidans snabbhet, budskap och väg till kontakt så trafiken ger fler affärer.";
    case "SEO":
    default:
      return "Bygg ut innehåll och struktur runt tjänste- och behovssökningar där nya kunder börjar.";
  }
}

function serviceArgument(service?: string): string {
  switch (service) {
    case "Google Ads":
      return "Bra när kunden vill få fart på relevanta sökningar snabbt medan SEO-spåret byggs upp.";
    case "Lokal SEO":
      return "Lätt att koppla till fler samtal, vägbeskrivningar och förtroende i närområdet.";
    case "Teknisk SEO":
      return "Sälj in som grunden som gör övrig SEO och annonsering mer effektiv.";
    case "Konverteringsoptimering":
      return "Sälj in som att få mer värde ur trafiken kunden redan betalar för eller redan har.";
    case "SEO":
    default:
      return "Positionera som nästa steg från att bli hittad på namn till att bli vald på behov.";
  }
}

export function buildNextDealRecommendation({
  company,
  snapshot,
  finding,
  brandShare,
}: NextDealInput): NextDealRecommendation | null {
  if (!finding) return null;

  const gsc = snapshot.search_console;
  const business = snapshot.business_profile;
  const evidence = [
    finding.internalNote ?? finding.description,
    brandShare != null
      ? `${percent(brandShare)} av klick från varumärkessökningar.`
      : null,
    gsc
      ? `${formatNumber(gsc.clicks)} klick, ${formatNumber(gsc.impressions)} visningar och snittposition ${gsc.position.toFixed(1)} under perioden.`
      : null,
    business?.found
      ? `${business.reviews_count ?? 0} recensioner och ${business.rating ?? "okänt"} i betyg på Google Business.`
      : null,
  ].filter((line): line is string => Boolean(line));

  const packageName =
    finding.service === "SEO" && brandShare != null && brandShare >= 0.7
      ? "SEO Discovery-paket"
      : `${finding.service}-paket`;

  const primaryGoal = company.primary_goal?.trim();
  const geoArea = company.primary_geo_area?.trim();
  const context = [
    primaryGoal ? `målet är ${primaryGoal}` : null,
    geoArea ? `prioriterat område är ${geoArea}` : null,
  ].filter(Boolean);

  return {
    packageName,
    why: context.length
      ? `${finding.title}. Kundkontext: ${context.join(", ")}.`
      : finding.title,
    evidence: evidence.slice(0, 4),
    action: serviceAction(finding.service),
    salesArgument: serviceArgument(finding.service),
  };
}
