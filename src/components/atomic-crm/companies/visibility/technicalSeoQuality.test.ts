import { describe, expect, it } from "vitest";

import {
  buildTechnicalQualityChecks,
  technicalQualityStatus,
} from "./technicalSeoQuality";

describe("technical SEO quality", () => {
  it("rates valid title, meta and one H1 as good", () => {
    const checks = buildTechnicalQualityChecks({
      seo_checks: {
        indexable: true,
        title: "Tydlig sidtitel för byggfirma i Östersund",
        meta_description:
          "Det här är en metabeskrivning som håller en rimlig längd för ett sökresultat och förklarar erbjudandet tydligt för nya kunder.",
        h1: true,
        h1_count: 1,
        sitemap: true,
        robots: true,
        schema_org: true,
        og_tags: true,
      },
    });
    expect(technicalQualityStatus(checks)).toBe("good");
  });

  it("marks missing indexability and missing H1 as critical", () => {
    const checks = buildTechnicalQualityChecks({
      seo_checks: {
        indexable: false,
        title: "Kort",
        meta_description: "För kort.",
        h1: false,
        h1_count: 0,
        sitemap: false,
        robots: false,
        schema_org: false,
        og_tags: false,
      },
    });
    expect(checks.find((check) => check.key === "indexable")?.level).toBe(
      "critical",
    );
    expect(checks.find((check) => check.key === "h1")?.level).toBe("critical");
    expect(technicalQualityStatus(checks)).toBe("poor");
  });
});
