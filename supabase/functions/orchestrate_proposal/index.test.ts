// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoist all mocks ──

const mockFrom = vi.hoisted(() => vi.fn());
const mockRpc = vi.hoisted(() => vi.fn());
const mockServe = vi.hoisted(() => vi.fn());
const mockEnvGet = vi.hoisted(() => vi.fn());
const mockFetch = vi.hoisted(() => vi.fn());

vi.stubGlobal("Deno", {
  serve: mockServe,
  env: { get: mockEnvGet },
});

vi.mock("jsr:@panva/jose@6", () => ({
  createRemoteJWKSet: () => vi.fn(),
  jwtVerify: vi.fn(),
}));
vi.mock("jsr:@supabase/supabase-js@2", () => ({}));
vi.mock("jsr:@supabase/functions-js/edge-runtime.d.ts", () => ({}));

vi.mock("../_shared/supabaseAdmin.ts", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      }),
    },
  },
}));

// ── Chainable mock builder ──

interface TableConfig {
  selectData?: unknown;
  selectError?: unknown;
  insertData?: unknown;
  insertError?: unknown;
  updateError?: unknown;
}

function setupMockFrom(tables: Record<string, TableConfig>) {
  mockFrom.mockImplementation((table: string) => {
    const cfg = tables[table] || {};
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      match: () => chain,
      not: () => chain,
      order: () => chain,
      limit: () => chain,
      single: () =>
        Promise.resolve({
          data: cfg.selectData ?? null,
          error: cfg.selectError ?? null,
        }),
      insert: () => ({
        select: () => ({
          single: () =>
            Promise.resolve({
              data: cfg.insertData ?? null,
              error: cfg.insertError ?? null,
            }),
        }),
      }),
      update: () => ({
        eq: () => Promise.resolve({ error: cfg.updateError ?? null }),
      }),
    };
    return chain;
  });
}

// ── Import module ──

let handler: (req: Request) => Promise<Response>;

beforeEach(async () => {
  vi.clearAllMocks();
  mockEnvGet.mockImplementation((key: string) => {
    const envs: Record<string, string> = {
      ANTHROPIC_API_KEY: "test-api-key",
      ALLOWED_ORIGIN: "*",
      SUPABASE_URL: "http://localhost:54321",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      SB_JWT_ISSUER: "http://localhost:54321/auth/v1",
      DISCORD_BOT_TOKEN: "",
      DISCORD_CHANNEL_ID: "",
      DISCORD_WEBHOOK_URL: "",
      CRM_PUBLIC_URL: "http://localhost:5173",
    };
    return envs[key] || "";
  });
  mockRpc.mockResolvedValue({ data: "" });

  // Reset fetch to a no-op success by default
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(""),
  });
  vi.stubGlobal("fetch", mockFetch);

  vi.resetModules();
  vi.doMock("../_shared/supabaseAdmin.ts", () => ({
    supabaseAdmin: {
      from: (...args: unknown[]) => mockFrom(...args),
      rpc: (...args: unknown[]) => mockRpc(...args),
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      },
    },
  }));

  await import("./index.ts");
  handler = mockServe.mock.calls[0]?.[0];
});

// Service role JWT (base64-encoded {"role":"service_role"})
const serviceRoleToken = `header.${btoa(JSON.stringify({ role: "service_role" }))}.sig`;

function makePostRequest(body: unknown, token = serviceRoleToken) {
  return new Request("http://localhost/orchestrate_proposal", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

describe("orchestrate_proposal", () => {
  it("captures handler from Deno.serve", () => {
    expect(handler).toBeDefined();
    expect(typeof handler).toBe("function");
  });

  it("returns 401 when authorization token is missing", async () => {
    const req = new Request("http://localhost/orchestrate_proposal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deal_id: 1 }),
    });
    const res = await handler(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when deal_id is missing", async () => {
    const res = await handler(makePostRequest({}));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.message).toContain("deal_id");
  });

  it("returns 404 when deal is not found", async () => {
    setupMockFrom({
      deals: { selectData: null, selectError: { message: "not found" } },
    });

    const res = await handler(makePostRequest({ deal_id: 999 }));
    expect(res.status).toBe(404);
  });

  it("returns 422 when contact has no email", async () => {
    setupMockFrom({
      deals: {
        selectData: {
          id: 1,
          name: "Test Deal",
          company_id: 10,
          contact_ids: [100],
          sales_id: 1,
          amount: 50000,
          companies: { id: 10, name: "Acme", description: "A company" },
        },
      },
      contacts: {
        selectData: {
          id: 100,
          first_name: "Anna",
          last_name: "A",
          email_jsonb: [], // No email
        },
      },
      meeting_transcriptions: { selectData: null },
    });

    const res = await handler(makePostRequest({ deal_id: 1 }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.message).toContain("email");
  });

  it("returns 422 when no meeting analysis and no company description", async () => {
    setupMockFrom({
      deals: {
        selectData: {
          id: 1,
          name: "Test Deal",
          company_id: 10,
          contact_ids: [100],
          sales_id: 1,
          amount: 50000,
          companies: {
            id: 10,
            name: "Acme",
            description: null,
            industry: null,
          },
        },
      },
      contacts: {
        selectData: {
          id: 100,
          first_name: "Anna",
          last_name: "A",
          email_jsonb: [{ email: "anna@acme.se" }],
        },
      },
      meeting_transcriptions: { selectData: null },
    });

    const res = await handler(makePostRequest({ deal_id: 1 }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.message).toContain("meeting analysis");
  });

  it("reverts deal stage to opportunity on validation failure", async () => {
    const updateCalls: Array<{ table: string; data: unknown }> = [];

    mockFrom.mockImplementation((table: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        match: () => chain,
        not: () => chain,
        order: () => chain,
        limit: () => chain,
        single: () => {
          if (table === "deals") {
            return Promise.resolve({
              data: {
                id: 1,
                name: "Test",
                company_id: 10,
                contact_ids: [100],
                companies: {
                  id: 10,
                  name: "Acme",
                  description: null,
                  industry: null,
                },
              },
              error: null,
            });
          }
          if (table === "contacts") {
            return Promise.resolve({
              data: {
                id: 100,
                first_name: "A",
                last_name: "B",
                email_jsonb: [{ email: "a@b.se" }],
              },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        },
        update: (data: unknown) => {
          updateCalls.push({ table, data });
          return { eq: () => Promise.resolve({ error: null }) };
        },
      };
      return chain;
    });

    await handler(makePostRequest({ deal_id: 1 }));
    const dealUpdate = updateCalls.find((c) => c.table === "deals");
    expect(dealUpdate).toBeDefined();
    expect(dealUpdate?.data).toEqual({ stage: "opportunity" });
  });

  it("creates quote and returns success on valid deal", async () => {
    const aiSections = {
      summary_pitch: "Great pitch",
      highlight_cards: [],
      problem_cards: [],
      design_demo_description: null,
      package_includes: [],
      proposal_body: "Proposal text",
    };

    mockFrom.mockImplementation((table: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        match: () => chain,
        not: () => chain,
        order: () => chain,
        limit: () => chain,
        single: () => {
          if (table === "deals") {
            return Promise.resolve({
              data: {
                id: 1,
                name: "Ny hemsida",
                company_id: 10,
                contact_ids: [100],
                sales_id: 1,
                amount: 50000,
                category: "webb-hemsida",
                companies: {
                  id: 10,
                  name: "Acme AB",
                  sector: "Bygg",
                  description: "Byggföretag",
                  industry: "Construction",
                },
              },
              error: null,
            });
          }
          if (table === "contacts") {
            return Promise.resolve({
              data: {
                id: 100,
                first_name: "Anna",
                last_name: "Andersson",
                email_jsonb: [{ email: "anna@acme.se" }],
              },
              error: null,
            });
          }
          if (table === "meeting_transcriptions") {
            return Promise.resolve({ data: null, error: null });
          }
          if (table === "configuration") {
            return Promise.resolve({
              data: { config: { currency: "SEK", sellerCompany: {} } },
              error: null,
            });
          }
          if (table === "quotes") {
            return Promise.resolve({
              data: {
                id: 42,
                approval_token: "abc-123",
                quote_number: "Q-42",
              },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        },
        insert: () => ({
          select: () => ({
            single: () => {
              if (table === "quotes") {
                return Promise.resolve({
                  data: { id: 42 },
                  error: null,
                });
              }
              return Promise.resolve({ data: null, error: null });
            },
          }),
        }),
        update: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      };
      return chain;
    });

    // Claude API response
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("anthropic")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              content: [{ text: JSON.stringify(aiSections) }],
            }),
        });
      }
      // PDF edge function response
      if (typeof url === "string" && url.includes("generate_quote_pdf")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              pdf_url: "https://storage.example.com/q42.html",
            }),
        });
      }
      // Discord (webhook fallback or bot) — ignore
      return Promise.resolve({ ok: true, text: () => Promise.resolve("") });
    });

    const res = await handler(makePostRequest({ deal_id: 1 }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.quote_id).toBe(42);
  });

  it("returns 500 when ANTHROPIC_API_KEY is not configured", async () => {
    mockEnvGet.mockImplementation((key: string) => {
      if (key === "ANTHROPIC_API_KEY") return "";
      if (key === "ALLOWED_ORIGIN") return "*";
      if (key === "SUPABASE_URL") return "http://localhost:54321";
      if (key === "SUPABASE_SERVICE_ROLE_KEY") return "srk";
      return "";
    });

    mockFrom.mockImplementation((table: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        match: () => chain,
        not: () => chain,
        order: () => chain,
        limit: () => chain,
        single: () => {
          if (table === "deals") {
            return Promise.resolve({
              data: {
                id: 1,
                name: "Deal",
                company_id: 10,
                contact_ids: [100],
                amount: 0,
                companies: { id: 10, name: "Acme", description: "Desc" },
              },
              error: null,
            });
          }
          if (table === "contacts") {
            return Promise.resolve({
              data: {
                id: 100,
                first_name: "A",
                last_name: "B",
                email_jsonb: [{ email: "a@b.se" }],
              },
              error: null,
            });
          }
          if (table === "configuration") {
            return Promise.resolve({
              data: { config: {} },
              error: null,
            });
          }
          if (table === "quotes") {
            return Promise.resolve({
              data: { id: 42 },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        },
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: { id: 42 }, error: null }),
          }),
        }),
        update: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      };
      return chain;
    });

    const res = await handler(makePostRequest({ deal_id: 1 }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.message).toContain("ANTHROPIC_API_KEY");
  });

  it("returns 502 when Claude API fails", async () => {
    mockFrom.mockImplementation((table: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        match: () => chain,
        not: () => chain,
        order: () => chain,
        limit: () => chain,
        single: () => {
          if (table === "deals") {
            return Promise.resolve({
              data: {
                id: 1,
                name: "Deal",
                company_id: 10,
                contact_ids: [100],
                amount: 0,
                companies: { id: 10, name: "Acme", description: "Desc" },
              },
              error: null,
            });
          }
          if (table === "contacts") {
            return Promise.resolve({
              data: {
                id: 100,
                first_name: "A",
                last_name: "B",
                email_jsonb: [{ email: "a@b.se" }],
              },
              error: null,
            });
          }
          if (table === "configuration") {
            return Promise.resolve({
              data: { config: {} },
              error: null,
            });
          }
          if (table === "quotes") {
            return Promise.resolve({ data: { id: 42 }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: { id: 42 }, error: null }),
          }),
        }),
        update: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      };
      return chain;
    });

    mockFetch.mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("anthropic")) {
        return Promise.resolve({
          ok: false,
          text: () => Promise.resolve("Rate limited"),
        });
      }
      return Promise.resolve({ ok: true, text: () => Promise.resolve("") });
    });

    const res = await handler(makePostRequest({ deal_id: 1 }));
    expect(res.status).toBe(502);
  });
});
