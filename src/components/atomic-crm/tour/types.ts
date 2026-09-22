import type { DriveStep } from "driver.js";

/**
 * A named, self-contained tour. Every step in a tour targets elements on a
 * single page, so `startTour` can navigate to `route` once, wait for the first
 * element, and then drive all steps without mid-tour navigation.
 */
export type TourDefinition = {
  /** Stable id used by launchers and the "seen" flag. */
  id: string;
  /** Label shown in the launcher menu. */
  label: string;
  /** Short one-liner shown under the label in the launcher. */
  hint?: string;
  /** Section heading in the launcher. Tours without one are listed first. */
  group?: string;
  /**
   * Hidden from the launcher menu. A contextual tour needs a record on screen
   * (e.g. the buttons on a won deal), so it is started from a TourHelpButton
   * placed next to the feature rather than from the global menu.
   */
  contextual?: boolean;
  /** Route to navigate to before the tour starts. Omit to stay put. */
  route?: string;
  steps: DriveStep[];
};
