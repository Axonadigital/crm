import { useStore } from "ra-core";
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";

import {
  OVERVIEW_SEEN_KEY,
  TourContext,
  type TourContextValue,
} from "./TourContext";
import { DESKTOP_TOURS } from "./tours.desktop";
import { MOBILE_TOURS } from "./tours.mobile";
import { useAppTour } from "./useAppTour";

/**
 * Provides the guided tour to the whole authenticated app. Auto-starts the
 * overview tour the first time a user opens the CRM in a given browser, and
 * exposes `startTour` for the launchers.
 *
 * Mount one provider per layout: `variant="desktop"` in Layout, `"mobile"` in
 * MobileLayout — the tour steps differ between the two layouts.
 */
export function TourProvider({
  children,
  variant,
}: {
  children: ReactNode;
  variant: "desktop" | "mobile";
}) {
  const tours = variant === "mobile" ? MOBILE_TOURS : DESKTOP_TOURS;
  const { startTour: run } = useAppTour();
  const [overviewSeen, setOverviewSeen] = useStore<boolean>(
    OVERVIEW_SEEN_KEY,
    false,
  );
  const autoStartedRef = useRef(false);

  const startTour = useCallback(
    (id: string) => {
      const tour = tours.find((t) => t.id === id);
      if (!tour) return;
      run(tour, () => {
        if (tour.id === "overview") {
          setOverviewSeen(true);
        }
      });
    },
    [tours, run, setOverviewSeen],
  );

  // Auto-start the overview once, shortly after mount so the layout is settled.
  useEffect(() => {
    if (overviewSeen || autoStartedRef.current) return;
    autoStartedRef.current = true;
    const timer = window.setTimeout(() => startTour("overview"), 800);
    return () => window.clearTimeout(timer);
  }, [overviewSeen, startTour]);

  const value = useMemo<TourContextValue>(
    () => ({ tours, startTour }),
    [tours, startTour],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}
