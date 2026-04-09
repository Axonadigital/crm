import { describe, expect, it } from "vitest";
import {
  buildTermsAndSignatureSection,
  type SellerInfo,
  type SignatureData,
  type TermsData,
} from "./premiumSections.ts";

describe("buildTermsAndSignatureSection", () => {
  const seller: SellerInfo = {
    companyName: "Axona Digital AB",
    orgNumber: "559000-0000",
    vatNumber: "SE559000000001",
    fSkatt: true,
    address: "Storgatan 1",
    zipCity: "111 11 Stockholm",
    phone: "010-123 45 67",
    email: "hej@axonadigital.se",
    website: "https://axonadigital.se",
    bankgiro: "123-4567",
    plusgiro: "",
    iban: "",
    bic: "",
  };

  const terms: TermsData = {
    termsAndConditions: "Betalning inom 30 dagar.",
    customerReference: "Anna Andersson",
  };

  const signature: SignatureData = {
    sellerName: "Axona Digital AB",
    buyerName: "Kundbolaget AB",
    contactName: "Anna Andersson",
  };

  it("renders terms information without manual signature fields", () => {
    const html = buildTermsAndSignatureSection(
      terms,
      signature,
      seller,
      {
        logoDarkUrl: "",
        quoteNumber: "#42",
        quoteDate: "2026-04-09",
      },
      0,
    );

    expect(html).toContain("Det här gäller för offerten");
    expect(html).not.toContain("Namnförtydligande");
    expect(html).not.toContain("För Kundbolaget AB");
    expect(html).not.toContain("För Axona Digital AB");
  });

  it("keeps terms, customer reference and sender details visible", () => {
    const html = buildTermsAndSignatureSection(
      terms,
      signature,
      seller,
      {
        logoDarkUrl: "",
        quoteNumber: "#42",
        quoteDate: "2026-04-09",
      },
      0,
    );

    expect(html).toContain("Betalning inom 30 dagar.");
    expect(html).toContain("Er referens");
    expect(html).toContain("Anna Andersson");
    expect(html).toContain("Kontakt från Axona");
    expect(html).toContain("hej@axonadigital.se");
  });
});
