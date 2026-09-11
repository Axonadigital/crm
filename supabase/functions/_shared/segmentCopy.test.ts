import { describe, expect, it } from "vitest";
import {
  SYSTEMS_TEMPLATE_BODY,
  segmentCopy,
  segmentsWithCopy,
} from "./segmentCopy";
import { ALL_SEGMENTS } from "./industrySegment";

describe("segmentCopy", () => {
  it("ger copy för varje segment utom ovrigt", () => {
    for (const segment of ALL_SEGMENTS) {
      const copy = segmentCopy(segment);
      if (segment === "ovrigt") expect(copy).toBeNull();
      else expect(copy, segment).not.toBeNull();
    }
  });

  it("returnerar null på okänt eller tomt segment", () => {
    expect(segmentCopy(null)).toBeNull();
    expect(segmentCopy("")).toBeNull();
    expect(segmentCopy("hittepa")).toBeNull();
  });

  // Frågan sätts in efter "Det jag undrar är något annat: " och måste
  // därför börja med gemen och sluta med frågetecken.
  it("varje pain är en fråga som kan följa efter ett kolon", () => {
    for (const segment of segmentsWithCopy()) {
      const copy = segmentCopy(segment)!;
      for (const text of [copy.pain, copy.painFollowup]) {
        expect(text[0], `${segment}: ${text}`).toBe(text[0].toLowerCase());
        expect(text.endsWith("?"), `${segment}: ${text}`).toBe(true);
      }
    }
  });

  it("uppföljningen ställer en ANNAN fråga än första mejlet", () => {
    for (const segment of segmentsWithCopy()) {
      const copy = segmentCopy(segment)!;
      expect(copy.pain, segment).not.toBe(copy.painFollowup);
    }
  });

  it("ämnesraden är ett kort substantiv, inte en mening", () => {
    for (const segment of segmentsWithCopy()) {
      const { subject } = segmentCopy(segment)!;
      expect(subject.length, segment).toBeLessThanOrEqual(20);
      expect(subject, segment).not.toContain(" ");
    }
  });

  // Resultatpåståenden mäter -17 % svarsfrekvens och kräver bevis vi
  // inte har. Ingen fras får smyga in en siffra eller ett löfte.
  it("innehåller inga resultatlöften eller procentsatser", () => {
    for (const segment of segmentsWithCopy()) {
      const copy = segmentCopy(segment)!;
      const all = `${copy.subject} ${copy.pain} ${copy.painFollowup}`;
      expect(all, segment).not.toMatch(/\d+\s*%|spara[rt]?\s+\d|öka[rt]?\s+\d/i);
      expect(all.toLowerCase(), segment).not.toContain("garanter");
    }
  });
});

describe("mallens längd med varje segments fråga", () => {
  const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

  // Det längsta bolagsnamnet i 50+-bandet 2026-09-11. Namnet står i mejlet
  // och räknas med, så längdtestet måste utgå från värsta fallet.
  const LONGEST_NAME = "Hällberg & Son Åkeri Handelsbolag";

  it("varje segment landar i 51–100-bandet", () => {
    for (const segment of segmentsWithCopy()) {
      const copy = segmentCopy(segment)!;
      const rendered = SYSTEMS_TEMPLATE_BODY
        .replace("{{greeting}}", "Hej Stellan!")
        .replaceAll("{{company_name}}", LONGEST_NAME)
        .replace("{{scan_score}}", "100")
        .replace("{{segment_pain}}", copy.pain);
      const n = words(rendered);
      expect(n, `${segment}: ${n} ord`).toBeGreaterThanOrEqual(51);
      expect(n, `${segment}: ${n} ord`).toBeLessThanOrEqual(100);
    }
  });

  it("mallen lämnar inga platshållare efter rendering", () => {
    const copy = segmentCopy("bygg")!;
    const rendered = SYSTEMS_TEMPLATE_BODY
      .replace("{{greeting}}", "Hej!")
      .replaceAll("{{company_name}}", "Storsjö Tak AB")
      .replace("{{scan_score}}", "71")
      .replace("{{segment_pain}}", copy.pain);
    expect(rendered).not.toContain("{{");
  });
});
