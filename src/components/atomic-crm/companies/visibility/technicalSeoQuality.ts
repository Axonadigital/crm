import type { ReportStatus, WebsiteSnapshot } from "../../types";

export type TechnicalCheckLevel = "good" | "ok" | "poor" | "critical";

export type TechnicalQualityCheck = {
  key: string;
  label: string;
  level: TechnicalCheckLevel;
  detail: string;
};

function lengthLevel(
  value: string | null | undefined,
  min: number,
  max: number,
): TechnicalCheckLevel {
  if (!value?.trim()) return "critical";
  const length = value.trim().length;
  if (length < min * 0.7 || length > max * 1.35) return "poor";
  if (length < min || length > max) return "ok";
  return "good";
}

export function buildTechnicalQualityChecks(
  snapshot: Pick<WebsiteSnapshot, "seo_checks">,
): TechnicalQualityCheck[] {
  const checks = snapshot.seo_checks;
  if (!checks) return [];

  const titleLevel = lengthLevel(checks.title, 15, 60);
  const metaLevel = lengthLevel(checks.meta_description, 120, 160);
  const h1Count = checks.h1_count ?? (checks.h1 ? 1 : 0);
  const h1Level: TechnicalCheckLevel =
    h1Count === 1 ? "good" : h1Count === 0 ? "critical" : "poor";

  return [
    {
      key: "indexable",
      label: "Indexerbar",
      level: checks.indexable === false ? "critical" : "good",
      detail:
        checks.indexable === false
          ? "Startsidan är blockerad från Google."
          : "Google får indexera startsidan.",
    },
    {
      key: "title",
      label: "Sidtitel",
      level: titleLevel,
      detail: checks.title
        ? `${checks.title.trim().length} tecken`
        : "Sidtitel saknas.",
    },
    {
      key: "meta_description",
      label: "Metabeskrivning",
      level: metaLevel,
      detail: checks.meta_description
        ? `${checks.meta_description.trim().length} tecken`
        : "Metabeskrivning saknas.",
    },
    {
      key: "h1",
      label: "Huvudrubrik",
      level: h1Level,
      detail:
        h1Count === 1
          ? "Exakt en H1."
          : h1Count === 0
            ? "H1 saknas."
            : `${h1Count} H1-rubriker hittades.`,
    },
    {
      key: "sitemap",
      label: "Sitemap",
      level: checks.sitemap ? "good" : "poor",
      detail: checks.sitemap ? "Sitemap finns." : "Sitemap saknas.",
    },
    {
      key: "robots",
      label: "Robots.txt",
      level: checks.robots ? "good" : "ok",
      detail: checks.robots ? "Robots.txt finns." : "Robots.txt saknas.",
    },
    {
      key: "schema_org",
      label: "Strukturerad data",
      level: checks.schema_org ? "good" : "poor",
      detail: checks.schema_org
        ? "Strukturerad data finns."
        : "Strukturerad data saknas.",
    },
    {
      key: "og_tags",
      label: "Delningsmetadata",
      level: checks.og_tags ? "good" : "ok",
      detail: checks.og_tags
        ? "Delningsmetadata finns."
        : "Delningsmetadata saknas.",
    },
  ];
}

export function technicalQualityStatus(
  checks: TechnicalQualityCheck[],
): ReportStatus {
  if (checks.length === 0) return "missing";
  if (checks.some((check) => check.level === "critical")) return "poor";
  const poor = checks.filter((check) => check.level === "poor").length;
  if (poor >= 2) return "poor";
  if (poor > 0 || checks.some((check) => check.level === "ok")) {
    return "needs_attention";
  }
  return "good";
}

export function technicalQualityLabel(level: TechnicalCheckLevel): string {
  if (level === "good") return "Bra";
  if (level === "ok") return "Okej";
  if (level === "poor") return "Bristfällig";
  return "Kritisk";
}
