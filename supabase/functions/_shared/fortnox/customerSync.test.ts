// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

// Minimal Deno env shim for shared edge-function helpers in Vitest.
globalThis.Deno = {
  env: { get: () => undefined },
} as typeof globalThis.Deno;

const { ensureFortnoxCustomer } = await import("./customerSync");

const company = {
  id: 605,
  name: "Löfvenius Mark & Teknik AB",
  org_number: "5593986192",
  address: "Testgatan 1",
  zipcode: "831 34",
  city: "Östersund",
  email: "info@example.se",
  billing_email: "faktura@example.se",
  // The number identifying this company in the PRODUCTION Fortnox company.
  fortnox_customer_number: "88261",
  // deno-lint-ignore no-explicit-any
} as any;

/** Records what was written back to the CRM, if anything. */
function fakeSupabase() {
  const updates: unknown[] = [];
  const supabase = {
    from: () => ({
      update: (values: unknown) => {
        updates.push(values);
        return {
          eq: () => ({
            select: () => ({
              maybeSingle: async () => ({ data: { id: company.id } }),
            }),
          }),
        };
      },
    }),
    // deno-lint-ignore no-explicit-any
  } as any;
  return { supabase, updates };
}

function fakeClient(overrides: Record<string, unknown> = {}) {
  return {
    get: vi.fn(async () => ({ Customers: [] })),
    put: vi.fn(async () => ({})),
    post: vi.fn(async () => ({ Customer: { CustomerNumber: "42" } })),
    ...overrides,
    // deno-lint-ignore no-explicit-any
  } as any;
}

describe("ensureFortnoxCustomer against a sandbox", () => {
  it("ignores the production customer number instead of addressing a stranger", async () => {
    // Reusing 88261 against the test company is what produced "Kan inte hitta
    // kunden": that number belongs to the production database only.
    const client = fakeClient();
    const { supabase } = fakeSupabase();

    const result = await ensureFortnoxCustomer(supabase, client, company, {
      environment: "sandbox",
    });

    expect(client.put).not.toHaveBeenCalledWith(
      "/3/customers/88261",
      expect.anything(),
    );
    expect(result.customer_number).toBe("42");
    expect(result.action).toBe("created");
  });

  it("never writes a sandbox customer number back over the production link", async () => {
    // The dangerous case: persisting a test-company number would repoint a real
    // customer and break invoice matching in production.
    const client = fakeClient();
    const { supabase, updates } = fakeSupabase();

    await ensureFortnoxCustomer(supabase, client, company, {
      environment: "sandbox",
    });

    expect(updates).toEqual([]);
  });

  it("adopts an existing sandbox customer found by organisation number", async () => {
    const client = fakeClient({
      get: vi.fn(async () => ({
        Customers: [{ CustomerNumber: "7", OrganisationNumber: "5593986192" }],
      })),
    });
    const { supabase, updates } = fakeSupabase();

    const result = await ensureFortnoxCustomer(supabase, client, company, {
      environment: "sandbox",
    });

    expect(result).toMatchObject({ customer_number: "7", action: "linked" });
    expect(updates).toEqual([]);
  });
});

describe("ensureFortnoxCustomer against production", () => {
  it("still uses and keeps the stored customer number", async () => {
    const client = fakeClient();
    const { supabase } = fakeSupabase();

    const result = await ensureFortnoxCustomer(supabase, client, company);

    expect(client.put).toHaveBeenCalledWith("/3/customers/88261", {
      Customer: expect.objectContaining({ Name: "Löfvenius Mark & Teknik AB" }),
    });
    expect(result).toMatchObject({
      customer_number: "88261",
      action: "updated",
    });
  });
});
