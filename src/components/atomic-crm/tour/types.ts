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
  /** Route to navigate to before the tour starts. Omit to stay put. */
  route?: string;
  steps: DriveStep[];
};
