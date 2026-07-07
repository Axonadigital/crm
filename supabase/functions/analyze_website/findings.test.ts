import { describe, expect, it } from "vitest";
import type { AnalysisInput } from "./findings.ts";
import { computeFindings } from "./findings.ts";

const healthySite: AnalysisInput = {
  pagespeed: {
    performance_score: 95,
    seo_score: 100,
    lcp_ms: 1200,
    cls: 0.01,
    tbt_ms: 50,
    opportunities: [],
  },
  seoChecks: {
    title: "Testbolaget — Bygg i Östersund",
    meta_description:
      "Testbolaget bygger hållbara hus, renoverar villor och hjälper kunder i Östersund från första idé till färdigt projekt med trygg process.",
    og_tags: true,
    schema_org: true,
    sitemap: true,
    robots: true,
    llms_txt: true,
    h1: true,
    indexable: true,
  },
  businessProfile: { found: true, rating: 4.8, reviews_count: 27 },
  searchConsole: {
    clicks: 120,
    impressions: 2400,
    position: 4.2,
    top_queries: [],
  },
};

describe("computeFindings", () => {
  it("returns no findings for a healthy site", () => {
    expect(computeFindings(healthySite)).toEqual([]);
  });

  it("flags a slow site as high severity with LCP in the description", () => {
    const findings = computeFindings({
      ...healthySite,
      pagespeed: {
        ...healthySite.pagespeed!,
        performance_score: 32,
        lcp_ms: 6200,
      },
    });
    const slow = findings.find((f) => f.key === "slow_site");
    expect(slow?.severity).toBe("high");
    expect(slow?.description).toContain("6,2 s");
    expect(slow?.service).toBe("Prestandaoptimering");
  });

  it("flags missing Google Business profile as high severity", () => {
    const findings = computeFindings({
      ...healthySite,
      businessProfile: { found: false },
    });
    const missing = findings.find((f) => f.key === "missing_business_profile");
    expect(missing?.severity).toBe("high");
    expect(missing?.service).toBe("Google Business-paket");
  });

  it("treats missing Google Business profile as low severity when local SEO is irrelevant", () => {
    const findings = computeFindings({
      ...healthySite,
      localSeoRelevant: false,
      businessProfile: { found: false },
    });
    const missing = findings.find((f) => f.key === "missing_business_profile");
    expect(missing?.severity).toBe("low");
    expect(missing?.description).toContain("mindre relevant");
  });

  it("flags missing schema.org and llms.txt as AI-search opportunities", () => {
    const findings = computeFindings({
      ...healthySite,
      seoChecks: {
        ...healthySite.seoChecks!,
        schema_org: false,
        llms_txt: false,
      },
    });
    expect(findings.map((f) => f.key)).toEqual(
      expect.arrayContaining(["missing_schema_org", "missing_llms_txt"]),
    );
    expect(
      findings
        .filter((f) =>
          ["missing_schema_org", "missing_llms_txt"].includes(f.key),
        )
        .every((f) => f.service === "AI-sök-optimering"),
    ).toBe(true);
  });

  it("flags an explicit noindex directive as a high SEO issue", () => {
    const findings = computeFindings({
      ...healthySite,
      seoChecks: { ...healthySite.seoChecks!, indexable: false },
    });
    expect(findings.find((finding) => finding.key === "noindex")).toMatchObject(
      {
        severity: "high",
        service: "SEO-optimering",
      },
    );
  });

  it("flags weak title/meta lengths and multiple H1 headings", () => {
    const findings = computeFindings({
      ...healthySite,
      seoChecks: {
        ...healthySite.seoChecks!,
        title: "Kort",
        meta_description: "För kort.",
        h1: true,
        h1_count: 2,
      },
    });
    expect(findings.map((finding) => finding.key)).toEqual(
      expect.arrayContaining([
        "poor_title_length",
        "poor_meta_description_length",
        "multiple_h1",
      ]),
    );
  });

  it("skips entire sections when source data is null (failed fetch or no access)", () => {
    const findings = computeFindings({
      pagespeed: null,
      seoChecks: null,
      businessProfile: null,
      searchConsole: null,
    });
    expect(findings).toEqual([]);
  });

  it("flags total search invisibility (0 clicks AND 0 impressions) as high", () => {
    const findings = computeFindings({
      ...healthySite,
      searchConsole: {
        clicks: 0,
        impressions: 0,
        position: 0,
        top_queries: [],
      },
    });
    const invisible = findings.find((f) => f.key === "no_search_visibility");
    expect(invisible?.severity).toBe("high");
    expect(invisible?.service).toBe("SEO-optimering");
    // ska inte dubbelrapporteras som no_clicks/low_position
    expect(findings.find((f) => f.key === "no_clicks")).toBeUndefined();
    expect(findings.find((f) => f.key === "low_position")).toBeUndefined();
  });

  it("flags zero clicks despite impressions from Search Console", () => {
    const findings = computeFindings({
      ...healthySite,
      searchConsole: {
        clicks: 0,
        impressions: 1500,
        position: 18,
        top_queries: [],
      },
    });
    const noClicks = findings.find((f) => f.key === "no_clicks");
    expect(noClicks?.severity).toBe("high");
    // no_clicks tar prio — low_position ska inte dubbelrapporteras
    expect(findings.find((f) => f.key === "low_position")).toBeUndefined();
  });

  it("flags few reviews on an existing business profile", () => {
    const findings = computeFindings({
      ...healthySite,
      businessProfile: { found: true, rating: 4.9, reviews_count: 2 },
    });
    expect(findings.find((f) => f.key === "few_reviews")?.title).toContain(
      "2 st",
    );
  });

  it("flags a high brand share with almost no non-branded clicks", () => {
    const findings = computeFindings({
      ...healthySite,
      searchConsole: {
        clicks: 22,
        impressions: 400,
        position: 40.9,
        top_queries: [],
        branded: { clicks: 18, impressions: 100, queries: 3 },
        non_branded: { clicks: 0, impressions: 300, queries: 40 },
      },
    });
    const highBrand = findings.find((f) => f.key === "high_brand_share");
    expect(highBrand?.severity).toBe("high");
    expect(highBrand?.service).toBe("SEO-optimering");
    expect(highBrand?.description).toContain("22");
    expect(highBrand?.description).toContain("18");
  });

  it("does not flag brand share when non-branded traffic is healthy", () => {
    const findings = computeFindings({
      ...healthySite,
      searchConsole: {
        clicks: 120,
        impressions: 2400,
        position: 4.2,
        top_queries: [],
        branded: { clicks: 40, impressions: 200, queries: 3 },
        non_branded: { clicks: 80, impressions: 2200, queries: 60 },
      },
    });
    expect(findings.find((f) => f.key === "high_brand_share")).toBeUndefined();
  });

  it("does not flag brand share when there is no branded/non-branded breakdown", () => {
    const findings = computeFindings(healthySite);
    expect(findings.find((f) => f.key === "high_brand_share")).toBeUndefined();
  });

  it("sorts findings by severity (high first)", () => {
    const findings = computeFindings({
      ...healthySite,
      pagespeed: { ...healthySite.pagespeed!, performance_score: 30 },
      seoChecks: { ...healthySite.seoChecks!, og_tags: false },
    });
    expect(findings[0].severity).toBe("high");
    expect(findings[findings.length - 1].severity).toBe("low");
  });
});
