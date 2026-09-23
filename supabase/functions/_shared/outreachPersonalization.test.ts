import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { outreachPersonalization } from "./outreachPersonalization.ts";
import { segmentCopy, segmentsWithCopy } from "./segmentCopy.ts";

const findings = [
  { title: "En kontaktlänk fungerar inte", severity: "high", impact: 80, mailable: true },
  { title: "Stora bilder på startsidan", severity: "medium", impact: 50, mailable: true },
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
      findings: [{ title: "x".repeat(181), severity: "high", mailable: true }, findings[1]],
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

/**
 * Mallarna lever i SQL, koden som fyller dem i TypeScript. Ingen kompilator
 * binder ihop dem — ett stavfel i {{website_gaol}} upptäcks annars först när
 * renderingskontrollen stoppar ett skarpt utskick. Därför renderas mallarna
 * här mot riktiga variabler.
 */
describe("v4-mallarna mot renderaren", () => {
  // Google Business-banan ligger i en egen migration. Båda läses här så att
  // ett stavfel i endera filen fångas av samma kontroll.
  const allMigrations =
    migration +
    "\n" +
    readFileSync(
      new URL(
        "../../migrations/20260913110000_google_business_templates.sql",
        import.meta.url,
      ),
      "utf8",
    );
  const names = [...allMigrations.matchAll(/\(\s*'(Personlig v4:[^']+)'/g)].map(
    (m) => m[1],
  );
  const subjects = [
    ...allMigrations.matchAll(/\(\s*'Personlig v4:[^']+',\s*\n\s*'([^']*)'/g),
  ].map((m) => m[1]);
  const templates = [
    ...allMigrations.matchAll(/\$copy\$([\s\S]*?)\$copy\$/g),
  ].map((m) => m[1]);

  const varsFor = (segment: string) => {
    const copy = segmentCopy(segment);
    return {
      greeting: "Hej Anna!",
      company_city: "Östersund",
      ...(copy
        ? {
            segment_subject: copy.subject,
            segment_pain: copy.pain,
            segment_pain_2: copy.painFollowup,
          }
        : {}),
      ...outreachPersonalization({
        companyName: "Storsjö Tak AB",
        websiteHost: "storsjotak.se",
        segment,
        findings: [...findings, { id: "no-gbp", axis: "local", title: "Ingen Google Business-profil hittades", severity: "high", impact: 90, mailable: true }],
      }),
    } as Record<string, string>;
  };

  const unresolved = (text: string, vars: Record<string, string>) => {
    const missing: string[] = [];
    render(text, vars).replace(/\{\{(\w+)\}\}/g, (_m, k) => {
      missing.push(k);
      return "";
    });
    return missing;
  };

  it("migrationerna innehåller alla åtta mallar med ämne och kropp", () => {
    expect(names).toHaveLength(8);
    expect(subjects).toHaveLength(8);
    expect(templates).toHaveLength(8);
  });

  it("varje variabel i mallarna finns i ett känt segment", () => {
    const vars = varsFor("bygg");
    for (let i = 0; i < templates.length; i++) {
      expect({
        mall: names[i],
        saknas: unresolved(subjects[i], vars).concat(
          unresolved(templates[i], vars),
        ),
      }).toEqual({ mall: names[i], saknas: [] });
    }
  });

  it("renderade mejl håller sig i 51–100 ord", () => {
    for (const segment of segmentsWithCopy()) {
      const vars = varsFor(segment);
      for (let i = 0; i < templates.length; i++) {
        const ord = render(templates[i], vars).split(/\s+/).filter(Boolean);
        expect({
          mall: `${names[i]} (${segment})`,
          iBandet: ord.length >= 51 && ord.length <= 100,
          ord: ord.length,
        }).toMatchObject({ iBandet: true });
      }
    }
  });

  it("arbetsflödesmallarna blockeras när segmentet är okänt", () => {
    const vars = varsFor("ovrigt");
    const arbetsfloden = names
      .map((n, i) => ({ n, i }))
      .filter(({ n }) => n.includes("arbetsflöde"));
    expect(arbetsfloden).toHaveLength(2);
    for (const { n, i } of arbetsfloden) {
      expect({
        mall: n,
        blockerad: unresolved(subjects[i], vars).concat(
          unresolved(templates[i], vars),
        ).length > 0,
      }).toEqual({ mall: n, blockerad: true });
    }
  });

  it("hemsidemallen blockeras när website-fältet är en katalogsajt", () => {
    for (const host of ["merinfo.se", "northdata.com", "krafman.se"]) {
      const result = outreachPersonalization({
        companyName: "Walltin i Hackås AB",
        websiteHost: host,
        segment: "transport",
        findings,
      });
      expect(result.website_observation).toBeUndefined();
      expect(result.website_followup).toBeUndefined();
      // Men vi får fortfarande fråga om de vill ha en egen hemsida.
      expect(result.website_question).toContain("Walltin i Hackås AB");
    }
  });

  it("Google-fynd blir aldrig en observation om hemsidan", () => {
    const result = outreachPersonalization({
      websiteHost: "storsjotak.se",
      segment: "bygg",
      findings: [
        { id: "no-gbp", axis: "local", title: "Ingen Google Business-profil hittades", severity: "high", impact: 90, mailable: true },
        { id: "parked", axis: "technical", title: "Sidan ser ut som en platshållare", severity: "medium", impact: 40, mailable: true },
      ],
    });
    expect(result.website_observation).toContain("platshållare");
    expect(result.website_observation).not.toContain("Google");
  });

  it("'Ingen egen hemsida' citeras aldrig som ett fynd om sidan", () => {
    const result = outreachPersonalization({
      websiteHost: "storsjotak.se",
      findings: [
        { id: "no-site", axis: "technical", title: "Ingen egen hemsida", severity: "high", impact: 95, mailable: true },
      ],
    });
    expect(result.website_observation).toBeUndefined();
  });
});
