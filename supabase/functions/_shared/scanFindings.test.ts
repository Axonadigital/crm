import { describe, expect, it } from "vitest";
import {
  firstSentence,
  whyForEmail,
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
    mailable: true,
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
    mailable: true,
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
    mailable: true,
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
      { id: "a", title: "A", severity: "high", impact: 50, mailable: true },
      { id: "b", title: "B", severity: "high", impact: 50, mailable: true },
    ];
    expect(rankFindings(tie).map((f) => f.id)).toEqual(["a", "b"]);
    expect(rankFindings([...tie]).map((f) => f.id)).toEqual(["a", "b"]);
  });

  it("okänd allvarsgrad hamnar sist, inte först", () => {
    const mixed = [
      { id: "okand", title: "X", severity: "", impact: 99, mailable: true },
      { id: "hog", title: "Y", severity: "high", impact: 10, mailable: true },
    ];
    expect(rankFindings(mixed)[0].id).toBe("hog");
  });
});

describe("bara mejlbara fynd får citeras", () => {
  // Fyra kalla mejl 2026-09-23 citerade fynd mottagaren kunde motbevisa.
  // Skannern stämplar numera varje fynd; rankningen släpper bara igenom de
  // bevisbara.
  it("utelämnar fynd som inte är mejlbara", () => {
    const blandat = [
      { id: "no-contact-path", title: "Ingen kontaktväg", severity: "high", impact: 99, mailable: false },
      { id: "noindex", title: "Blockerad från Google", severity: "high", impact: 10, mailable: true },
    ];
    expect(rankFindings(blandat).map((f) => f.id)).toEqual(["noindex"]);
  });

  it("gamla skanningar utan fältet ger inget att citera", () => {
    const gammalt = [
      { id: "noindex", title: "Blockerad från Google", severity: "high", impact: 100 },
    ];
    expect(rankFindings(gammalt)).toEqual([]);
    expect(topFinding(gammalt)).toBeNull();
  });

  it("parseFindings bär fältet vidare — annars tystnar allt", () => {
    expect(parseFindings(REAL)[0].mailable).toBe(true);
    expect(
      parseFindings([{ id: "x", title: "X" }])[0].mailable,
    ).toBe(false);
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

describe("firstSentence — punkter som inte är meningsgränser", () => {
  // Exakt det som gick ut i prod-testet 2026-09-11.
  it("klipper INTE mitt i robots.txt", () => {
    expect(
      firstSentence(
        "Er robots.txt säger åt Google att inte indexera sidan. Ingen som söker på era tjänster kan hitta er.",
      ),
    ).toBe("Er robots.txt säger åt Google att inte indexera sidan.");
  });

  it("klipper INTE i decimaltal", () => {
    expect(
      firstSentence("Sidan laddar på 4.2 sekunder. Det är för långsamt."),
    ).toBe("Sidan laddar på 4.2 sekunder.");
  });

  it("klipper INTE i svenska förkortningar", () => {
    expect(
      firstSentence("Gäller t.ex. bilder och video. Resten är fine."),
    ).toBe("Gäller t.ex. bilder och video.");
  });

  it("klipper INTE i domännamn", () => {
    expect(
      firstSentence("Länken går till hitta.se i stället för er egen sajt. Det kostar er besök."),
    ).toBe("Länken går till hitta.se i stället för er egen sajt.");
  });

  it("tar hela texten när det bara finns en mening", () => {
    expect(firstSentence("Sitemap saknas helt.")).toBe("Sitemap saknas helt.");
    expect(firstSentence("Ingen punkt alls")).toBe("Ingen punkt alls");
  });

  it("klarar utropstecken och frågetecken som gräns", () => {
    expect(firstSentence("Sajten är nere! Det måste åtgärdas nu.")).toBe(
      "Sajten är nere!",
    );
  });

  it("tål tomt och blanksteg", () => {
    expect(firstSentence("")).toBe("");
    expect(firstSentence("   ")).toBe("");
  });
});

describe("whyForEmail", () => {
  it("behåller konsekvensen som firstSentence kapade bort", () => {
    // Det verkliga fallet: mottagaren fick tekniken och missade poängen.
    const why =
      "Er robots.txt säger åt Google att inte indexera sidan. Ingen som söker på era tjänster kan hitta er.";
    expect(firstSentence(why)).toBe(
      "Er robots.txt säger åt Google att inte indexera sidan.",
    );
    expect(whyForEmail(why)).toBe(why);
  });

  it("tar högst två meningar så mejlet inte sväller", () => {
    const why =
      "Första meningen. Andra meningen. Tredje meningen som inte ska med.";
    expect(whyForEmail(why)).toBe("Första meningen. Andra meningen.");
  });

  it("lämnar enmeningstexter orörda", () => {
    const why = "Socialt bevis är ofta det som avgör valet mellan två leverantörer.";
    expect(whyForEmail(why)).toBe(why);
  });

  it("klarar text utan avslutande skiljetecken", () => {
    expect(whyForEmail("Ingen punkt här")).toBe("Ingen punkt här");
  });

  it("ger tom sträng för tomt underlag", () => {
    expect(whyForEmail("   ")).toBe("");
  });

  it("klipper inte vid filnamn eller decimaltal", () => {
    expect(whyForEmail("Sidan laddar på 4.2 sekunder.")).toBe(
      "Sidan laddar på 4.2 sekunder.",
    );
  });
});
