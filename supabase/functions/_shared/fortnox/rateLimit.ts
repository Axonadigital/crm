/**
 * Fortnox allows 25 requests per 5 seconds per client-id + tenant (300/min).
 * Exceeding it returns HTTP 429 with no Retry-After header, so we throttle
 * proactively instead of reacting to failures.
 *
 * The default limit is deliberately below the documented 25 to leave headroom
 * for retries and for a second edge-function isolate running concurrently —
 * this limiter is per-isolate, not global.
 */

export const FORTNOX_RATE_LIMIT = 20;
export const FORTNOX_RATE_WINDOW_MS = 5_000;

export type RateLimiterOptions = {
  limit?: number;
  windowMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export class SlidingWindowRateLimiter {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private timestamps: number[] = [];

  constructor(options: RateLimiterOptions = {}) {
    this.limit = options.limit ?? FORTNOX_RATE_LIMIT;
    this.windowMs = options.windowMs ?? FORTNOX_RATE_WINDOW_MS;
    this.now = options.now ?? (() => Date.now());
    this.sleep = options.sleep ?? defaultSleep;
  }

  /**
   * Resolves once a slot is free in the current window. The check-and-record
   * below runs synchronously, so concurrent callers cannot both claim the
   * last slot.
   */
  async acquire(): Promise<void> {
    for (;;) {
      const current = this.now();
      const windowStart = current - this.windowMs;
      this.timestamps = this.timestamps.filter((ts) => ts > windowStart);

      if (this.timestamps.length < this.limit) {
        this.timestamps = [...this.timestamps, current];
        return;
      }

      const oldest = this.timestamps[0];
      const waitMs = Math.max(1, oldest + this.windowMs - current);
      await this.sleep(waitMs);
    }
  }
}
