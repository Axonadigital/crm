import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSubmissionPayload,
  type ContractInput,
} from "./contractFields.ts";

describe("buildSubmissionPayload", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const baseInput: ContractInput = {
    templateId: 99,
    quote: {
      id: 42,
      quote_number: "Q-2026-042",
      valid_until: "2026-05-10",
      total_amount: 62500,
      subtotal: 50000,
      vat_amount: 12500,
      vat_rate: 25,
      payment_terms: "30 dagar netto",
      delivery_terms: "2-4 veckor",
      terms_and_conditions: "Standardvillkor gäller.",
      currency: "SEK",
    },
    company: { name: "Acme AB", org_number: "556000-0001" },
    contact: { name: "Anna Andersson", email: "anna@acme.se" },
    lineItems: [
      {
        description: "Hemsida",
        quantity: 1,
        unit_price: 50000,
        total: 50000,
      },
    ],
    proposalUrl: "https://example.com/quote/42",
  };

  it("returns correct template_id and send_email: false", () => {
    const payload = buildSubmissionPayload(baseInput);
    expect(payload.template_id).toBe(99);
    expect(payload.send_email).toBe(false);
    expect(payload.order).toBe("preserved");
  });

  it("first submitter is Axona with completed: true", () => {
    const payload = buildSubmissionPayload(baseInput);
    const axona = payload.submitters[0];
    expect(axona.role).toBe("Axona Digital AB");
    expect(axona.email).toBe("info@axonadigital.se");
    expect(axona.name).toBe("Rasmus Jönsson");
    expect(axona.completed).toBe(true);
    expect(axona.send_email).toBe(false);
  });

  it("second submitter has correct contact email and name", () => {
    const payload = buildSubmissionPayload(baseInput);
    const customer = payload.submitters[1];
    expect(customer.role).toBe("First Party");
    expect(customer.email).toBe("anna@acme.se");
    expect(customer.name).toBe("Anna Andersson");
  });

  it("includes all expected field names", () => {
    const payload = buildSubmissionPayload(baseInput);
    const fieldNames = payload.submitters[1].fields.map((f) => f.name);
    expect(fieldNames).toContain("Offertnummer");
    expect(fieldNames).toContain("Datum");
    expect(fieldNames).toContain("Giltig till");
    expect(fieldNames).toContain("Företag");
    expect(fieldNames).toContain("Kontaktperson");
    expect(fieldNames).toContain("Uppdragsbeskrivning");
    expect(fieldNames).toContain("Prislista");
    expect(fieldNames).toContain("Totalt");
    expect(fieldNames).toContain("Betalningsvillkor");
    expect(fieldNames).toContain("Villkor");
    expect(fieldNames).toContain("Offertlänk");
  });

  it("uses quote_number as Offertnummer", () => {
    const payload = buildSubmissionPayload(baseInput);
    const field = payload.submitters[1].fields.find(
      (f) => f.name === "Offertnummer",
    );
    expect(field?.default_value).toBe("Q-2026-042");
  });

  it("falls back to #id when quote_number is missing", () => {
    const input = {
      ...baseInput,
      quote: { ...baseInput.quote, quote_number: undefined },
    };
    const payload = buildSubmissionPayload(input);
    const field = payload.submitters[1].fields.find(
      (f) => f.name === "Offertnummer",
    );
    expect(field?.default_value).toBe("#42");
  });

  it("formats line items with Swedish currency", () => {
    const payload = buildSubmissionPayload(baseInput);
    const field = payload.submitters[1].fields.find(
      (f) => f.name === "Prislista",
    );
    expect(field?.default_value).toContain("Hemsida");
    expect(field?.default_value).toContain("kr");
  });

  it("shows 'Inga rader' when line items are empty", () => {
    const input = { ...baseInput, lineItems: [] };
    const payload = buildSubmissionPayload(input);
    const field = payload.submitters[1].fields.find(
      (f) => f.name === "Prislista",
    );
    expect(field?.default_value).toBe("Inga rader");
  });

  it("builds scope of work with bullet list of descriptions", () => {
    const input = {
      ...baseInput,
      lineItems: [
        {
          description: "Hemsida",
          quantity: 1,
          unit_price: 30000,
          total: 30000,
        },
        { description: "SEO", quantity: 1, unit_price: 10000, total: 10000 },
      ],
    };
    const payload = buildSubmissionPayload(input);
    const field = payload.submitters[1].fields.find(
      (f) => f.name === "Uppdragsbeskrivning",
    );
    expect(field?.default_value).toContain("• Hemsida");
    expect(field?.default_value).toContain("• SEO");
    expect(field?.default_value).toContain("Uppdraget omfattar:");
  });

  it("includes Offertlänk field when proposalUrl is present", () => {
    const payload = buildSubmissionPayload(baseInput);
    const field = payload.submitters[1].fields.find(
      (f) => f.name === "Offertlänk",
    );
    expect(field).toBeDefined();
    expect(field?.default_value).toBe("https://example.com/quote/42");
  });

  it("excludes Offertlänk field when proposalUrl is absent", () => {
    const input = { ...baseInput, proposalUrl: undefined };
    const payload = buildSubmissionPayload(input);
    const field = payload.submitters[1].fields.find(
      (f) => f.name === "Offertlänk",
    );
    expect(field).toBeUndefined();
  });

  it("uses default payment terms when missing", () => {
    const input = {
      ...baseInput,
      quote: { ...baseInput.quote, payment_terms: undefined },
    };
    const payload = buildSubmissionPayload(input);
    const field = payload.submitters[1].fields.find(
      (f) => f.name === "Betalningsvillkor",
    );
    expect(field?.default_value).toBe("30 dagar netto");
  });

  it("uses default terms and conditions when missing", () => {
    const input = {
      ...baseInput,
      quote: { ...baseInput.quote, terms_and_conditions: undefined },
    };
    const payload = buildSubmissionPayload(input);
    const field = payload.submitters[1].fields.find(
      (f) => f.name === "Villkor",
    );
    expect(field?.default_value).toBe("Standardvillkor enligt offert.");
  });

  it("all customer fields are readonly", () => {
    const payload = buildSubmissionPayload(baseInput);
    for (const field of payload.submitters[1].fields) {
      expect(field.readonly).toBe(true);
    }
  });
});
