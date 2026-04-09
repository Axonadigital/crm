// @vitest-environment node
import { describe, expect, it } from "vitest";

// Minimal Deno env shim for shared edge-function helpers in Vitest.
globalThis.Deno = {
  env: {
    get: () => undefined,
  },
} as typeof globalThis.Deno;

const {
  HttpError,
  getEnumField,
  getPositiveIntegerField,
  parseOptionalJsonBody,
  parseRequiredJsonBody,
} = await import("./http");

describe("http helpers", () => {
  it("parses a required JSON object body", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ company_id: 12 }),
      headers: { "Content-Type": "application/json" },
    });

    await expect(parseRequiredJsonBody(req)).resolves.toEqual({
      company_id: 12,
    });
  });

  it("returns undefined for an empty optional body", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: "",
    });

    await expect(parseOptionalJsonBody(req)).resolves.toBeUndefined();
  });

  it("throws a structured error for invalid JSON", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: "{invalid",
    });

    await expect(parseRequiredJsonBody(req)).rejects.toMatchObject({
      status: 400,
      code: "invalid_json",
    });
  });

  it("validates positive integer fields", () => {
    expect(getPositiveIntegerField({ profile_id: 5 }, "profile_id")).toBe(5);

    expect(() =>
      getPositiveIntegerField({ profile_id: "5" }, "profile_id", {
        required: true,
      })
    ).toThrow(HttpError);
  });

  it("validates enum fields", () => {
    expect(
      getEnumField({ action: "re_enrich" }, "action", ["re_enrich"] as const),
    ).toBe("re_enrich");

    expect(() =>
      getEnumField({ action: "delete_everything" }, "action", [
        "re_enrich",
      ] as const)
    ).toThrow(HttpError);
  });
});
