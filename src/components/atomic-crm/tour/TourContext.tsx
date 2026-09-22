import { createContext, useContext } from "react";

import type { TourDefinition } from "./types";

/** Persisted (per browser) under the `CRM.` store prefix. */
export const OVERVIEW_SEEN_KEY = "tour.overview.done";

/**
 * Separate flag for the "what's new" tour so existing users get introduced to
 * the Fortnox billing features without replaying the whole 18-step overview.
 */
export const WHATS_NEW_SEEN_KEY = "tour.whatsnew.fortnox.done";

export type TourContextValue = {
  /** Tours available for the current layout (desktop vs mobile). */
  tours: TourDefinition[];
  /** Start a tour by id. Unknown ids are ignored. */
  startTour: (id: string) => void;
};

export const TourContext = createContext<TourContextValue | null>(null);

/**
 * Access the tour controls. Returns a safe no-op fallback when used outside a
 * provider so launchers never crash if mounted in an unexpected tree.
 */
export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) {
    return { tours: [], startTour: () => {} };
  }
  return ctx;
}
