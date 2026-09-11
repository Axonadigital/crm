import { describe, expect, it } from "vitest";
import {
  ALL_SEGMENTS,
  allabolagCategoryFromUrl,
  segmentFromAllabolagCategory,
  classifyCompany,
  segmentFromName,
  segmentFromPlacesCategory,
  segmentFromSni,
  type IndustrySegment,
} from "./industrySegment";

describe("segmentFromSni", () => {
  it("tandläkarverksamhet (86.23)", () => {
    expect(segmentFromSni("86.23")).toBe("tandvard");
    expect(segmentFromSni("8623")).toBe("tandvard");
  });

  it("el- och VVS-installation skiljs från övrigt bygg", () => {
    expect(segmentFromSni("43.21")).toBe("vvs_el"); // elinstallationer
    expect(segmentFromSni("43.22")).toBe("vvs_el"); // VVS
  });

  it("golv-, vägg- och måleriarbeten", () => {
    expect(segmentFromSni("43.33")).toBe("maleri_golv");
    expect(segmentFromSni("43.34")).toBe("maleri_golv");
  });

  it("övrig byggverksamhet", () => {
    expect(segmentFromSni("41.20")).toBe("bygg");
    expect(segmentFromSni("42.11")).toBe("bygg");
    expect(segmentFromSni("43.91")).toBe("bygg"); // takarbeten
    expect(segmentFromSni("43.99")).toBe("bygg");
  });

  it("transport och taxi", () => {
    expect(segmentFromSni("49.32")).toBe("transport");
    expect(segmentFromSni("49.41")).toBe("transport");
  });

  it("hår- och skönhetsvård, restaurang, städ", () => {
    expect(segmentFromSni("96.02")).toBe("salong");
    expect(segmentFromSni("56.10")).toBe("restaurang");
    expect(segmentFromSni("81.21")).toBe("fastighet");
  });

  it("returnerar null på okänd eller trasig kod", () => {
    expect(segmentFromSni("01.11")).toBeNull();
    expect(segmentFromSni("")).toBeNull();
    expect(segmentFromSni(null)).toBeNull();
    expect(segmentFromSni("abc")).toBeNull();
  });
});

describe("segmentFromPlacesCategory", () => {
  it("översätter Googles kategorier", () => {
    expect(segmentFromPlacesCategory("dentist")).toBe("tandvard");
    expect(segmentFromPlacesCategory("plumber")).toBe("vvs_el");
    expect(segmentFromPlacesCategory("electrician")).toBe("vvs_el");
    expect(segmentFromPlacesCategory("painter")).toBe("maleri_golv");
    expect(segmentFromPlacesCategory("roofing_contractor")).toBe("bygg");
    expect(segmentFromPlacesCategory("general_contractor")).toBe("bygg");
    expect(segmentFromPlacesCategory("hair_care")).toBe("salong");
    expect(segmentFromPlacesCategory("restaurant")).toBe("restaurang");
  });

  // 22 av 55 företag hade "establishment" — Googles innehållslösa toppkategori.
  it("avvisar Googles innehållslösa kategorier", () => {
    for (const c of ["establishment", "point_of_interest", "store", "business"]) {
      expect(segmentFromPlacesCategory(c), c).toBeNull();
    }
  });
});

describe("segmentFromName", () => {
  // Namnen nedan är riktiga företag ur Axonas CRM 2026-09-11.
  it("känner igen tandvård", () => {
    expect(segmentFromName("Stellan Bohlin Tandläkarpraktik")).toBe("tandvard");
    expect(segmentFromName("Storsjötandläkarna")).toBe("tandvard");
    expect(segmentFromName("Tandhygienisterna Östersund")).toBe("tandvard");
  });

  it("känner igen el och VVS före generiskt bygg", () => {
    expect(segmentFromName("Vvs Entreprenad i Jämtland AB")).toBe("vvs_el");
    expect(segmentFromName("Östersunds Elservice AB")).toBe("vvs_el");
    expect(segmentFromName("Elentreprenad Jämtland/Härjedalen AB")).toBe("vvs_el");
    expect(segmentFromName("Grännsjö VVS AB")).toBe("vvs_el");
    expect(segmentFromName("Roddar VVS")).toBe("vvs_el");
  });

  it("känner igen måleri, kakel och golv före generiskt bygg", () => {
    expect(segmentFromName("Isakssons Måleri i Östersund AB")).toBe("maleri_golv");
    expect(segmentFromName("MB Färg & Kakel AB")).toBe("maleri_golv");
    // Namnet börjar på "Bygg" men bolaget sätter kakel.
    expect(segmentFromName("ByggKeramik Experten Norr AB")).toBe("maleri_golv");
  });

  it("känner igen bygg och entreprenad", () => {
    expect(segmentFromName("Christoffer Sandgren Bygg & Snickeri AB")).toBe("bygg");
    expect(segmentFromName("Tullus Bygg & Entreprenad")).toBe("bygg");
    expect(segmentFromName("Löfvenius Mark & Teknik AB")).toBe("bygg");
    expect(segmentFromName("Grund & Takteknik i Östersund AB")).toBe("bygg");
    expect(segmentFromName("Storsjö Tak AB")).toBe("bygg");
    expect(segmentFromName("Backmans Bygg & Fastighetsservice AB")).toBe("bygg");
  });

  it("känner igen transport", () => {
    expect(segmentFromName("Zontaxi")).toBe("transport");
    expect(segmentFromName("norrmans åkeri & bygg")).toBe("transport");
    expect(segmentFromName("Lejes taxi")).toBe("transport");
    expect(segmentFromName("Östersund Flytt & Transport AB")).toBe("transport");
  });

  it("känner igen städ och fastighetsservice", () => {
    expect(segmentFromName("Viktoria Roskar's Städservice HB")).toBe("fastighet");
  });

  // "el" som delsträng finns i hotell, handel, modell, Michelin …
  it("tar INTE el ur ord som bara råkar innehålla bokstäverna", () => {
    expect(segmentFromName("Hotell Storsjön")).not.toBe("vvs_el");
    expect(segmentFromName("Jämtlands Handel AB")).not.toBe("vvs_el");
    expect(segmentFromName("Modellbygge i Krokom")).not.toBe("vvs_el");
  });

  // Namn där bygg-ordet sitter hopskrivet eller i ett efterled.
  it("hittar bygg även i hopskrivna namn", () => {
    expect(segmentFromName("Tolabygg AB")).toBe("bygg");
    expect(segmentFromName("ByggCenter Jämtland AB")).toBe("bygg");
    expect(segmentFromName("DPO Byggtjänster AB")).toBe("bygg");
  });

  it("känner igen mur, fasad, grävning, borrning och skorsten", () => {
    expect(segmentFromName("Z - Mur & Fasad")).toBe("bygg");
    expect(segmentFromName("Leif Grävare AB")).toBe("bygg");
    expect(segmentFromName("Borrtjänst Mälardalen AB")).toBe("bygg");
    expect(segmentFromName("Skorstensfolket Östersund AB")).toBe("bygg");
    expect(segmentFromName("Pappa Snickrar AB")).toBe("bygg");
  });

  it("känner igen tandvård skriven på engelska", () => {
    expect(segmentFromName("Dentist Katja Edling AB")).toBe("tandvard");
    expect(segmentFromName("National Dental Campus")).toBe("tandvard");
  });

  it("returnerar null när namnet inte säger något", () => {
    expect(segmentFromName("Heimjord AB")).toBeNull();
    expect(segmentFromName("D ANDERSSON AB")).toBeNull();
    expect(segmentFromName("Kuntab")).toBeNull();
    expect(segmentFromName("")).toBeNull();
  });
});

describe("classifyCompany", () => {
  it("SNI slår både kategori och namn — den är officiell", () => {
    const r = classifyCompany({
      name: "Storsjö Tak AB",
      industry: "dentist",
      sniCode: "43.22",
    });
    expect(r.segment).toBe("vvs_el");
    expect(r.source).toBe("sni");
    expect(r.confidence).toBe("high");
  });

  it("Places-kategori används när SNI saknas", () => {
    const r = classifyCompany({ name: "Heimjord AB", industry: "dentist" });
    expect(r.segment).toBe("tandvard");
    expect(r.source).toBe("places");
    expect(r.confidence).toBe("medium");
  });

  it("namnet används sist och märks som lägre tillit", () => {
    const r = classifyCompany({ name: "Storsjö Tak AB", industry: "establishment" });
    expect(r.segment).toBe("bygg");
    expect(r.source).toBe("name");
    expect(r.confidence).toBe("low");
  });

  it("okänt företag blir ovrigt, inte en gissning", () => {
    const r = classifyCompany({ name: "Kuntab", industry: "establishment" });
    expect(r.segment).toBe("ovrigt");
    expect(r.source).toBe("none");
    expect(r.confidence).toBe("none");
  });

  it("klarar att allt saknas", () => {
    expect(classifyCompany({}).segment).toBe("ovrigt");
  });

  it("alla segment som klassificeraren kan ge finns i ALL_SEGMENTS", () => {
    const produced: IndustrySegment[] = [
      classifyCompany({ sniCode: "86.23" }).segment,
      classifyCompany({ sniCode: "43.21" }).segment,
      classifyCompany({ sniCode: "43.34" }).segment,
      classifyCompany({ sniCode: "41.20" }).segment,
      classifyCompany({ sniCode: "49.32" }).segment,
      classifyCompany({ sniCode: "96.02" }).segment,
      classifyCompany({ sniCode: "56.10" }).segment,
      classifyCompany({ sniCode: "81.21" }).segment,
      classifyCompany({}).segment,
    ];
    for (const s of produced) expect(ALL_SEGMENTS).toContain(s);
  });
});

describe("allabolagCategoryFromUrl", () => {
  it("plockar branschen ur en riktig allabolag-länk", () => {
    expect(
      allabolagCategoryFromUrl(
        "https://www.allabolag.se/foretag/%C3%B6stersunds-kakelservice-ab/%C3%B6stersund/byggm%C3%A4stare/2K2T4IXI5YDDT",
      ),
    ).toBe("byggm%C3%A4stare");
  });

  it("klarar rapporter-varianten av länken", () => {
    expect(
      allabolagCategoryFromUrl(
        "https://www.allabolag.se/rapporter/bingsta/-/s%C3%A5gverk/3N2XOTLI5YHTM",
      ),
    ).toBe("s%C3%A5gverk");
  });

  it("returnerar null när branschen är tom", () => {
    expect(
      allabolagCategoryFromUrl(
        "https://www.allabolag.se/foretag/dahls-auto/%C3%B6stersund/-/7VJQ7FQVLI0000",
      ),
    ).toBeNull();
  });

  it("returnerar null på annat än allabolag", () => {
    expect(allabolagCategoryFromUrl("https://hitta.se/x/y/z/w")).toBeNull();
    expect(allabolagCategoryFromUrl(null)).toBeNull();
    expect(allabolagCategoryFromUrl("inte en url")).toBeNull();
  });
});

describe("segmentFromAllabolagCategory", () => {
  it("klarar både procentkodning och svenska tecken", () => {
    expect(segmentFromAllabolagCategory("byggm%C3%A4stare")).toBe("bygg");
    expect(segmentFromAllabolagCategory("byggmästare")).toBe("bygg");
  });

  it("mappar de vanligaste posterna i CRM:et", () => {
    expect(segmentFromAllabolagCategory("entrepren%C3%B6rer")).toBe("bygg");
    expect(segmentFromAllabolagCategory("transportf%C3%B6rmedling")).toBe("transport");
    expect(segmentFromAllabolagCategory("st%C3%A4dservice")).toBe("fastighet");
    expect(segmentFromAllabolagCategory("passagerartransporter")).toBe("transport");
    expect(segmentFromAllabolagCategory("restauranger")).toBe("restaurang");
  });

  it("returnerar null för branscher vi inte säljer mot", () => {
    expect(segmentFromAllabolagCategory("jordbruk")).toBeNull();
    expect(segmentFromAllabolagCategory("s%C3%A5gverk")).toBeNull();
    expect(segmentFromAllabolagCategory("skogstj%C3%A4nster")).toBeNull();
  });
});

describe("classifyCompany med allabolag", () => {
  const kakel =
    "https://www.allabolag.se/foretag/%C3%B6stersunds-kakelservice-ab/%C3%B6stersund/byggm%C3%A4stare/2K2T4IXI5YDDT";

  it("allabolag slår Places-kategori och namn", () => {
    const r = classifyCompany({
      name: "Okänt Bolag AB",
      industry: "establishment",
      allabolagUrl: kakel,
    });
    expect(r.segment).toBe("bygg");
    expect(r.source).toBe("allabolag");
  });

  it("SNI slår fortfarande allabolag", () => {
    const r = classifyCompany({ sniCode: "86.23", allabolagUrl: kakel });
    expect(r.segment).toBe("tandvard");
    expect(r.source).toBe("sni");
  });

  // "byggmästare" är en samlingspost — namnet preciserar inom samma familj.
  it("namnet preciserar byggmästare till kakel respektive VVS", () => {
    expect(
      classifyCompany({ name: "Östersunds Kakelservice AB", allabolagUrl: kakel })
        .segment,
    ).toBe("maleri_golv");
    expect(
      classifyCompany({ name: "Grännsjö VVS AB", allabolagUrl: kakel }).segment,
    ).toBe("vvs_el");
  });

  it("men preciserar INTE bort en bransch i en annan familj", () => {
    const r = classifyCompany({
      name: "Walltins Åkeri AB",
      allabolagUrl: kakel,
    });
    expect(r.segment).toBe("bygg");
    expect(r.source).toBe("allabolag");
  });
});
