import { describe, expect, it } from "vitest";
import { cleanCompanyName, domainsInText, looksLikeListing, emailBelongsToOther, cleanEmailAddress, looksParked, ownEmailDomain, verifyLead, websiteFromSearch } from "./leadVerify.ts";

describe("cleanEmailAddress", () => {
  it("tar bort skrapans etikett och avslutande punkt", () => {
    expect(cleanEmailAddress("E-postbodalsvvs@gmail.com")).toEqual({ email: "bodalsvvs@gmail.com", changed: true });
    expect(cleanEmailAddress("Emailsandra@lrredovisning.se")?.email).toBe("sandra@lrredovisning.se");
    expect(cleanEmailAddress("info@elservice-branan.se.")).toEqual({ email: "info@elservice-branan.se", changed: true });
  });
  it("rör inte riktiga adresser som börjar likadant", () => {
    expect(cleanEmailAddress("mailservice@firma.se")).toEqual({ email: "mailservice@firma.se", changed: false });
    expect(cleanEmailAddress("emil@firma.se")?.email).toBe("emil@firma.se");
    expect(cleanEmailAddress("info@nimoz.se")).toEqual({ email: "info@nimoz.se", changed: false });
  });
  it("vägrar skräp", () => {
    expect(cleanEmailAddress("")).toBeNull();
    expect(cleanEmailAddress("ring oss")).toBeNull();
  });
});

describe("namn och domän", () => {
  it("kapar Google Maps-titlar", () => {
    expect(cleanCompanyName("Bodals VVS AB | Rörmokare Östersund & Brunflo")).toBe("Bodals VVS AB");
    expect(cleanCompanyName("Norderåsens VVS Entreprenad & Service AB")).toBe("Norderåsens VVS Entreprenad & Service AB");
  });
  it("bara bolagets egen mejldomän räknas", () => {
    expect(ownEmailDomain("nick@nhbel.se")).toBe("nhbel.se");
    expect(ownEmailDomain("bodalsvvs@gmail.com")).toBeNull();
    expect(ownEmailDomain("info@boolag.se")).toBeNull();
  });
  it("känner igen parkerade sidor", () => {
    expect(looksParked("<title>Parked at Loopia</title>")).toBe(true);
    expect(looksParked("<title>HEM</title>")).toBe(false);
  });
});

describe("websiteFromSearch", () => {
  it("hittar Norderåsens sajt på annan domän via titeln, hoppar över kataloger", () => {
    const hits = [
      { link: "https://www.allabolag.se/foretag/norderasens-vvs", title: "Norderåsens VVS Entreprenad & Service AB" },
      { link: "https://www.bad-varme.se/", title: "Bad & Värme – Norderåsens VVS i Östersund" },
    ];
    expect(websiteFromSearch("Norderåsens VVS Entreprenad & Service AB", hits)).toBe("https://bad-varme.se/");
  });
  it("ger null när bara kataloger och främlingar svarar", () => {
    const hits = [
      { link: "https://www.hitta.se/bodals", title: "Bodals VVS AB" },
      { link: "https://www.facebook.com/bodalsvvs", title: "Bodals VVS" },
      { link: "https://rormokare.se/", title: "Rörmokare i Stockholm" },
    ];
    expect(websiteFromSearch("Bodals VVS AB | Rörmokare Östersund & Brunflo", hits)).toBeNull();
  });
});

describe("verifyLead", () => {
  const base = { companyName: "Bodals VVS AB", companyWebsite: "", email: "bodalsvvs@gmail.com", emailDomainLive: null, searchHits: [] };
  it("släpper ett verifierat no-site-lead", () => {
    expect(verifyLead({ ...base, family: "no-site" })).toMatchObject({ ok: true, email: "bodalsvvs@gmail.com" });
  });
  it("stoppar no-site när mejldomänen har sajt, när CRM:et har sajt och när sökningen hittar en", () => {
    expect(verifyLead({ ...base, family: "no-site", email: "nick@nhbel.se", emailDomainLive: true })).toMatchObject({ ok: false, foundWebsite: "https://nhbel.se/" });
    expect(verifyLead({ ...base, family: "no-site", companyWebsite: "https://www.bad-varme.se/" })).toMatchObject({ ok: false });
    expect(verifyLead({ ...base, family: "no-site", companyName: "Norderåsens VVS AB", searchHits: [{ link: "https://www.bad-varme.se/", title: "Norderåsens VVS" }] })).toMatchObject({ ok: false, foundWebsite: "https://bad-varme.se/" });
  });
  it("stoppar när sökningen inte gick att göra, men bara för frånvaropåståenden", () => {
    expect(verifyLead({ ...base, family: "no-site", searchHits: null })).toMatchObject({ ok: false });
    expect(verifyLead({ ...base, family: "slow-mobile", searchHits: null })).toMatchObject({ ok: true });
  });
  it("stoppar ogiltiga adresser för alla familjer", () => {
    expect(verifyLead({ ...base, family: "slow-mobile", email: "ring oss" })).toMatchObject({ ok: false });
  });
});

describe("emailBelongsToOther", () => {
  it("fångar adress på annat bolags domän men släpper bolagets egen", () => {
    expect(emailBelongsToOther("AWR Redovisning AB", "lrredovisning.se", "Lindsten & Rundqvist Redovisning AB")).toBe(true);
    expect(emailBelongsToOther("NHB Elektriska AB", "nhbel.se", "HEM")).toBe(false);
    expect(emailBelongsToOther("Ovikens Mekaniska AB", "o-mek.se", "O-Mek.se – Skoterkälkar och ATV-vagnar")).toBe(true);
  });
  it("stoppar i verifyLead", () => {
    const r = verifyLead({ family: "slow-mobile", companyName: "AWR Redovisning AB", companyWebsite: "", email: "Emailsandra@lrredovisning.se", emailDomainLive: true, emailDomainTitle: "Lindsten & Rundqvist Redovisning AB", searchHits: [] });
    expect(r.ok).toBe(false);
  });
});

describe("webbadresser i katalogutdrag", () => {
  it("läser ut domäner men inte mejladresser eller kataloger", () => {
    expect(domainsInText("Telefon 063-140 150. E-post info@norderasensvvs.se. Webbplats: www.bad-varme.se")).toEqual(["bad-varme.se"]);
    expect(domainsInText("Se mer på allabolag.se och hitta.se")).toEqual([]);
    expect(domainsInText("Bodals VVS AB i Brunflo, jämför offerter på brabyggfirmor.se")).toEqual([]);
    expect(domainsInText("Norderåsens VVS. Website: bad-varme.se")).toEqual(["bad-varme.se"]);
    expect(domainsInText("Läs mer på https://www.bad-varme.se/ort/ostersund")).toEqual(["bad-varme.se"]);
  });
  it("hittar Norderåsens kedjesajt som bara nämns i ett katalogutdrag", () => {
    const hits = [
      { link: "https://www.nibe.eu/sv-se/partner/norderasens-vvs-ab", title: "Norderåsens VVS AB | Östersund | Värmepumpar | NIBE", snippet: "Installatör" },
      { link: "https://www.eniro.se/bad+&+v%C3%A4rme+norder%C3%A5sens", title: "Bad & Värme Norderåsens VVS AB, ÖSTERSUND", snippet: "Hemvägen 28. Hemsida: www.bad-varme.se" },
    ];
    expect(websiteFromSearch("Norderåsens VVS Entreprenad & Service AB", hits, "norderasensvvs.se")).toBe("https://bad-varme.se/");
  });
});

describe("Bodals", () => {
  it("räknar inte den nedlagda business.site-sidan eller leverantörslistor som hemsida", () => {
    const hits = [
      { link: "https://www.nibe.eu/sv-se/partner/bodals-vvs-ab", title: "Bodals VVS AB | Brunflo | Värmepumpar | NIBE" },
      { link: "https://bodalsvvs.business.site/", title: "Bodals VVS AB | Rörmokare Östersund & Brunflo" },
      { link: "https://www.allabolag.se/foretag/bodals-vvs-ab", title: "Bodals VVS AB", snippet: "E-post bodalsvvs@gmail.com" },
    ];
    expect(websiteFromSearch("Bodals VVS AB", hits, null)).toBeNull();
  });
});

describe("okända kataloger", () => {
  it("listningssidor räknas inte, startsidor och namn i domänen gör det", () => {
    expect(looksLikeListing("https://alltombolag.se/5590757612/bodals-vvs-ab")).toBe(true);
    expect(looksLikeListing("https://www.brabyggfirmor.se/foretag/bodals-vvs")).toBe(true);
    expect(looksLikeListing("https://www.bad-varme.se/")).toBe(false);
    const bodals = [
      { link: "https://alltombolag.se/5590757612/bodals-vvs-ab", title: "Bodals VVS AB - Brunflo" },
      { link: "https://www.brabyggfirmor.se/foretag/bodals-vvs", title: "Bodals VVS AB" },
    ];
    expect(websiteFromSearch("Bodals VVS AB", bodals, null)).toBeNull();
    expect(websiteFromSearch("Bodals VVS AB", [{ link: "https://bodalsvvs.se/kontakt", title: "Kontakt" }], null)).toBe("https://bodalsvvs.se/");
  });
});
