import { describe, expect, it } from "vitest";

import type { WebsiteSnapshot } from "../types";
import { buildWebsiteChecklist } from "./buildWebsiteChecklist";

function makeSnapshot(): WebsiteSnapshot {
  return {
    company_id: 1,
    fetched_at: "2026-06-20T10:00:00.000Z",
    source: "manual",
    url: "https://kund.se",
    period_start: "2026-06-01",
    period_end: "2026-06-20",
    window_kind: "calendar_month",
    data_coverage: {
      available_sources: 4,
      total_sources: 4,
      ratio: 1,
      has_search_console: true,
      has_field_data: true,
    },
    source_status: {
      pagespeed: { status: "available" },
      search_console: { status: "error", message: "timeout" },
    },
    performance_score: 42,
    seo_score: 65,
    pagespeed: {
      performance_score: 42,
      seo_score: 65,
      lcp_ms: 3200,
      cls: 0.12,
      tbt_ms: 410,
      fcp_ms: 1800,
      speed_index_ms: 4200,
      tti_ms: 5100,
      opportunities: [
        { id: "uses-webp", title: "Servera bilder i WebP", savings_ms: 1200 },
        {
          id: "render-block",
          title: "Eliminera render-blocking CSS",
          savings_ms: 600,
        },
      ],
      desktop: {
        performance_score: 78,
        seo_score: 80,
        lcp_ms: 1700,
        cls: 0.02,
        tbt_ms: 90,
        fcp_ms: 900,
        speed_index_ms: 2100,
        tti_ms: 2400,
      },
    },
    field_data: {
      scope: "origin",
      lcp_ms: 2800,
      inp_ms: 220,
      cls: 0.08,
      lcp_rating: "NEEDS_IMPROVEMENT",
      inp_rating: "GOOD",
      cls_rating: "GOOD",
    },
    seo_checks: {
      title: "Kund AB — Bygg i Östersund",
      meta_description: null,
      og_tags: false,
      schema_org: false,
      sitemap: true,
      sitemap_url_count: 12,
      robots: true,
      llms_txt: false,
      h1: true,
      indexable: true,
    },
    business_profile: {
      found: true,
      rating: 4.6,
      reviews_count: 3,
      place_id: "abc123",
    },
    search_console: {
      clicks: 15,
      impressions: 420,
      ctr: 0.036,
      position: 14.2,
      period_start: "2026-06-01",
      period_end: "2026-06-20",
      top_queries: [
        {
          query: "byggfirma östersund",
          clicks: 8,
          impressions: 120,
          position: 6.1,
        },
      ],
      opportunities: [
        {
          kind: "position_4_10",
          query: "takläggare östersund",
          clicks: 2,
          impressions: 90,
          ctr: 0.022,
          position: 6.5,
        },
      ],
    },
    gbp_actions: {
      calls: 5,
      website_clicks: 8,
      direction_requests: 3,
      period_start: "2026-06-01",
      period_end: "2026-06-20",
    },
    competitors: [
      {
        url: "https://konkurrent.se",
        performance_score: 88,
        seo_score: 92,
        lcp_ms: 1500,
        cls: 0.01,
        has_title: true,
        has_schema: true,
        has_sitemap: true,
      },
    ],
    local_rank: [{ keyword: "byggfirma östersund", position: 4, found: true }],
    findings: [
      {
        key: "missing_schema_org",
        severity: "medium",
        title: "Saknar strukturerad data (schema.org)",
        description: "Sidan saknar schema.org.",
        service: "AI-sök-optimering",
      },
      {
        key: "slow_site",
        severity: "high",
        title: "Långsam hemsida",
        description: "Prestandapoäng 42.",
        service: "Prestandaoptimering",
      },
      {
        key: "low_position",
        severity: "medium",
        title: "Snittposition 14 i Google",
        description: "Snittposition över 10.",
        service: "SEO-optimering",
      },
      {
        key: "few_reviews",
        severity: "medium",
        title: "Få Google-recensioner",
        description: "Endast 3 recensioner.",
        service: "Google Business-paket",
      },
    ],
    created_at: "2026-06-20T10:00:00.000Z",
    id: 99,
  } as unknown as WebsiteSnapshot;
}

describe("buildWebsiteChecklist", () => {
  const md = buildWebsiteChecklist({
    companyName: "Kund AB",
    websiteUrl: "https://kund.se",
    snapshot: makeSnapshot(),
  });

  it("includes title, url and full statistics section", () => {
    expect(md).toContain("# Åtgärdschecklista — Kund AB");
    expect(md).toContain("Hemsida: https://kund.se");
    expect(md).toContain("## Nuläge — fullständig statistik");
  });

  it("dumps every present metric group", () => {
    expect(md).toContain("### Prestanda (PageSpeed lab, mobil)");
    expect(md).toContain("### Prestanda (PageSpeed lab, desktop)");
    expect(md).toContain("### Core Web Vitals (riktiga användare, CrUX)");
    expect(md).toContain("### Teknisk SEO");
    expect(md).toContain("### Google-sök (Search Console)");
    expect(md).toContain("### Google Business");
    expect(md).toContain("### Konkurrenter (benchmark)");
    expect(md).toContain("### Lokal ranking (map-pack)");
    // a couple of concrete values
    expect(md).toMatch(/3\s200 ms/);
    expect(md).toContain('"Kund AB — Bygg i Östersund"');
    expect(md).toContain("search_console: error (timeout)");
  });

  it("orders code actions by severity (high before medium)", () => {
    const slowIdx = md.indexOf("Långsam hemsida");
    const schemaIdx = md.indexOf("Saknar strukturerad data");
    expect(slowIdx).toBeGreaterThan(-1);
    expect(schemaIdx).toBeGreaterThan(-1);
    expect(slowIdx).toBeLessThan(schemaIdx);
  });

  it("includes catalog steps and injects snapshot-driven sub-steps", () => {
    // catalog step for schema.org
    expect(md).toContain("Lägg JSON-LD");
    // injected pagespeed opportunity
    expect(md).toMatch(/Spara ~1\s200 ms: Servera bilder i WebP/);
    // injected search console opportunity
    expect(md).toContain('Måltavla [position_4_10]: "takläggare östersund"');
  });

  it("puts Google Business findings under manual actions", () => {
    const manualIdx = md.indexOf("## Manuella åtgärder (utanför koden)");
    expect(manualIdx).toBeGreaterThan(-1);
    expect(md.indexOf("Få Google-recensioner")).toBeGreaterThan(manualIdx);
  });

  it("appends the full raw JSON as a fallback", () => {
    expect(md).toContain("## Rådata (komplett JSON)");
    expect(md).toContain("```json");
    expect(md).toContain('"company_id": 1');
    expect(md).toContain('"key": "slow_site"');
  });
});
