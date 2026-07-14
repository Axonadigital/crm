import { describe, expect, it } from "vitest";
import {
  buildCustomerOrgIndex,
  type CompanyIndex,
  resolveCompanyId,
} from "./linking.ts";

const companies: CompanyIndex = {
  byOrgNumber: new Map([["5599001234", 101]]),
  byCustomerNumber: new Map([["9999", 202]]),
};

// Shaped like the live tenant: customers carry org numbers, invoices do not.
const customerOrgNumbers = buildCustomerOrgIndex([
  { CustomerNumber: "1", OrganisationNumber: "559900-1234" },
  { CustomerNumber: "2", OrganisationNumber: "20010101-0000" }, // a private person
  { CustomerNumber: "3" },
]);

describe("buildCustomerOrgIndex", () => {
  it("indexes companies by their Fortnox customer number", () => {
    expect(customerOrgNumbers.get("1")).toBe("5599001234");
  });

  it("refuses to index a private customer's personal number as an org number", () => {
    // Matching a person to a company would put someone else's invoices on a
    // customer card.
    expect(customerOrgNumbers.has("2")).toBe(false);
    expect(customerOrgNumbers.has("3")).toBe(false);
  });
});

describe("resolveCompanyId", () => {
  it("links an invoice through the Fortnox customer's org number", () => {
    // This is the path that matters: the invoice itself has no org number.
    expect(
      resolveCompanyId(
        { customer_number: "1", organisation_number: null },
        companies,
        customerOrgNumbers,
      ),
    ).toBe(101);
  });

  it("prefers an already-linked company over the lookup chain", () => {
    expect(
      resolveCompanyId(
        { customer_number: "9999", organisation_number: null },
        companies,
        customerOrgNumbers,
      ),
    ).toBe(202);
  });

  it("uses the invoice's own org number when Fortnox does send one", () => {
    expect(
      resolveCompanyId(
        { customer_number: "unknown", organisation_number: "559900-1234" },
        companies,
        customerOrgNumbers,
      ),
    ).toBe(101);
  });

  it("leaves an invoice unlinked rather than guessing", () => {
    expect(
      resolveCompanyId(
        { customer_number: "2", organisation_number: null },
        companies,
        customerOrgNumbers,
      ),
    ).toBeNull();

    expect(
      resolveCompanyId(
        { customer_number: null, organisation_number: null },
        companies,
        customerOrgNumbers,
      ),
    ).toBeNull();
  });
});
