import { describe, expect, it } from "vitest";
import { engagementFromSummary, parseSiteEvent, totalCalls } from "./engagement.ts";

describe("parseSiteEvent", () => {
  it("tar en giltig händelse och normaliserar", () => {
    expect(parseSiteEvent({ key: "ABCDEF0123456789", kind: "Form", page: " /kontakt " })).toEqual({
      key: "abcdef0123456789",
      kind: "form",
      page: "/kontakt",
    });
  });
  it("avvisar fel nyckel, fel typ och saknad body", () => {
    expect(() => parseSiteEvent({ key: "kort", kind: "form" })).toThrow(/key/);
    expect(() => parseSiteEvent({ key: "abcdef0123456789", kind: "purchase" })).toThrow(/kind/);
    expect(() => parseSiteEvent(null)).toThrow(/key/);
  });
  it("klipper sidan till 500 tecken och gör tom sida till null", () => {
    expect(parseSiteEvent({ key: "abcdef0123456789", kind: "call", page: "" }).page).toBeNull();
    expect(parseSiteEvent({ key: "abcdef0123456789", kind: "call", page: "x".repeat(700) }).page?.length).toBe(500);
  });
});

describe("engagementFromSummary", () => {
  it("skiljer på omätt (null) och noll", () => {
    expect(engagementFromSummary({ inquiries: 0, site_calls: 0, email_clicks: 0 }, false)).toBeNull();
    expect(engagementFromSummary({ inquiries: 0, site_calls: 0, email_clicks: 0 }, true)).toEqual({
      inquiries: 0, site_calls: 0, email_clicks: 0, measured: true,
    });
  });
  it("tål strängar från databasen", () => {
    expect(engagementFromSummary({ inquiries: "14", site_calls: "3" }, true)).toMatchObject({ inquiries: 14, site_calls: 3, email_clicks: 0 });
  });
});

describe("totalCalls", () => {
  it("summerar sajt och Google-profil, null när inget mäts", () => {
    expect(totalCalls({ site_calls: 5 }, { calls: 7 })).toBe(12);
    expect(totalCalls({ site_calls: 5 }, null)).toBe(5);
    expect(totalCalls(null, { calls: 7 })).toBe(7);
    expect(totalCalls(null, null)).toBeNull();
  });
});
