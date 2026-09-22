import { describe, expect, it } from "vitest";

import { DESKTOP_TOURS } from "./tours.desktop";
import { MOBILE_TOURS } from "./tours.mobile";

/**
 * That every `data-tour` anchor a tour targets still exists in the app is
 * checked by `scripts/check-tour-anchors.mjs` — it reads the sources directly,
 * which is far cheaper than pulling every component into the browser runner.
 *
 * What is checked here is the shape of the tour definitions themselves.
 */
describe("tour definitions", () => {
  it("gives every launcher tour a group so none falls outside a section", () => {
    const ungrouped = DESKTOP_TOURS.filter(
      (tour) => !tour.contextual && !tour.group,
    );
    expect(ungrouped.map((tour) => tour.id)).toEqual([]);
  });

  it("keeps tours of the same group together, since the launcher groups by run", () => {
    const groups = DESKTOP_TOURS.filter((tour) => !tour.contextual).map(
      (tour) => tour.group,
    );
    const runs = groups.filter((group, i) => group !== groups[i - 1]);
    expect(runs).toEqual([...new Set(runs)]);
  });

  it("keeps ids unique within each layout", () => {
    for (const tours of [DESKTOP_TOURS, MOBILE_TOURS]) {
      const ids = tours.map((tour) => tour.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("gives every step something to say", () => {
    for (const tour of [...DESKTOP_TOURS, ...MOBILE_TOURS]) {
      for (const step of tour.steps) {
        expect(step.popover?.title, tour.id).toBeTruthy();
        expect(step.popover?.description, tour.id).toBeTruthy();
      }
    }
  });

  it("starts every routed tour on an element, so startTour can wait for it", () => {
    const routed = [...DESKTOP_TOURS, ...MOBILE_TOURS].filter(
      (tour) => tour.route,
    );
    const blind = routed.filter(
      (tour) => typeof tour.steps[0]?.element !== "string",
    );
    expect(blind.map((tour) => tour.id)).toEqual([]);
  });
});
