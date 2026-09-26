import { describe, expect, it } from "vitest";
import {
  FAMILIES,
  MAX_WORDS,
  OPT_OUT,
  VEM,
  familyFor,
  krokVars,
  measuredValue,
  observationDay,
  referenceFor,
  wordCount,
  type KrokContext,
  type KrokFamily,
} from "./krokCopy.ts";

const ctx = (over: Partial<KrokContext> = {}): KrokContext => ({
  namn: "Nimoz Elinstallation AB",
  sajt: "nimoz.se",
  ort: "Hammerdal",
  dag: "i dag",
  varde: "38",
  referens: "Östersunds Elservice",
  ...over,
});

const families = Object.keys(FAMILIES) as KrokFamily[];

/** Så som mallarna i migrationen sätter ihop stegen. */
const step1 = (v: ReturnType<typeof krokVars>) =>
  `Hej!\n\n${v.krok_oppning}\n\n${v.vem} ${v.krok_erbjudande}${v.krok_referens}\n\n${v.krok_cta}\n\n${v.opt_out}`;
const step2 = (v: ReturnType<typeof krokVars>) =>
  `Hej!\n\n${v.krok_bild_intro}\n\n${v.krok_bild_fraga}\n\n${v.opt_out}`;
const step4 = (v: ReturnType<typeof krokVars>) =>
  `Hej!\n\n${v.krok_breakup}\n\n${v.opt_out}`;

describe("krokCopy", () => {
  it("varje familj håller playbookens tak i alla steg, även med referens", () => {
    for (const family of families) {
      const v = krokVars(family, ctx());
      expect(wordCount(step1(v)), `${family} steg 1 = ${wordCount(step1(v))} ord`).toBeLessThanOrEqual(MAX_WORDS);
      expect(wordCount(step2(v)), `${family} steg 2`).toBeLessThanOrEqual(MAX_WORDS);
      expect(wordCount(step4(v)), `${family} steg 4`).toBeLessThanOrEqual(MAX_WORDS);
    }
  });

  it("ämnesraden är kort och ställd som en fråga", () => {
    for (const family of families) {
      const amne = krokVars(family, ctx()).krok_amne;
      expect(amne.endsWith("?"), `${family}: ${amne}`).toBe(true);
      expect(wordCount(amne), `${family}: ${amne}`).toBeLessThanOrEqual(6);
      expect(amne.length).toBeLessThanOrEqual(40);
    }
  });

  it("varje steg-1-mejl säger vem som skriver, gör ett erbjudande och slutar med opt-out", () => {
    for (const family of families) {
      const text = step1(krokVars(family, ctx()));
      expect(text).toContain(VEM);
      expect(text).toMatch(/Om (ni|inte|den)/);
      expect(text.trimEnd().endsWith(OPT_OUT)).toBe(true);
    }
  });

  it("påstår inget om nuläget som inte är uppmätt: inga förlust-, kund- eller resultatord", () => {
    const forbidden = /förlorar|tappar|fler kunder|mer intäkt|garant|bäst|snabbast|billig|% |procent/i;
    for (const family of families) {
      const v = krokVars(family, ctx());
      for (const text of [step1(v), step2(v), step4(v)]) {
        expect(text, `${family}`).not.toMatch(forbidden);
      }
    }
  });

  it("inga priser i något steg", () => {
    for (const family of families) {
      const v = krokVars(family, ctx());
      expect([step1(v), step2(v), step4(v)].join(" ")).not.toMatch(/\d+ ?kr|\bkronor\b/i);
    }
  });

  it("referensen är en hel mening som pekar på referenssidan, och saknas utan bransch", () => {
    const med = krokVars("slow-mobile", ctx());
    expect(med.krok_referens).toContain("Östersunds Elservice");
    expect(med.krok_referens).toContain("axonadigital.se/referenser");
    const utan = krokVars("slow-mobile", ctx({ referens: null }));
    expect(utan.krok_referens).toBe("");
    expect(utan.krok_referens_mening).toBe("");
  });

  it("bara bildfamiljerna kräver en bild i steg 2", () => {
    const kraver = families.filter((f) => krokVars(f, ctx()).krok_bild_kravs === "1");
    expect(kraver.sort()).toEqual(["no-site", "not-mobile", "parked", "poor-crux", "slow-mobile"]);
  });
});

describe("referenceFor", () => {
  it("skiljer el från VVS på namnet inom segmentet vvs_el", () => {
    expect(referenceFor("vvs_el", "Nimoz Elinstallation AB")).toBe("Östersunds Elservice");
    expect(referenceFor("vvs_el", "Boströms Rör AB")).toBe("Roddar VVS");
    // Allabolags bransch slår namnet: Jemtel AB är byggmästare, inte el eller VVS.
    expect(referenceFor("vvs_el", "Jemtel AB", "https://www.allabolag.se/foretag/jemtel-ab/offerdal/byggm%C3%A4stare/2K2PGY4I5YDDT")).toBe("Tullus Bygg & Entreprenad");
    expect(referenceFor("bygg", "Elkompetens i Jämtland AB", "https://www.allabolag.se/foretag/elkompetens/ostersund/elinstallat%C3%B6rer/X")).toBe("Östersunds Elservice");
    expect(referenceFor("vvs_el", "Nimoz Elinstallation AB", null)).toBe("Östersunds Elservice");
  });
  it("ger null när det inte finns ett hemsidecase i branschen", () => {
    expect(referenceFor("tandvard", "City dentists")).toBeNull();
    expect(referenceFor(null, "Okänt AB")).toBeNull();
  });
  it("städ hittas på namnet oavsett segment", () => {
    expect(referenceFor("ovrigt", "Viktors Städ & Fönster")).toBe("Viktorias Städservice");
  });
});

describe("familyFor", () => {
  const f = (id: string, title = id) => ({ id, title, why: "", fix: "", severity: "high", axis: "seo", impact: 50, effort: "quick", service: "", mailable: true });
  it("väljer första mailable-fyndet som har en familj", () => {
    const r = familyFor([f("no-credentials"), { ...f("slow-mobile", "Långsam på mobil (38/100)"), mailable: true }]);
    expect(r?.family).toBe("slow-mobile");
  });
  it("hoppar över fynd som inte får citeras", () => {
    expect(familyFor([{ ...f("no-https"), mailable: false }])).toBeNull();
  });
  it("mappar http-error till unreachable och no-real-website till no-site", () => {
    expect(familyFor([f("http-error")])?.family).toBe("unreachable");
    expect(familyFor([f("no-real-website")])?.family).toBe("no-site");
  });
});

describe("measuredValue + observationDay", () => {
  it("plockar siffran ur rubriken", () => {
    expect(measuredValue("Långsam på mobil (38/100)")).toBe("38");
    expect(measuredValue("Sajten saknar HTTPS")).toBeNull();
  });
  it("säger i dag bara när skanningen gjordes samma svenska dag", () => {
    const now = new Date("2026-09-26T09:00:00+02:00");
    expect(observationDay("2026-09-26T05:30:00+02:00", now)).toBe("i dag");
    expect(observationDay("2026-09-25T23:30:00+02:00", now)).toBe("i går");
    expect(observationDay("2026-09-23T10:00:00+02:00", now)).toBe("den 23 september");
  });
  it("räknar dygnet i svensk tid, inte UTC", () => {
    // 23:30 UTC den 25:e är 01:30 den 26:e i Stockholm.
    const now = new Date("2026-09-26T09:00:00+02:00");
    expect(observationDay("2026-09-25T23:30:00Z", now)).toBe("i dag");
  });
});
