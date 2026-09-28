import { describe, expect, it } from "vitest";
import { lowerFirst, scanTopIssue, websiteHost } from "./templateVars";

describe("scanTopIssue", () => {
  it("plockar ut saken efter 'Största problemet:'", () => {
    expect(
      scanTopIssue(
        "Behöver åtgärder — flera brister håller tillbaka er. Största problemet: ingen kontaktväg utöver telefon.",
      ),
    ).toBe("ingen kontaktväg utöver telefon");
  });

  it("faller tillbaka på rapporten när verdicten saknar 'Största problemet'", () => {
    expect(
      scanTopIssue("Företaget saknar en riktig hemsida — länken går till en profilsida."),
    ).toBe("Det som står överst i rapporten");
    expect(scanTopIssue("")).toBe("Det som står överst i rapporten");
  });
});

describe("lowerFirst", () => {
  it("gör bara första tecknet litet", () => {
    expect(lowerFirst("Ingen Google-profil hittades")).toBe("ingen Google-profil hittades");
    expect(lowerFirst("")).toBe("");
  });
});

describe("websiteHost", () => {
  it("ger bara värdnamnet utan www", () => {
    expect(websiteHost("https://www.bolagsfakta.se/5591117683-Hallberg_i_Berg_AB")).toBe(
      "bolagsfakta.se",
    );
    expect(websiteHost("skorstensfolketostersund.se/")).toBe("skorstensfolketostersund.se");
    expect(websiteHost("")).toBe("");
  });
});
