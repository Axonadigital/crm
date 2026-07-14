import { describe, expect, it } from "vitest";
import {
  buildFortnoxOfferPayload,
  buildRemarks,
  SIGNER_ROLE,
  SIGNING_TAGS,
  toBase64,
} from "./offerSigning.ts";

const quote = {
  id: 42,
  quote_number: "2026-0007",
  deal_id: 7,
  currency: "SEK",
  payment_terms: "30 dagar netto",
  valid_until: "2026-08-31",
  vat_rate: 25,
  terms_and_conditions: "Priserna gäller i 30 dagar.",
};

const lineItems = [
  { description: "Hemsida", quantity: 1, unit_price: 45000 },
  { description: "SEO-abonnemang", quantity: 3, unit_price: 4500 },
];

describe("SIGNING_TAGS", () => {
  it("gives the signature box a real size, not a text line", () => {
    // Without width/height DocuSeal sizes the field to the tag text, which
    // would produce a signature box one line tall.
    expect(SIGNING_TAGS).toContain("type=signature");
    expect(SIGNING_TAGS).toContain("width=220");
    expect(SIGNING_TAGS).toContain("height=60");
  });

  it("addresses every field to the same signer role we submit", () => {
    const roles = [...SIGNING_TAGS.matchAll(/role=([^;}]+)/g)].map((m) => m[1]);
    expect(roles.length).toBeGreaterThan(0);
    expect(new Set(roles)).toEqual(new Set([SIGNER_ROLE]));
  });
});

describe("buildRemarks", () => {
  it("puts the signing tags last, so the box lands at the foot of the offer", () => {
    const remarks = buildRemarks(quote);

    expect(remarks.startsWith("Priserna gäller i 30 dagar.")).toBe(true);
    expect(remarks.endsWith(SIGNING_TAGS)).toBe(true);
  });

  it("still emits the tags when there are no terms to print", () => {
    expect(buildRemarks({ terms_and_conditions: null })).toBe(SIGNING_TAGS);
  });

  it("can leave the tags out — an offer sent without signing", () => {
    expect(buildRemarks(quote, { includeSigningTags: false })).toBe(
      "Priserna gäller i 30 dagar.",
    );
  });
});

describe("buildFortnoxOfferPayload", () => {
  it("carries the quote's rows, terms and validity into Fortnox", () => {
    const { Offer } = buildFortnoxOfferPayload({
      quote,
      customerNumber: "88265",
      lineItems,
    });

    expect(Offer.CustomerNumber).toBe("88265");
    expect(Offer.TermsOfPayment).toBe("30 dagar netto");
    expect(Offer.ExpireDate).toBe("2026-08-31");
    expect(Offer.Language).toBe("SV");
    expect(Offer.OfferRows).toHaveLength(2);
    expect(Offer.OfferRows).toContainEqual({
      Description: "Hemsida",
      DeliveredQuantity: "1",
      Price: 45000,
      VAT: 25,
      AccountNumber: 3011,
    });
  });

  it("stamps the deal id so the offer can be found from the CRM", () => {
    const { Offer } = buildFortnoxOfferPayload({
      quote,
      customerNumber: "88265",
      lineItems,
    });
    expect(Offer.ExternalInvoiceReference2).toBe("crm-deal-7");
  });

  it("prints the signing tags on the offer", () => {
    const { Offer } = buildFortnoxOfferPayload({
      quote,
      customerNumber: "88265",
      lineItems,
    });
    expect(Offer.Remarks).toContain("type=signature");
  });

  it("refuses to create an offer with no rows", () => {
    expect(() =>
      buildFortnoxOfferPayload({
        quote,
        customerNumber: "88265",
        lineItems: [],
      }),
    ).toThrow("Cannot invoice a quote with no line items");
  });
});

describe("toBase64", () => {
  it("encodes a PDF without blowing the stack on a large document", () => {
    expect(toBase64(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBe("JVBERg==");

    // 300 KB: String.fromCharCode(...bytes) in one call would overflow here.
    const large = new Uint8Array(300_000).fill(0x41);
    const encoded = toBase64(large);
    expect(encoded.length).toBeGreaterThan(0);
    expect(atob(encoded).length).toBe(300_000);
  });
});
