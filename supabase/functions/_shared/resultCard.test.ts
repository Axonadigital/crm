import { describe, expect, it } from "vitest";
import { periodLabel, resultCardText, sv } from "./resultCard.ts";

describe("resultCardText", () => {
  const base = { customer: "Östersunds Elservice", period: "2026-08-01" };
  it("bygger meningen av visningar och klick, med positivt delta", () => {
    const t = resultCardText({ ...base, metrics: { impressions: { current: 1240 }, clicks: { current: 96, deltaPct: 38.4 } } });
    expect(t).toContain("Östersunds Elservice hade i augusti 2026 1 240 visningar på Google och 96 klick");
    expect(t).toContain("38 % fler klick än månaden innan");
    expect(t).toContain("inte en prognos för er");
  });
  it("nämner inte delta när det är negativt eller litet", () => {
    const t = resultCardText({ ...base, metrics: { impressions: { current: 800 }, clicks: { current: 40, deltaPct: -12 } } });
    expect(t).not.toContain("fler klick");
    const u = resultCardText({ ...base, metrics: { impressions: { current: 800 }, clicks: { current: 40, deltaPct: 4 } } });
    expect(u).not.toContain("fler klick");
  });
  it("ger null när siffrorna saknas eller är för små", () => {
    expect(resultCardText({ ...base, metrics: null })).toBeNull();
    expect(resultCardText({ ...base, metrics: { impressions: { current: 60 }, clicks: { current: 3 } } })).toBeNull();
    expect(resultCardText({ ...base, metrics: { impressions: { current: 500 }, clicks: { current: 0 } } })).toBeNull();
  });
  it("nämner aldrig förfrågningar eller samtal", () => {
    const t = resultCardText({ ...base, metrics: { impressions: { current: 1240 }, clicks: { current: 96 } } }) ?? "";
    expect(t).not.toMatch(/förfrågning|samtal|kunder/i);
  });
});

describe("hjälpare", () => {
  it("formaterar svenska tusental och perioder", () => {
    expect(sv(1240)).toBe("1 240");
    expect(sv(96)).toBe("96");
    expect(sv(1234567)).toBe("1 234 567");
    expect(periodLabel("2026-08-01")).toBe("augusti 2026");
    expect(periodLabel("2026-12-01")).toBe("december 2026");
  });
});
