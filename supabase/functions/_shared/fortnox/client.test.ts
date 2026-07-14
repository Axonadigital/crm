import { describe, expect, it, vi } from "vitest";
import { backoffDelayMs, buildFortnoxUrl, FortnoxClient } from "./client.ts";
import { FortnoxError, parseFortnoxError } from "./errors.ts";
import { SlidingWindowRateLimiter } from "./rateLimit.ts";

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}

/** A client whose sleeps are instant and whose rate limiter never blocks. */
function makeClient(
  fetchImpl: typeof fetch,
  overrides: Partial<{
    getAccessToken: (options?: { forceRefresh?: boolean }) => Promise<string>;
    maxAttempts: number;
  }> = {},
) {
  const sleeps: number[] = [];
  const client = new FortnoxClient({
    getAccessToken:
      overrides.getAccessToken ?? (() => Promise.resolve("token-1")),
    fetchImpl,
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    random: () => 0.5,
    rateLimiter: new SlidingWindowRateLimiter({
      limit: 1000,
      windowMs: 1,
      sleep: () => Promise.resolve(),
    }),
    maxAttempts: overrides.maxAttempts ?? 4,
  });
  return { client, sleeps };
}

describe("buildFortnoxUrl", () => {
  it("builds an absolute url and drops empty query values", () => {
    const url = buildFortnoxUrl("/3/invoices", {
      filter: "unpaid",
      limit: 100,
      page: undefined,
      lastmodified: "",
    });

    expect(url).toBe(
      "https://api.fortnox.se/3/invoices?filter=unpaid&limit=100",
    );
  });
});

describe("parseFortnoxError", () => {
  it("reads Fortnox's ErrorInformation envelope regardless of key casing", () => {
    expect(
      parseFortnoxError(
        JSON.stringify({
          ErrorInformation: { Message: "Kunden saknas", Code: 2000587 },
        }),
      ),
    ).toEqual({ message: "Kunden saknas", code: 2000587 });

    expect(
      parseFortnoxError(
        JSON.stringify({
          errorInformation: { message: "Ogiltigt fält", code: 2001304 },
        }),
      ),
    ).toEqual({ message: "Ogiltigt fält", code: 2001304 });
  });

  it("falls back to the raw body when it is not JSON", () => {
    expect(parseFortnoxError("<html>502</html>")).toEqual({
      message: "<html>502</html>",
      code: undefined,
    });
  });
});

describe("backoffDelayMs", () => {
  it("grows exponentially and stays capped", () => {
    const random = () => 1;
    expect(backoffDelayMs(0, { random })).toBe(500);
    expect(backoffDelayMs(1, { random })).toBe(1000);
    expect(backoffDelayMs(2, { random })).toBe(2000);
    expect(backoffDelayMs(10, { random })).toBe(8000);
  });

  it("honours Retry-After over its own schedule", () => {
    expect(backoffDelayMs(0, { retryAfterSeconds: 3, random: () => 1 })).toBe(
      3000,
    );
  });
});

describe("FortnoxClient.request", () => {
  it("returns parsed json on success", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ CompanyInformation: { CompanyName: "Axona Digital AB" } }),
    ) as unknown as typeof fetch;

    const { client } = makeClient(fetchImpl);
    const result = await client.get<{
      CompanyInformation: { CompanyName: string };
    }>("/3/companyinformation");

    expect(result.CompanyInformation.CompanyName).toBe("Axona Digital AB");
  });

  it("retries a 429 and succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(
        jsonResponse({ Invoices: [] }),
      ) as unknown as typeof fetch;

    const { client, sleeps } = makeClient(fetchImpl);
    await expect(client.get("/3/invoices")).resolves.toEqual({ Invoices: [] });
    expect(sleeps).toHaveLength(1);
  });

  it("waits the Retry-After interval when Fortnox sends one", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("rate limited", {
          status: 429,
          headers: { "Retry-After": "2" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ ok: true }),
      ) as unknown as typeof fetch;

    const { client, sleeps } = makeClient(fetchImpl);
    await client.get("/3/invoices");

    expect(sleeps).toEqual([2000]);
  });

  it("does not retry a 400 — a bad payload will never succeed", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        {
          ErrorInformation: { Message: "CustomerNumber saknas", Code: 2000428 },
        },
        400,
      ),
    ) as unknown as typeof fetch;

    const { client, sleeps } = makeClient(fetchImpl);

    await expect(client.post("/3/invoices", {})).rejects.toMatchObject({
      status: 400,
      code: 2000428,
      message: "CustomerNumber saknas",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
  });

  it("refreshes the token once on 401 and retries", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("expired", { status: 401 }))
      .mockResolvedValueOnce(
        jsonResponse({ ok: true }),
      ) as unknown as typeof fetch;

    const getAccessToken = vi
      .fn<[{ forceRefresh?: boolean }?], Promise<string>>()
      .mockResolvedValue("token-2");

    const { client } = makeClient(fetchImpl, { getAccessToken });
    await expect(client.get("/3/invoices")).resolves.toEqual({ ok: true });

    expect(getAccessToken).toHaveBeenCalledWith({ forceRefresh: true });
  });

  it("still uses the refreshed token when the 401 lands on the last attempt", async () => {
    // Regression: the refresh retry used to consume the last attempt, so the
    // loop exited without ever calling Fortnox with the new token.
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("boom", { status: 500 }))
      .mockResolvedValueOnce(new Response("expired", { status: 401 }))
      .mockResolvedValueOnce(
        jsonResponse({ ok: true }),
      ) as unknown as typeof fetch;

    const { client } = makeClient(fetchImpl, { maxAttempts: 2 });

    await expect(client.get("/3/invoices")).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("surfaces a second 401 instead of retrying forever", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("expired", { status: 401 }),
    ) as unknown as typeof fetch;

    const { client } = makeClient(fetchImpl);

    await expect(client.get("/3/invoices")).rejects.toMatchObject({
      status: 401,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("gives up after maxAttempts on persistent 500s", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("boom", { status: 500 }),
    ) as unknown as typeof fetch;

    const { client } = makeClient(fetchImpl, { maxAttempts: 3 });

    await expect(client.get("/3/invoices")).rejects.toBeInstanceOf(
      FortnoxError,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("sends NO Accept header when fetching a PDF", async () => {
    // Fortnox answers 400 "Invalid response type" (code 1000030) to any Accept
    // header on its PDF endpoints — including Accept: application/pdf. Verified
    // against the live tenant. Reintroducing the header breaks every offer and
    // invoice PDF, so pin it.
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    const fetchImpl = vi.fn(
      async () => new Response(pdf, { status: 200 }),
    ) as unknown as typeof fetch;

    const { client } = makeClient(fetchImpl);
    const result = await client.getPdf("/3/offers/231/preview");

    expect(result).toBeInstanceOf(Uint8Array);
    expect(Array.from(result)).toEqual([0x25, 0x50, 0x44, 0x46]);

    const headers = (vi.mocked(fetchImpl).mock.calls[0][1] as RequestInit)
      .headers as Record<string, string>;
    expect(headers.Accept).toBeUndefined();
    expect(headers.Authorization).toBe("Bearer token-1");
  });

  it("still sends Accept: application/json for normal calls", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ ok: true }),
    ) as unknown as typeof fetch;

    const { client } = makeClient(fetchImpl);
    await client.get("/3/offers");

    const headers = (vi.mocked(fetchImpl).mock.calls[0][1] as RequestInit)
      .headers as Record<string, string>;
    expect(headers.Accept).toBe("application/json");
  });

  it("retries network failures", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("connection reset"))
      .mockResolvedValueOnce(
        jsonResponse({ ok: true }),
      ) as unknown as typeof fetch;

    const { client } = makeClient(fetchImpl);
    await expect(client.get("/3/invoices")).resolves.toEqual({ ok: true });
  });
});
