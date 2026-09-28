import { describe, expect, it } from "vitest";
import { abVariant, callNote, scanIsFresh, shouldSkipBreakup } from "./outreachFlow.ts";

describe("scanIsFresh", () => {
  const now = new Date("2026-09-26T10:00:00Z");
  it("färsk inom 24 timmar, inte därefter, aldrig utan tid", () => {
    expect(scanIsFresh("2026-09-26T08:00:00Z", now)).toBe(true);
    expect(scanIsFresh("2026-09-25T09:00:00Z", now)).toBe(false);
    expect(scanIsFresh(null, now)).toBe(false);
  });
  it("en skanning i framtiden räknas inte som färsk (klockfel)", () => {
    expect(scanIsFresh("2026-09-27T10:00:00Z", now)).toBe(false);
  });
});

describe("abVariant", () => {
  it("är deterministisk", () => {
    expect(abVariant(42)).toBe(abVariant(42));
  });
  it("delar ungefär jämnt även på id i följd", () => {
    const calls = Array.from({ length: 2000 }, (_, i) => abVariant(i + 1)).filter((v) => v === "call").length;
    expect(calls).toBeGreaterThan(900);
    expect(calls).toBeLessThan(1100);
  });
  it("shareCall 0 ger aldrig samtal, 1 alltid", () => {
    expect(abVariant(7, 0)).toBe("email");
    expect(abVariant(7, 1)).toBe("call");
  });
});

describe("shouldSkipBreakup", () => {
  it("skickar breakup när inget hänt", () => {
    expect(shouldSkipBreakup({ leadStatus: "new", callLogsSinceStep3: [] })).toEqual({ skip: false, reason: null });
  });
  it("hoppar över när ett samtal nått fram", () => {
    const r = shouldSkipBreakup({ leadStatus: "new", callLogsSinceStep3: [{ call_outcome: "spoke_decision_maker", created_at: "2026-09-26" }] });
    expect(r.skip).toBe(true);
  });
  it("räknar inte obesvarade samtal som kontakt", () => {
    const r = shouldSkipBreakup({ leadStatus: "new", callLogsSinceStep3: [{ call_outcome: "no_answer", created_at: "2026-09-26" }] });
    expect(r.skip).toBe(false);
  });
  it("hoppar över när leadstatus ändrats av någon annan", () => {
    expect(shouldSkipBreakup({ leadStatus: "meeting_booked", callLogsSinceStep3: [] }).skip).toBe(true);
    expect(shouldSkipBreakup({ leadStatus: "no_response", callLogsSinceStep3: [] }).skip).toBe(false);
  });
});

describe("callNote", () => {
  it("säger vad som skickats, när, och vad samtalet gäller", () => {
    const n = callNote({ familyLabel: "mobilpoängen", observation: "38 av 100 i Googles mobilmätning", sentStep1At: "2026-09-26T07:00:00Z", assetSent: true });
    expect(n).toContain("26 sep");
    expect(n).toContain("mobilpoängen");
    expect(n).toContain("Bilden är skickad");
    expect(n).toContain("sett mejlet");
  });
});
