// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Hoist all mocks so they exist before the module under test imports anything ──

const mockFrom = vi.hoisted(() => vi.fn());
const mockServe = vi.hoisted(() => vi.fn());
const mockEnvGet = vi.hoisted(() => vi.fn());
const mockFetch = vi.hoisted(() => vi.fn());

// Shim Deno globals before any import of the production module
vi.stubGlobal("Deno", {
  serve: mockServe,
  env: { get: mockEnvGet },
});

// Mock JSR imports that authentication.ts pulls in at import time
vi.mock("jsr:@panva/jose@6", () => ({
  createRemoteJWKSet: () => vi.fn(),
  jwtVerify: vi.fn(),
}));

vi.mock("jsr:@supabase/supabase-js@2", () => ({}));

// Stub the edge-runtime type declaration module
vi.mock("jsr:@supabase/functions-js/edge-runtime.d.ts", () => ({}));

// Bypass auth middleware — pass through to the inner handler
vi.mock("../_shared/authentication.ts", () => ({
  AuthMiddleware: (_req: Request, next: (req: Request) => Promise<Response>) =>
    next(_req),
  UserMiddleware: (
    _req: Request,
    next: (req: Request, user: unknown) => Promise<Response>,
  ) => next(_req, { id: "user-1", email: "test@example.com" }),
}));

vi.mock("../_shared/supabaseAdmin.ts", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      }),
    },
  },
}));

// ── Helper: build a chainable Supabase mock that resolves specific tables ──

type MockData = Record<
  string,
  { data: unknown; error: unknown; single?: boolean }
>;

function setupMockFrom(tableResponses: MockData) {
  mockFrom.mockImplementation((table: string) => {
    const response = tableResponses[table] || { data: null, error: null };

    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      match: () => chain,
      not: () => chain,
      order: () => chain,
      limit: () => chain,
      insert: () => ({
        select: () => ({ single: () => Promise.resolve(response) }),
      }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      single: () => Promise.resolve(response),
    };
    return chain;
  });
}

// ── Import module under test (Deno.serve callback gets captured) ──

let handler: (req: Request) => Promise<Response>;

beforeEach(async () => {
  vi.clearAllMocks();
  mockEnvGet.mockImplementation((key: string) => {
    const envs: Record<string, string> = {
      ANTHROPIC_API_KEY: "test-api-key",
      ALLOWED_ORIGIN: "*",
      SUPABASE_URL: "http://localhost:54321",
      SB_JWT_ISSUER: "http://localhost:54321/auth/v1",
    };
    return envs[key] || "";
  });

  // Re-import to capture Deno.serve callback
  vi.resetModules();

  // Re-apply mocks after resetModules
  vi.doMock("../_shared/supabaseAdmin.ts", () => ({
    supabaseAdmin: {
      from: (...args: unknown[]) => mockFrom(...args),
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

function makePostRequest(body: unknown, token = "valid-jwt-token") {
  return new Request("http://localhost/generate_quote_text", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

describe("generate_quote_text", () => {
  it("captures handler from Deno.serve", () => {
    expect(handler).toBeDefined();
    expect(typeof handler).toBe("function");
  });

  it("returns 400 when quote_id is missing", async () => {
    const res = await handler(makePostRequest({}));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.message).toContain("Missing quote_id");
  });

  it("returns 404 when quote is not found", async () => {
    setupMockFrom({
      quotes: { data: null, error: { message: "not found" }, single: true },
    });

    const res = await handler(makePostRequest({ quote_id: 999 }));
    const json = await res.json();
    expect(res.status).toBe(404);
    expect(json.message).toContain("Quote not found");
  });

  it("returns 500 when ANTHROPIC_API_KEY is not configured", async () => {
    mockEnvGet.mockImplementation((key: string) => {
      if (key === "ANTHROPIC_API_KEY") return "";
      if (key === "ALLOWED_ORIGIN") return "*";
      if (key === "SUPABASE_URL") return "http://localhost:54321";
      if (key === "SB_JWT_ISSUER") return "http://localhost:54321/auth/v1";
      return "";
    });

    setupMockFrom({
      quotes: {
        data: {
          id: 1,
          company_id: 1,
          contact_id: null,
          title: "Test",
          currency: "SEK",
        },
        error: null,
      },
      companies: { data: { id: 1, name: "Acme" }, error: null },
      quote_line_items: { data: [], error: null },
      meeting_transcriptions: { data: [], error: null },
      configuration: { data: { config: {} }, error: null },
    });

    const res = await handler(makePostRequest({ quote_id: 1 }));
    const json = await res.json();
    expect(res.status).toBe(500);
    expect(json.message).toContain("ANTHROPIC_API_KEY");
  });

  it("returns 502 when Claude API returns error", async () => {
    setupMockFrom({
      quotes: {
        data: {
          id: 1,
          company_id: 1,
          contact_id: null,
          title: "Test",
          currency: "SEK",
        },
        error: null,
      },
      companies: { data: { id: 1, name: "Acme" }, error: null },
      contacts: { data: null, error: null },
      quote_line_items: { data: [], error: null },
      meeting_transcriptions: { data: [], error: null },
      configuration: { data: { config: {} }, error: null },
    });

    mockFetch.mockResolvedValueOnce({
      ok: false,
      text: () => Promise.resolve("Rate limited"),
    });
    vi.stubGlobal("fetch", mockFetch);

    const res = await handler(makePostRequest({ quote_id: 1 }));
    const json = await res.json();
    expect(res.status).toBe(502);
    expect(json.message).toContain("Failed to generate text from AI");
  });

  it("returns 200 with structured sections on successful flow", async () => {
    const sections = {
      summary_pitch: "Test pitch",
      highlight_cards: [],
      problem_cards: [],
      design_demo_description: null,
      package_includes: [],
      proposal_body: "Full proposal text here",
    };

    setupMockFrom({
      quotes: {
        data: {
          id: 1,
          company_id: 1,
          contact_id: null,
          title: "Hemsida",
          currency: "SEK",
        },
        error: null,
      },
      companies: { data: { id: 1, name: "Acme" }, error: null },
      contacts: { data: null, error: null },
      quote_line_items: { data: [], error: null },
      meeting_transcriptions: { data: [], error: null },
      configuration: { data: { config: {} }, error: null },
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [{ text: JSON.stringify(sections) }],
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const res = await handler(makePostRequest({ quote_id: 1 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sections).toBeDefined();
    expect(json.sections.summary_pitch).toBe("Test pitch");
    expect(json.text).toBe("Full proposal text here");
  });

  it("falls back to plain text when JSON parsing fails", async () => {
    setupMockFrom({
      quotes: {
        data: {
          id: 1,
          company_id: 1,
          contact_id: null,
          title: "Test",
          currency: "SEK",
        },
        error: null,
      },
      companies: { data: { id: 1, name: "Acme" }, error: null },
      contacts: { data: null, error: null },
      quote_line_items: { data: [], error: null },
      meeting_transcriptions: { data: [], error: null },
      configuration: { data: { config: {} }, error: null },
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [{ text: "This is plain text without JSON structure." }],
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const res = await handler(makePostRequest({ quote_id: 1 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sections).toBeNull();
    expect(json.text).toBe("This is plain text without JSON structure.");
  });

  it("returns 500 when database update fails", async () => {
    setupMockFrom({
      quotes: {
        data: {
          id: 1,
          company_id: 1,
          contact_id: null,
          title: "Test",
          currency: "SEK",
        },
        error: null,
      },
      companies: { data: { id: 1, name: "Acme" }, error: null },
      contacts: { data: null, error: null },
      quote_line_items: { data: [], error: null },
      meeting_transcriptions: { data: [], error: null },
      configuration: { data: { config: {} }, error: null },
    });

    // Override update to return error
    mockFrom.mockImplementation((table: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        match: () => chain,
        not: () => chain,
        order: () => chain,
        limit: () => chain,
        single: () => {
          if (table === "quotes") {
            return Promise.resolve({
              data: {
                id: 1,
                company_id: 1,
                contact_id: null,
                title: "Test",
                currency: "SEK",
              },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        },
        update: () => ({
          eq: () => Promise.resolve({ error: { message: "DB write failed" } }),
        }),
      };
      return chain;
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [{ text: "Plain text response" }],
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const res = await handler(makePostRequest({ quote_id: 1 }));
    const json = await res.json();
    expect(res.status).toBe(500);
    expect(json.message).toContain("Failed to save generated text");
  });
});
