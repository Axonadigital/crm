/**
 * HTTP client for the Fortnox REST API (https://api.fortnox.se/3/).
 *
 * Owns the three things every caller would otherwise get wrong:
 *   - rate limiting (25 req / 5 s, 429 with no Retry-After)
 *   - token refresh on 401
 *   - retry with exponential backoff on transient failures
 *
 * All dependencies are injectable so the retry/backoff logic can be unit
 * tested without a Deno runtime or a live Fortnox tenant.
 */

import {
  FortnoxError,
  isRetryableStatus,
  parseFortnoxError,
} from "./errors.ts";
import { FORTNOX_API_BASE_URL } from "./oauth.ts";
import { SlidingWindowRateLimiter } from "./rateLimit.ts";

export type FortnoxQuery = Record<
  string,
  string | number | boolean | undefined | null
>;

export type FortnoxRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: FortnoxQuery;
  body?: unknown;
  /**
   * Extra request headers. Needed by the newer `/api/...` resources, which use
   * `If-Match` for optimistic concurrency and their own JSON Patch media type —
   * neither exists on the older `/3/` endpoints.
   */
  headers?: Record<string, string>;
  /** Overrides Content-Type when a body is sent (e.g. a JSON Patch media type). */
  contentType?: string;
};

/** A response plus the headers callers need, for endpoints that use ETags. */
export type FortnoxResponse<T> = {
  data: T;
  /** Strong ETag of the returned representation, when the endpoint sends one. */
  etag: string | null;
};

export type AccessTokenProvider = (options?: {
  forceRefresh?: boolean;
}) => Promise<string>;

export type FortnoxClientOptions = {
  getAccessToken: AccessTokenProvider;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  rateLimiter?: SlidingWindowRateLimiter;
  maxAttempts?: number;
  baseUrl?: string;
};

const DEFAULT_MAX_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 8_000;

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export function buildFortnoxUrl(
  path: string,
  query?: FortnoxQuery,
  baseUrl: string = FORTNOX_API_BASE_URL,
): string {
  const url = new URL(path.startsWith("/") ? path : `/${path}`, baseUrl);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

/**
 * Exponential backoff with full jitter. Jitter matters here because a backfill
 * loop that hits the rate limit would otherwise retry all its requests in
 * lockstep and hit it again.
 */
export function backoffDelayMs(
  attempt: number,
  options: { retryAfterSeconds?: number; random?: () => number } = {},
): number {
  if (options.retryAfterSeconds && options.retryAfterSeconds > 0) {
    return Math.min(options.retryAfterSeconds * 1000, MAX_BACKOFF_MS);
  }

  const random = options.random ?? Math.random;
  const ceiling = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
  return Math.round(ceiling * (0.5 + random() * 0.5));
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

export class FortnoxClient {
  private readonly getAccessToken: AccessTokenProvider;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly rateLimiter: SlidingWindowRateLimiter;
  private readonly maxAttempts: number;
  private readonly baseUrl: string;

  constructor(options: FortnoxClientOptions) {
    this.getAccessToken = options.getAccessToken;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.random = options.random ?? Math.random;
    this.rateLimiter = options.rateLimiter ?? new SlidingWindowRateLimiter();
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.baseUrl = options.baseUrl ?? FORTNOX_API_BASE_URL;
  }

  async request<T>(
    path: string,
    options: FortnoxRequestOptions = {},
  ): Promise<T> {
    return (await this.requestWithHeaders<T>(path, options)).data;
  }

  async requestWithHeaders<T>(
    path: string,
    options: FortnoxRequestOptions = {},
  ): Promise<FortnoxResponse<T>> {
    const url = buildFortnoxUrl(path, options.query, this.baseUrl);
    const method = options.method ?? "GET";

    let refreshedOnce = false;
    let lastError: FortnoxError | undefined;

    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      await this.rateLimiter.acquire();

      const accessToken = await this.getAccessToken();

      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
            ...(options.body !== undefined
              ? {
                  "Content-Type": options.contentType ?? "application/json",
                }
              : {}),
            ...(options.headers ?? {}),
          },
          ...(options.body !== undefined
            ? { body: JSON.stringify(options.body) }
            : {}),
        });
      } catch (cause) {
        // Network-level failure: transient by definition.
        lastError = new FortnoxError(
          0,
          `Network error calling Fortnox: ${String(cause)}`,
          { retryable: true },
        );
        await this.delayBeforeRetry(attempt);
        continue;
      }

      if (response.ok) {
        const etag = response.headers.get("ETag");
        if (response.status === 204) return { data: undefined as T, etag };
        const text = await response.text();
        if (text.trim().length === 0) return { data: undefined as T, etag };
        return { data: JSON.parse(text) as T, etag };
      }

      const rawBody = await response.text();
      const { message, code } = parseFortnoxError(rawBody);

      // An expired or revoked access token: mint a fresh one and retry once.
      // A second 401 means the grant itself is broken and falls through below.
      if (response.status === 401 && !refreshedOnce) {
        refreshedOnce = true;
        await this.getAccessToken({ forceRefresh: true });
        // The refresh retry must not eat the retry budget, otherwise a 401 on
        // the last attempt would end the loop without ever using the new token.
        attempt--;
        continue;
      }

      const retryable = isRetryableStatus(response.status);
      lastError = new FortnoxError(response.status, message, {
        code,
        retryable,
        body: rawBody.slice(0, 500),
      });

      if (!retryable) throw lastError;

      await this.delayBeforeRetry(attempt, {
        retryAfterSeconds: parseRetryAfter(response.headers.get("Retry-After")),
      });
    }

    throw (
      lastError ??
      new FortnoxError(0, "Fortnox request failed with no response", {
        retryable: true,
      })
    );
  }

  private async delayBeforeRetry(
    attempt: number,
    options: { retryAfterSeconds?: number } = {},
  ): Promise<void> {
    if (attempt >= this.maxAttempts - 1) return;
    await this.sleep(
      backoffDelayMs(attempt, {
        retryAfterSeconds: options.retryAfterSeconds,
        random: this.random,
      }),
    );
  }

  get<T>(path: string, query?: FortnoxQuery): Promise<T> {
    return this.request<T>(path, { method: "GET", query });
  }

  post<T>(path: string, body: unknown, query?: FortnoxQuery): Promise<T> {
    return this.request<T>(path, { method: "POST", body, query });
  }

  put<T>(path: string, body?: unknown, query?: FortnoxQuery): Promise<T> {
    return this.request<T>(path, { method: "PUT", body, query });
  }

  /**
   * JSON Patch against the newer `/api/...` resources. `If-Match` is mandatory
   * there — without it the request is rejected with 428, and a stale ETag with
   * 412 — so the caller must read the current ETag first.
   */
  patch<T>(
    path: string,
    operations: unknown,
    options: { ifMatch: string; contentType?: string },
  ): Promise<T> {
    return this.request<T>(path, {
      method: "PATCH",
      body: operations,
      contentType: options.contentType ?? "application/json-patch+json",
      headers: { "If-Match": options.ifMatch },
    });
  }
}
