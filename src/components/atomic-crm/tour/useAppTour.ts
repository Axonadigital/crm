import { driver, type Config, type Driver } from "driver.js";
import { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router";

import type { TourDefinition } from "./types";
import { waitForElement } from "./waitForElement";

const BASE_CONFIG: Config = {
  showProgress: true,
  allowClose: true,
  smoothScroll: true,
  // If a widget is missing (e.g. an empty state or a not-yet-loaded card),
  // skip that step instead of highlighting nothing.
  skipMissingElement: true,
  overlayOpacity: 0.6,
  stagePadding: 6,
  stageRadius: 8,
  popoverClass: "axona-tour",
  nextBtnText: "Nästa",
  prevBtnText: "Tillbaka",
  doneBtnText: "Klar",
  progressText: "{{current}} av {{total}}",
};

type UseAppTourResult = {
  /** Navigate to the tour's route (if any), wait for the first element, drive. */
  startTour: (tour: TourDefinition, onDone?: () => void) => Promise<void>;
};

/**
 * Wraps a single driver.js instance. Each tour is page-scoped, so we navigate to
 * the tour's route once, wait for its first element to exist, then drive all
 * steps. The instance is destroyed on unmount to avoid dangling overlays.
 */
export function useAppTour(): UseAppTourResult {
  const navigate = useNavigate();
  const driverRef = useRef<Driver | null>(null);

  useEffect(() => {
    return () => {
      driverRef.current?.destroy();
      driverRef.current = null;
    };
  }, []);

  const startTour = useCallback(
    async (tour: TourDefinition, onDone?: () => void) => {
      // Tear down any tour already running.
      driverRef.current?.destroy();

      if (tour.route && window.location.pathname !== tour.route) {
        navigate(tour.route);
      }

      // Wait for the first step's element so the tour never opens on an empty
      // page. Falls back gracefully after the timeout (skipMissingElement).
      const firstSelector = firstStepSelector(tour);
      if (firstSelector) {
        await waitForElement(firstSelector);
      }

      const instance = driver({
        ...BASE_CONFIG,
        steps: tour.steps,
        onDestroyed: () => {
          onDone?.();
          if (driverRef.current === instance) {
            driverRef.current = null;
          }
        },
      });
      driverRef.current = instance;
      instance.drive();
    },
    [navigate],
  );

  return { startTour };
}

/** Returns the CSS selector of the first step, if it is a string selector. */
function firstStepSelector(tour: TourDefinition): string | null {
  const el = tour.steps[0]?.element;
  return typeof el === "string" ? el : null;
}
