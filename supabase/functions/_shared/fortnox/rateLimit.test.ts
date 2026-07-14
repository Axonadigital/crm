import { describe, expect, it } from "vitest";
import { SlidingWindowRateLimiter } from "./rateLimit.ts";

/** Deterministic clock: sleeping advances time instead of waiting. */
function fakeClock() {
  let now = 0;
  const sleeps: number[] = [];
  return {
    now: () => now,
    sleep: (ms: number) => {
      sleeps.push(ms);
      now += ms;
      return Promise.resolve();
    },
    advance: (ms: number) => {
      now += ms;
    },
    sleeps,
  };
}

describe("SlidingWindowRateLimiter", () => {
  it("lets requests through up to the limit without sleeping", async () => {
    const clock = fakeClock();
    const limiter = new SlidingWindowRateLimiter({
      limit: 3,
      windowMs: 5000,
      now: clock.now,
      sleep: clock.sleep,
    });

    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();

    expect(clock.sleeps).toEqual([]);
  });

  it("sleeps until the oldest request leaves the window", async () => {
    const clock = fakeClock();
    const limiter = new SlidingWindowRateLimiter({
      limit: 2,
      windowMs: 5000,
      now: clock.now,
      sleep: clock.sleep,
    });

    await limiter.acquire(); // t=0
    clock.advance(1000);
    await limiter.acquire(); // t=1000
    clock.advance(1000);

    // Window is full at t=2000; oldest entry (t=0) expires at t=5000.
    await limiter.acquire();

    expect(clock.sleeps).toEqual([3000]);
    expect(clock.now()).toBe(5000);
  });

  it("does not sleep once the window has scrolled past old requests", async () => {
    const clock = fakeClock();
    const limiter = new SlidingWindowRateLimiter({
      limit: 1,
      windowMs: 5000,
      now: clock.now,
      sleep: clock.sleep,
    });

    await limiter.acquire();
    clock.advance(5001);
    await limiter.acquire();

    expect(clock.sleeps).toEqual([]);
  });

  it("keeps 25 requests inside Fortnox's 5 second window", async () => {
    const clock = fakeClock();
    const limiter = new SlidingWindowRateLimiter({
      limit: 20,
      windowMs: 5000,
      now: clock.now,
      sleep: clock.sleep,
    });

    for (let i = 0; i < 60; i++) {
      await limiter.acquire();
    }

    // 60 requests, 20 per window: the 21st and the 41st each wait out a full
    // window, so the burst spans 10s instead of hammering Fortnox with 60/5s.
    expect(clock.sleeps).toEqual([5000, 5000]);
    expect(clock.now()).toBe(10000);
  });
});
