import { afterEach, describe, expect, it } from "vitest";

import { waitForElement } from "./waitForElement";

describe("waitForElement", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("resolves immediately when the element already exists", async () => {
    const el = document.createElement("div");
    el.setAttribute("data-tour", "already-here");
    document.body.appendChild(el);

    const found = await waitForElement('[data-tour="already-here"]');
    expect(found).toBe(el);
  });

  it("resolves once a matching element is added later", async () => {
    const promise = waitForElement('[data-tour="added-later"]', 2000);

    // Add the element on the next tick.
    setTimeout(() => {
      const el = document.createElement("div");
      el.setAttribute("data-tour", "added-later");
      document.body.appendChild(el);
    }, 20);

    const found = await promise;
    expect(found).not.toBeNull();
    expect((found as Element).getAttribute("data-tour")).toBe("added-later");
  });

  it("resolves to null after the timeout when nothing matches", async () => {
    const found = await waitForElement('[data-tour="never"]', 50);
    expect(found).toBeNull();
  });
});
