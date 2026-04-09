import { RefreshCw } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

/**
 * Pull-to-refresh wrapper for mobile list/detail screens.
 *
 * Behaviour:
 * - Only engages when the nearest scrollable ancestor is at scrollTop === 0.
 * - Tracks vertical finger movement, applies a 0.5 damping factor so the
 *   indicator trails the finger naturally.
 * - When the user pulls past `threshold` px and releases, calls `onRefresh`.
 * - Shows an animated chevron/spinner at the top while pulling/refreshing.
 *
 * The component renders `children` inside a flex container and overlays the
 * indicator at the top so no layout shift occurs while pulling.
 */
const THRESHOLD = 72;
const MAX_PULL = 140;

export const PullToRefresh = ({
  onRefresh,
  children,
}: {
  onRefresh: () => void | Promise<unknown>;
  children: ReactNode;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const findScrollContainer = useCallback(
    (el: HTMLElement | null): HTMLElement => {
      let current: HTMLElement | null = el;
      while (current && current !== document.body) {
        const style = window.getComputedStyle(current);
        const overflowY = style.overflowY;
        if (
          (overflowY === "auto" || overflowY === "scroll") &&
          current.scrollHeight > current.clientHeight
        ) {
          return current;
        }
        current = current.parentElement;
      }
      return document.documentElement;
    },
    [],
  );

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (refreshing) return;
      const scroller = findScrollContainer(node);
      if (scroller.scrollTop > 0) {
        startY.current = null;
        return;
      }
      startY.current = e.touches[0].clientY;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (refreshing || startY.current == null) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0) {
        setPull(0);
        return;
      }
      // Damping: finger travels faster than the indicator.
      const damped = Math.min(MAX_PULL, delta * 0.5);
      setPull(damped);
      if (damped > 8) {
        // Prevent iOS rubber-band scrolling on the document while pulling.
        if (e.cancelable) e.preventDefault();
      }
    };

    const handleTouchEnd = async () => {
      if (startY.current == null) return;
      const reached = pull >= THRESHOLD;
      startY.current = null;
      if (!reached) {
        setPull(0);
        return;
      }
      setRefreshing(true);
      setPull(THRESHOLD);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPull(0);
      }
    };

    node.addEventListener("touchstart", handleTouchStart, { passive: true });
    // Non-passive touchmove so we can preventDefault() during pulls.
    node.addEventListener("touchmove", handleTouchMove, { passive: false });
    node.addEventListener("touchend", handleTouchEnd);
    node.addEventListener("touchcancel", handleTouchEnd);

    return () => {
      node.removeEventListener("touchstart", handleTouchStart);
      node.removeEventListener("touchmove", handleTouchMove);
      node.removeEventListener("touchend", handleTouchEnd);
      node.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [onRefresh, pull, refreshing, findScrollContainer]);

  const progress = Math.min(1, pull / THRESHOLD);
  const ready = pull >= THRESHOLD;

  return (
    <div ref={containerRef} className="relative">
      <div
        className="absolute left-0 right-0 flex justify-center pointer-events-none z-30"
        style={{
          transform: `translateY(${Math.max(0, pull - 36)}px)`,
          opacity: progress,
          transition:
            startY.current == null ? "transform 200ms, opacity 200ms" : "none",
        }}
        aria-hidden
      >
        <div
          className={cn(
            "rounded-full bg-background border shadow-sm size-9 flex items-center justify-center",
            (refreshing || ready) && "text-primary",
          )}
        >
          <RefreshCw
            className={cn("size-4", refreshing && "animate-spin")}
            style={{
              transform: refreshing
                ? undefined
                : `rotate(${progress * 180}deg)`,
              transition: refreshing ? undefined : "transform 100ms",
            }}
          />
        </div>
      </div>
      <div
        style={{
          transform: `translateY(${pull}px)`,
          transition: startY.current == null ? "transform 200ms" : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
};
