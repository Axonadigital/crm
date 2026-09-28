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
    className="mx-auto w-full max-w-screen-xl overflow-x-clip px-4"
    id="main-content"
    style={{
      paddingTop: "calc(var(--crm-mobile-content-top) + 0.5rem)",
      paddingBottom: "var(--crm-mobile-content-bottom)",
      minHeight:
        "calc(100dvh - var(--crm-mobile-content-top) + var(--crm-mobile-safe-top))",
    }}
  >
    {onRefresh ? (
      <PullToRefresh onRefresh={onRefresh}>{children}</PullToRefresh>
    ) : (
      children
    )}
  </main>
);
