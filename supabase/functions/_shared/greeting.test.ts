import { describe, expect, it } from "vitest";
import { greetingFor, personalFirstName } from "./greeting";
import { shortCompanyName } from "./companyName";

describe("greetingFor — fallen ur utkasten 2026-09-23", () => {
  it("hälsar utan namn när adressen är företagsnamnet", () => {
    expect(
      greetingFor(
        "aussiebygg@outlook.com",
        "Aussie Bygg och Entreprenad i Jämtland AB",
      ),
    ).toBe("Hej!");
  });

  it("hälsar utan namn när adressen är ett hälsningsord", () => {
    expect(greetingFor("tjena@artutbar.se", "Artut")).toBe("Hej!");
  });

  it("delar förnamn.efternamn och tar bort punkten", () => {
    expect(
      greetingFor("tomas.larsson@lbm-ab.com", "LBM - Larssons Bygg & Mätservice AB"),
    ).toBe("Hej Tomas!");
  });

  it("hälsar utan namn på opersonliga brevlådor", () => {
    for (const adress of ["info@x.se", "kontakt@x.se", "mail@x.se", "order@x.se"]) {
      expect(greetingFor(adress, "X"), adress).toBe("Hej!");
    }
  });

  it("använder ett riktigt förnamn när det finns", () => {
    expect(greetingFor("anton@legkiropraktik.se", "Hägglunds Kiropraktik & Rehab AB"))
      .toBe("Hej Anton!");
  });

  it("stor bokstav även när adressen är gemen", () => {
    expect(greetingFor("ERIK@x.se", "X")).toBe("Hej Erik!");
  });
});

describe("personalFirstName — avvisar det som inte är namn", () => {
  it("avvisar förkortningar utan vokal", () => {
    expect(personalFirstName("lbm@x.se", "X")).toBeNull();
  });

  it("avvisar adresser med siffror", () => {
    expect(personalFirstName("kund123@x.se", "X")).toBeNull();
  });

  it("avvisar tomt och orimligt långt", () => {
    expect(personalFirstName("@x.se", "X")).toBeNull();
    expect(personalFirstName("a@x.se", "X")).toBeNull();
    expect(personalFirstName("enorimligtlangtnamnhar@x.se", "X")).toBeNull();
  });

  it("avvisar när adressen upprepar företaget", () => {
    expect(personalFirstName("metropolen@metropolen.net", "Metropolen Fysioterapi AB"))
      .toBeNull();
    // Lokaldelen upprepar domänen i stället för företagsnamnet.
    expect(personalFirstName("frysokyl@frysokyl.se", "Frys & Kylservice AB"))
      .toBeNull();
  });

  it("klarar svenska tecken", () => {
    expect(personalFirstName("åsa@x.se", "X")).toBe("Åsa");
  });
});

describe("shortCompanyName", () => {
  it("tar bort bolagsform sist och först", () => {
    expect(shortCompanyName("AB Östersunds Bilelektriska")).toBe(
      "Östersunds Bilelektriska",
    );
    expect(shortCompanyName("Frys & Kylservice AB")).toBe("Frys & Kylservice");
    expect(shortCompanyName("Wallster Ekonomi Handelsbolag")).toBe(
      "Wallster Ekonomi",
    );
  });

  it("tar bort ortsangivelsen och kortar sammansättningen", () => {
    expect(shortCompanyName("Aussie Bygg och Entreprenad i Jämtland AB")).toBe(
      "Aussie Bygg",
    );
  });

  it("klipper vid bindestreck när namnet är för långt", () => {
    expect(shortCompanyName("LBM - Larssons Bygg & Mätservice AB")).toBe("LBM");
  });

  it("klipper vid & när namnet är för långt", () => {
    expect(shortCompanyName("Hägglunds Kiropraktik & Rehab AB")).toBe(
      "Hägglunds Kiropraktik",
    );
  });

  it("lämnar redan korta namn i fred", () => {
    expect(shortCompanyName("Hair Lounge Östersund")).toBe("Hair Lounge Östersund");
    expect(shortCompanyName("Artut")).toBe("Artut");
    expect(shortCompanyName("PI Sport & Rehab AB")).toBe("PI Sport & Rehab");
  });

  it("behåller originalet hellre än att stympa", () => {
    expect(shortCompanyName("AB")).toBe("AB");
    expect(shortCompanyName("")).toBe("");
  });
});
