import { describe, expect, it } from "vitest";
import { isJamtlandPostcode, parseScbLine, personName, titleCase } from "./nystartade.ts";

const row = (o: Partial<Record<string, string>>) =>
  [
    "1", "", o.Foretagsnamn ?? "", o.FtgStat ?? "1", o.Gatuadress ?? "STORGATAN 1", "1", o.JurForm ?? "49", o.Namn ?? "Fjällkontoret AB",
    o.Ng1 ?? "70220", "", "", "", "", o.PeOrgNr ?? "165591234567", o.PostNr ?? "83130", o.PostOrt ?? "ÖSTERSUND", o.RegDatKtid ?? "20260815", o.Reklamsparrtyp ?? "1",
  ].join("\t");

describe("postnummer", () => {
  it("tar Jämtlands län men inte Ånge", () => {
    expect(isJamtlandPostcode("83130")).toBe(true);
    expect(isJamtlandPostcode("84693")).toBe(true);
    expect(isJamtlandPostcode("84231")).toBe(true); // Sveg
    expect(isJamtlandPostcode("84131")).toBe(false); // Ånge
    expect(isJamtlandPostcode("85230")).toBe(false); // Sundsvall
    expect(isJamtlandPostcode("00000")).toBe(false);
  });
});

describe("namn", () => {
  it("gör versaler läsbara och vänder personnamn", () => {
    expect(titleCase("ÖSTERSUND")).toBe("Östersund");
    expect(titleCase("BYGG OCH MÅLERI I ÅRE")).toBe("Bygg och Måleri i Åre");
    expect(personName("Backlund, Tony")).toBe("Tony Backlund");
  });
});

describe("parseScbLine", () => {
  it("tar ett nytt aktiebolag i Östersund med organisationsnummer", () => {
    const r = parseScbLine(row({}), "2026-08-01");
    expect(r).toMatchObject({ ok: true, company: { name: "Fjällkontoret AB", org_number: "559123-4567", form: "ab", zipcode: "831 30", city: "Östersund", reg_date: "2026-08-15", sni_code: "70220" } });
  });
  it("lagrar enskild firma utan personnummer", () => {
    const r = parseScbLine(row({ JurForm: "10", Namn: "Backlund, Tony", PeOrgNr: "198001011234" }), "2026-08-01");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.company.org_number).toBeNull();
      expect(r.company.name).toBe("Tony Backlund");
      expect(JSON.stringify(r.company)).not.toContain("198001011234");
    }
  });
  it("sållar bort fel form, reklamspärr, fel län och gamla bolag", () => {
    expect(parseScbLine(row({ JurForm: "61" }), "2026-08-01")).toMatchObject({ ok: false });
    expect(parseScbLine(row({ Reklamsparrtyp: "2" }), "2026-08-01")).toMatchObject({ ok: false, reason: "reklamspärr" });
    expect(parseScbLine(row({ PostNr: "84131" }), "2026-08-01")).toMatchObject({ ok: false });
    expect(parseScbLine(row({ RegDatKtid: "20260615" }), "2026-08-01")).toMatchObject({ ok: false, reason: "för gammal" });
  });
});
