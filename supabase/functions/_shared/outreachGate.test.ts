// @vitest-environment node
import { describe, expect, it } from "vitest";

globalThis.Deno = {
  env: {
    get: () => undefined,
  },
} as typeof globalThis.Deno;

const {
  isSoleTraderOrgNumber,
  normalizeEmail,
  normalizeOrgNumber,
  parseVerdict,
  toDomain,
} = await import("./outreachGate");

describe("normalizeOrgNumber", () => {
  it("strips separators and keeps ten digits", () => {
    expect(normalizeOrgNumber("556000-1234")).toBe("5560001234");
    expect(normalizeOrgNumber("16 5560001234")).toBe("5560001234");
  });

  it("reduces a 12-digit personnummer to the last ten", () => {
    expect(normalizeOrgNumber("19850101-1234")).toBe("8501011234");
  });

  it("rejects too-short or empty input", () => {
    expect(normalizeOrgNumber("12345")).toBeNull();
    expect(normalizeOrgNumber("")).toBeNull();
    expect(normalizeOrgNumber(null)).toBeNull();
  });
});

describe("isSoleTraderOrgNumber", () => {
  it("treats a personnummer (month 01–12) as enskild firma", () => {
    expect(isSoleTraderOrgNumber("850101-1234")).toBe(true);
    expect(isSoleTraderOrgNumber("19921231-0000")).toBe(true);
  });

  it("treats aktiebolag / föreningar (month ≥ 20) as juridisk person", () => {
    expect(isSoleTraderOrgNumber("556000-1234")).toBe(false); // AB
    expect(isSoleTraderOrgNumber("769600-1234")).toBe(false); // ek. förening
    expect(isSoleTraderOrgNumber("802400-1234")).toBe(false); // ideell
  });

  it("handles samordningsnummer (day + 60) — month still decides", () => {
    expect(isSoleTraderOrgNumber("850161-1234")).toBe(true);
  });

  it("is false when the number is unknown", () => {
    expect(isSoleTraderOrgNumber(null)).toBe(false);
  });
});

describe("toDomain", () => {
  it("normalises URLs", () => {
    expect(toDomain("https://www.Foo.se/om-oss?x=1")).toBe("foo.se");
    expect(toDomain("http://foo.se:8080")).toBe("foo.se");
    expect(toDomain("foo.se")).toBe("foo.se");
  });

  it("takes the domain part of an email", () => {
    expect(toDomain("Anna@Foo.se")).toBe("foo.se");
  });

  it("returns null for junk", () => {
    expect(toDomain("")).toBeNull();
    expect(toDomain("localhost")).toBeNull();
    expect(toDomain(null)).toBeNull();
  });
});

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Anna@Foo.SE ")).toBe("anna@foo.se");
  });
  it("rejects non-emails", () => {
    expect(normalizeEmail("foo.se")).toBeNull();
  });
});

describe("parseVerdict", () => {
  it("passes a clean verdict through", () => {
    expect(parseVerdict({ suppressed: false, reasons: [] })).toEqual({
      suppressed: false,
      reasons: [],
    });
  });

  it("treats any reason as suppressed even if the flag is missing", () => {
    expect(parseVerdict({ reasons: ["said_no"] })).toEqual({
      suppressed: true,
      reasons: ["said_no"],
    });
  });

  it("fails closed on malformed data", () => {
    expect(parseVerdict(null).suppressed).toBe(true);
    expect(parseVerdict("nope").suppressed).toBe(true);
  });
});
