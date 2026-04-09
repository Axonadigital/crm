import { type ReactNode } from "react";

import { PullToRefresh } from "./PullToRefresh";

/**
 * Mobile page content wrapper.
 *
 * Provides the standard safe-area padding used under the fixed mobile
 * header and over the bottom navigation. If `onRefresh` is passed, the
 * content area becomes pull-to-refresh: dragging down from scrollTop=0
 * triggers the callback (typically `useRefresh` from ra-core).
 */
export const MobileContent = ({
  children,
  onRefresh,
}: {
  children: ReactNode;
  onRefresh?: () => void | Promise<unknown>;
}) => (
  <main
    className="max-w-screen-xl mx-auto pt-16 px-4 pb-20 min-h-screen overflow-y-auto"
    id="main-content"
  >
    {onRefresh ? (
      <PullToRefresh onRefresh={onRefresh}>{children}</PullToRefresh>
    ) : (
      children
    )}
  </main>
);
