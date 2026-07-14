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
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: FortnoxQuery;
  body?: unknown;
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
              ? { "Content-Type": "application/json" }
              : {}),
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
        if (response.status === 204) return undefined as T;
        const text = await response.text();
        if (text.trim().length === 0) return undefined as T;
        return JSON.parse(text) as T;
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
}
