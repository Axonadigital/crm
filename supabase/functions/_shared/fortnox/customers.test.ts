import { describe, expect, it } from "vitest";
import {
  mapCompanyToFortnoxCustomer,
  mapQuoteLineItems,
  MissingBillingDataError,
} from "./customers.ts";

const company = {
  id: 12,
  name: "Exempelbolaget AB",
  org_number: "559900-1234",
  address: "Exempelgatan 1",
  zipcode: "831 34",
  city: "Östersund",
  email: "info@exempelbolaget.se",
  billing_email: "faktura@exempelbolaget.se",
  website: "https://exempelbolaget.se",
  payment_terms: "30 dagar netto",
};

describe("mapCompanyToFortnoxCustomer", () => {
  it("builds a payable customer and stamps the CRM id for the way back", () => {
    const payload = mapCompanyToFortnoxCustomer(company);

    expect(payload).toMatchObject({
      Name: "Exempelbolaget AB",
      Type: "COMPANY",
      CountryCode: "SE",
      VATType: "SEVAT",
      OrganisationNumber: "5599001234",
      City: "Östersund",
      TermsOfPayment: "30 dagar netto",
      ExternalReference: "crm-company-12",
    });
  });

  it("prefers the billing email over the general one", () => {
    const payload = mapCompanyToFortnoxCustomer(company);
    expect(payload.EmailInvoice).toBe("faktura@exempelbolaget.se");
  });

  it("falls back to the general email when no billing email is set", () => {
    const payload = mapCompanyToFortnoxCustomer({
      ...company,
      billing_email: null,
    });
    expect(payload.EmailInvoice).toBe("info@exempelbolaget.se");
  });

  it("refuses to create a customer the accountant would have to fix by hand", () => {
    expect(() =>
      mapCompanyToFortnoxCustomer({
        ...company,
        org_number: null,
        billing_email: null,
        email: null,
      }),
    ).toThrow(MissingBillingDataError);

    try {
      mapCompanyToFortnoxCustomer({ ...company, org_number: "" });
    } catch (error) {
      expect((error as MissingBillingDataError).fields).toEqual(["org_number"]);
    }
  });

  it("honours a non-default VAT type", () => {
    const payload = mapCompanyToFortnoxCustomer({
      ...company,
      vat_type: "EUREVERSEDVAT",
    });
    expect(payload.VATType).toBe("EUREVERSEDVAT");
  });
});

describe("mapQuoteLineItems", () => {
  it("maps quote rows onto Fortnox invoice rows", () => {
    const rows = mapQuoteLineItems(
      [
        { description: "Hemsida", quantity: 1, unit_price: 45000 },
        { description: "SEO-abonnemang", quantity: 3, unit_price: 4500 },
      ],
      { defaultVatRate: 25 },
    );

    expect(rows).toEqual([
      {
        Description: "Hemsida",
        DeliveredQuantity: "1",
        Price: 45000,
        VAT: 25,
        AccountNumber: 3001,
      },
      {
        Description: "SEO-abonnemang",
        DeliveredQuantity: "3",
        Price: 4500,
        VAT: 25,
        AccountNumber: 3001,
      },
    ]);
  });

  it("lets a row override the quote's VAT rate", () => {
    const rows = mapQuoteLineItems(
      [{ description: "Bok", quantity: 1, unit_price: 200, vat_rate: 6 }],
      { defaultVatRate: 25 },
    );
    expect(rows[0].VAT).toBe(6);
  });

  it("refuses to invoice an empty quote", () => {
    expect(() => mapQuoteLineItems([])).toThrow(
      "Cannot invoice a quote with no line items",
    );
  });
});
