import { describe, expect, it } from "vitest";
import { periodLabel, resultCardText, sv } from "./resultCard.ts";

describe("resultCardText", () => {
  const base = { customer: "Östersunds Elservice", period: "2026-08-01" };
  it("bygger meningen av visningar och klick, med positivt delta", () => {
    const t = resultCardText({ ...base, metrics: { impressions: { current: 1240 }, clicks: { current: 96, deltaPct: 38.4 } } });
    expect(t).toContain("i augusti 2026 hade Östersunds Elservice **1 240 visningar** på Google och **96 klick** till sidan");
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
  it("nämner förfrågningar och samtal bara när de är uppmätta", () => {
    const utan = resultCardText({ ...base, metrics: { impressions: { current: 1240 }, clicks: { current: 96 } } }) ?? "";
    expect(utan).not.toMatch(/förfrågning|samtal|kunder/i);
    const noll = resultCardText({ ...base, metrics: { impressions: { current: 1240 }, clicks: { current: 96 }, inquiries: { current: 0 }, calls: { current: 0 } } }) ?? "";
    expect(noll).not.toMatch(/förfrågning|samtal/i);
    const med = resultCardText({ ...base, metrics: { impressions: { current: 1240 }, clicks: { current: 96 }, inquiries: { current: 14 }, calls: { current: 23 } } }) ?? "";
    expect(med).toContain("Det gav **14 förfrågningar** via formuläret på sidan och **23 samtal** startade från sidan.");
    expect(med).toContain("inte en prognos för er");
    const en = resultCardText({ ...base, metrics: { impressions: { current: 1240 }, clicks: { current: 96 }, inquiries: { current: 1 } } }) ?? "";
    expect(en).toContain("Det gav **1 förfrågan** via formuläret på sidan.");
    expect(en).not.toContain("samtal");
  });
});

describe("hjälpare", () => {
  it("sätter aldrig årtalet intill visningstalet", () => {
    const t = resultCardText({ customer: "Roddar VVS", period: "2026-08-01", metrics: { impressions: { current: 1812 }, clicks: { current: 29 } } }) ?? "";
    expect(t).not.toMatch(/2026 \**?\d/);
    expect(t.startsWith("Ett exempel på vad det ger: i augusti 2026 hade Roddar VVS **1 812 visningar**")).toBe(true);
  });
  it("formaterar svenska tusental och perioder", () => {
    expect(sv(1240)).toBe("1 240");
    expect(sv(96)).toBe("96");
    expect(sv(1234567)).toBe("1 234 567");
    expect(periodLabel("2026-08-01")).toBe("augusti 2026");
    expect(periodLabel("2026-12-01")).toBe("december 2026");
  });
});
