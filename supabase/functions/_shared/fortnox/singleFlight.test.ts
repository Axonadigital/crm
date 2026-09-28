import { describe, expect, it, vi } from "vitest";
import { createSingleFlight } from "./singleFlight.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createSingleFlight", () => {
  it("runs the task once for concurrent callers and gives them all the result", async () => {
    const gate = deferred<string>();
    const task = vi.fn(() => gate.promise);
    const singleFlight = createSingleFlight<string>();

    const calls = [singleFlight(task), singleFlight(task), singleFlight(task)];
    gate.resolve("token-1");

    // Without this, each concurrent refresh would send the same refresh token
    // to Fortnox and all but the first would get invalid_grant.
    expect(task).toHaveBeenCalledTimes(1);
    await expect(Promise.all(calls)).resolves.toEqual([
      "token-1",
      "token-1",
      "token-1",
    ]);
  });

  it("starts a fresh run once the previous one has settled", async () => {
    const task = vi
      .fn<[], Promise<string>>()
      .mockResolvedValueOnce("token-1")
      .mockResolvedValueOnce("token-2");
    const singleFlight = createSingleFlight<string>();

    await expect(singleFlight(task)).resolves.toBe("token-1");
    await expect(singleFlight(task)).resolves.toBe("token-2");
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failure — the next caller retries", async () => {
    const task = vi
      .fn<[], Promise<string>>()
      .mockRejectedValueOnce(new Error("network blip"))
      .mockResolvedValueOnce("token-1");
    const singleFlight = createSingleFlight<string>();

    await expect(singleFlight(task)).rejects.toThrow("network blip");
    await expect(singleFlight(task)).resolves.toBe("token-1");
  });

  it("propagates the failure to every concurrent caller", async () => {
    const gate = deferred<string>();
    const task = vi.fn(() => gate.promise);
    const singleFlight = createSingleFlight<string>();

    const first = singleFlight(task);
    const second = singleFlight(task);
    gate.reject(new Error("invalid_grant"));

    await expect(first).rejects.toThrow("invalid_grant");
    await expect(second).rejects.toThrow("invalid_grant");
    expect(task).toHaveBeenCalledTimes(1);
  });
});
