import { useStore } from "ra-core";
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useLocation } from "react-router";

import {
  OVERVIEW_SEEN_KEY,
  TourContext,
  WHATS_NEW_SEEN_KEY,
  type TourContextValue,
} from "./TourContext";
import { DESKTOP_TOURS } from "./tours.desktop";
import { MOBILE_TOURS } from "./tours.mobile";
import { useAppTour } from "./useAppTour";

const OVERVIEW_ID = "overview";
const WHATS_NEW_ID = "whats-new-fortnox";

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
  const { pathname } = useLocation();
  const { startTour: run } = useAppTour();
  const [overviewSeen, setOverviewSeen] = useStore<boolean>(
    OVERVIEW_SEEN_KEY,
    false,
  );
  const [whatsNewSeen, setWhatsNewSeen] = useStore<boolean>(
    WHATS_NEW_SEEN_KEY,
    false,
  );
  const autoStartedRef = useRef(false);

  const startTour = useCallback(
    (id: string) => {
      const tour = tours.find((t) => t.id === id);
      if (!tour) return;
      run(tour, () => {
        if (tour.id === OVERVIEW_ID) {
          setOverviewSeen(true);
          // Someone seeing the system for the first time has no "news" — the
          // overview already covers everything the what's-new tour highlights.
          setWhatsNewSeen(true);
        }
        if (tour.id === WHATS_NEW_ID) {
          setWhatsNewSeen(true);
        }
      });
    },
    [tours, run, setOverviewSeen, setWhatsNewSeen],
  );

  // Auto-start once, shortly after mount so the layout is settled. New users
  // get the overview; returning users who already saw it get the what's-new
  // tour instead. Only ever one tour, and only ever once per browser.
  //
  // Both tours navigate, so they only start from the dashboard — following a
  // link straight to a deal should not yank you somewhere else. If the user
  // lands elsewhere the tour simply waits until they come back to the start
  // page, or they run it from the launcher.
  useEffect(() => {
    if (autoStartedRef.current || pathname !== "/") return;
    const next = !overviewSeen
      ? OVERVIEW_ID
      : !whatsNewSeen
        ? WHATS_NEW_ID
        : null;
    if (!next) return;
    autoStartedRef.current = true;
    const timer = window.setTimeout(() => startTour(next), 800);
    return () => window.clearTimeout(timer);
  }, [overviewSeen, whatsNewSeen, pathname, startTour]);

  const value = useMemo<TourContextValue>(
    () => ({ tours, startTour }),
    [tours, startTour],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}
