import { describe, expect, it } from "vitest";
import { resolveReferenceProjects } from "./premiumQuoteReferences.ts";

describe("resolveReferenceProjects", () => {
  const fallback = [
    {
      title: "Fallback",
      url: "https://example.com/fallback.png",
      link: "https://example.com",
      type: "Webbplats",
      description: "Fallback reference",
    },
  ];

  it("returns explicit quote references when present", () => {
    const custom = [
      {
        title: "Custom",
        url: "https://example.com/custom.png",
        link: "https://custom.example.com",
        type: "Landningssida",
        description: "Custom reference",
      },
    ];

    expect(resolveReferenceProjects(custom, fallback)).toEqual(custom);
  });

  it("falls back to default references when quote references are missing", () => {
    expect(resolveReferenceProjects([], fallback)).toEqual(fallback);
    expect(resolveReferenceProjects(undefined, fallback)).toEqual(fallback);
  });
});
