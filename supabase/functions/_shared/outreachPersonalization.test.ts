import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { outreachPersonalization } from "./outreachPersonalization.ts";
import { segmentCopy, segmentsWithCopy } from "./segmentCopy.ts";

const findings = [
  { title: "En kontaktlänk fungerar inte", severity: "high", impact: 80 },
  { title: "Stora bilder på startsidan", severity: "medium", impact: 50 },
];

const migration = readFileSync(
  new URL(
    "../../migrations/20260911160000_personalized_outreach_templates.sql",
    import.meta.url,
  ),
  "utf8",
);
const templates = [...migration.matchAll(/\$copy\$([\s\S]*?)\$copy\$/g)].map(
  (m) => m[1],
);
const render = (template: string, vars: Record<string, string>) =>
  template.replace(/\{\{(\w+)\}\}/g, (token, key) => vars[key] ?? token);

describe("evidence-based personalization", () => {
  it("uses the actual host and ranked finding without inventing financial impact", () => {
    const result = outreachPersonalization({
      websiteHost: "bygg.se",
      segment: "bygg",
      findings,
    });
    expect(result.website_observation).toBe(
      'I vårt automatiska test av bygg.se flaggades: "En kontaktlänk fungerar inte".',
    );
    expect(result.website_goal).toContain("offert");
    expect(result.website_followup).toContain("Stora bilder");
  });

  it("keeps required evidence absent so the existing renderer blocks unsupported claims", () => {
    for (const input of [
      {},
      { findings },
      { websiteHost: "bygg.se", findings: "invalid" },
    ]) {
      expect(
        outreachPersonalization(input).website_observation,
      ).toBeUndefined();
    }
    expect(
      outreachPersonalization({ segment: "ovrigt" }).systems_example,
    ).toBeUndefined();
    expect(
      outreachPersonalization({ companyName: "   " }).prospect_name,
    ).toBeUndefined();
  });

  it("offers a useful follow-up with only one distinct finding", () => {
    const result = outreachPersonalization({
      websiteHost: "bygg.se",
      findings: [findings[0], findings[0]],
    });
    expect(result.website_followup).toContain("kontrollera först");
    expect(result.website_followup).not.toContain("också");
  });

  it("does not infer that the company lacks a website from missing data", () => {
    const result = outreachPersonalization({ companyName: "Testbolaget AB" });
    expect(result.website_question).toBe(
      "Har Testbolaget AB en egen hemsida som ni vill hänvisa nya kunder till?",
    );
    expect(result.website_outline).not.toContain("prislista");
  });

  it("normalizes company input to one line and skips unusably long findings", () => {
    const result = outreachPersonalization({
      companyName: "Bygg\r\nAB",
      websiteHost: "bygg.se",
      findings: [{ title: "x".repeat(181), severity: "high" }, findings[1]],
    });
    expect(result.prospect_name).toBe("Bygg AB");
    expect(result.website_observation).toContain("Stora bilder");
  });
});

describe("actual candidate templates", () => {
  it("provides six opt-in templates without changing sequences or current copy", () => {
    expect(templates).toHaveLength(6);
    expect(migration).not.toMatch(
      /UPDATE\s+public\.(sequences|sequence_steps|email_templates)/i,
    );
  });

  for (const segment of segmentsWithCopy()) {
    it(`renders all six templates for ${segment}, including a single-finding follow-up`, () => {
      const copy = segmentCopy(segment)!;
      const vars = {
        greeting: "Hej!",
        segment_pain: copy.pain,
        ...outreachPersonalization({
          companyName: "Exempelbolaget AB",
          websiteHost: "exempel.se",
          segment,
          findings: [findings[0]],
        }),
      };
      for (const template of templates) {
        const body = render(template, vars);
        expect(body).not.toMatch(/\{\{|undefined|null/);
        expect(body).toContain("Säg till om du inte vill ha fler mejl");
        expect(body.split(/\s+/).length).toBeLessThanOrEqual(125);
        expect(body).not.toContain("av 100");
        expect(body).not.toContain("häromdagen");
      }
    });
  }

  it("leaves a visible missing-evidence token when a website template has no scan", () => {
    const body = render(templates[0], {
      greeting: "Hej!",
      ...outreachPersonalization({ companyName: "Test AB" }),
    });
    expect(body).toContain("{{website_observation}}");
  });
});
