import type { Popover } from "driver.js";

import { waitForElement } from "./waitForElement";

/**
 * Makes a step's "Nästa" button reveal something on the page before advancing.
 * Used where the interesting part of a view is collapsed by default — the tour
 * should demonstrate the feature, not just describe it.
 *
 * The click is skipped when the target content is already visible, so the tour
 * never collapses a row the user opened themselves before starting it.
 *
 * driver.js hands over the transition when `onNextClick` is set, so `moveNext()`
 * is called explicitly. It runs even when the content never appears, in which
 * case `skipMissingElement` quietly drops the next step rather than leaving the
 * tour stuck on a button that does nothing.
 */
export function clickThenAdvance(
  toggleSelector: string,
  revealsSelector: string,
): NonNullable<Popover["onNextClick"]> {
  return (_element, _step, { driver }) => {
    const alreadyOpen = document.querySelector(revealsSelector);
    const toggle = document.querySelector<HTMLElement>(toggleSelector);
    if (alreadyOpen || !toggle) {
      driver.moveNext();
      return;
    }
    toggle.click();
    void waitForElement(revealsSelector, 2000).then(() => driver.moveNext());
  };
}
