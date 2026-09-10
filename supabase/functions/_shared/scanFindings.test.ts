import { describe, expect, it } from "vitest";
import {
  firstSentence,
  parseFindings,
  quickWinCount,
  rankFindings,
  secondFinding,
  topFinding,
} from "./scanFindings";

/** Riktig form, hämtad ur skanningen av PO i Jämtland AB (47 poäng). */
const REAL = [
  {
    id: "noindex",
    fix: "Ta bort noindex-taggen (eller X-Robots-Tag-headern) från sidan.",
    why: "En noindex-instruktion säger åt Google att inte visa er i sökresultaten alls — kunder som söker efter era tjänster hittar er inte.",
    axis: "seo",
    title: "Sajten är blockerad från Google",
    effort: "quick",
    impact: 100,
    service: "SEO-paket",
    severity: "high",
  },
  {
    id: "no-gbp",
    fix: "Skapa och verifiera en Google Business-profil med rätt kontaktuppgifter.",
    why: 'Lokala kunder söker "tjänst + ort" och väljer bland kartträffarna — utan profil finns ni inte där.',
    axis: "local",
    title: "Ingen Google Business-profil hittades",
    effort: "quick",
    impact: 70,
    service: "Google Business-paket",
    severity: "high",
  },
  {
    id: "slow",
    fix: "Komprimera bilderna.",
    why: "Sidan laddar långsamt.",
    axis: "performance",
    title: "Sidan är långsam",
    effort: "large",
    impact: 95,
    service: "Prestandapaket",
    severity: "medium",
  },
];

describe("parseFindings", () => {
  it("läser den riktiga formen", () => {
    const out = parseFindings(REAL);
    expect(out).toHaveLength(3);
    expect(out[0].title).toBe("Sajten är blockerad från Google");
    expect(out[0].impact).toBe(100);
  });

  it("tål JSON som sträng", () => {
    expect(parseFindings(JSON.stringify(REAL))).toHaveLength(3);
  });

  it("returnerar tom array för skräp i stället för att kasta", () => {
    for (const junk of [null, undefined, 42, "inte json", {}, "{}"]) {
      expect(parseFindings(junk), String(junk)).toEqual([]);
    }
  });

  it("kastar fynd utan rubrik — de går inte att skriva om", () => {
    expect(parseFindings([{ why: "något", impact: 90 }])).toEqual([]);
  });
});

describe("rankFindings", () => {
  it("allvarsgrad slår påverkan", () => {
    // "Sidan är långsam" har högre impact (95) än Google-profilen (70), men
    // är bara medium — den ska hamna sist.
    expect(rankFindings(REAL).map((f) => f.id)).toEqual([
      "noindex",
      "no-gbp",
      "slow",
    ]);
  });

  it("är stabil så samma skanning alltid ger samma öppningsrad", () => {
    const tie = [
      { id: "a", title: "A", severity: "high", impact: 50 },
      { id: "b", title: "B", severity: "high", impact: 50 },
    ];
    expect(rankFindings(tie).map((f) => f.id)).toEqual(["a", "b"]);
    expect(rankFindings([...tie]).map((f) => f.id)).toEqual(["a", "b"]);
  });

  it("okänd allvarsgrad hamnar sist, inte först", () => {
    const mixed = [
      { id: "okand", title: "X", severity: "", impact: 99 },
      { id: "hog", title: "Y", severity: "high", impact: 10 },
    ];
    expect(rankFindings(mixed)[0].id).toBe("hog");
  });
});

describe("topFinding och secondFinding", () => {
  it("ger det som mejlet öppnar med, och något ANNAT till uppföljningen", () => {
    expect(topFinding(REAL)?.id).toBe("noindex");
    expect(secondFinding(REAL)?.id).toBe("no-gbp");
  });

  it("null när skanningen inte gav något", () => {
    expect(topFinding([])).toBeNull();
    expect(secondFinding(REAL.slice(0, 1))).toBeNull();
  });
});

describe("firstSentence", () => {
  it("klipper vid första punkten", () => {
    expect(firstSentence(REAL[0].why)).toBe(
      "En noindex-instruktion säger åt Google att inte visa er i sökresultaten alls — kunder som söker efter era tjänster hittar er inte.",
    );
  });

  it("returnerar hela texten när punkt saknas", () => {
    expect(firstSentence("Ingen punkt här")).toBe("Ingen punkt här");
  });

  it("tom in, tom ut", () => {
    expect(firstSentence("   ")).toBe("");
  });
});

describe("quickWinCount", () => {
  it("räknar bara det som faktiskt går snabbt", () => {
    expect(quickWinCount(REAL)).toBe(2);
  });

  it("noll för skräp", () => {
    expect(quickWinCount(null)).toBe(0);
  });
});
