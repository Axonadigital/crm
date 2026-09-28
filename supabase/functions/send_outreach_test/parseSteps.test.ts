import { describe, expect, it } from "vitest";
import { parseSteps } from "./parseSteps.ts";

describe("parseSteps", () => {
  it("tar bara https-bilder och kräver text i varje steg", () => {
    const r = parseSteps([{ body: "Hej", image_url: "https://x.se/b.jpg", image_alt: "före/efter" }, { body: "Igen", image_url: "http://osäker.se/b.jpg" }]);
    expect("steps" in r && r.steps.map((s) => s.imageUrl)).toEqual(["https://x.se/b.jpg", null]);
    expect(parseSteps([{ body: "  " }])).toEqual({ error: "varje steg behöver en body" });
    expect(parseSteps([])).toEqual({ error: "steps måste vara en lista med minst ett steg" });
    expect(parseSteps(Array.from({ length: 7 }, () => ({ body: "x" })))).toEqual({ error: "högst 6 steg" });
  });
});
