import { CircleHelp } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { useTour } from "./TourContext";

/**
 * Starts a tour from the page it explains. Needed for tours that cannot be
 * reached from the global launcher because they depend on what is on screen —
 * the Fortnox buttons on a deal only exist once you have opened a won deal.
 *
 * Renders nothing when the tour is missing from the current layout's tour set,
 * which is how the button stays out of the mobile layout without every call
 * site repeating a `useIsMobile()` check.
 */
export function TourHelpButton({
  tourId,
  label = "Vad är det här?",
  className,
}: {
  tourId: string;
  label?: string;
  className?: string;
}) {
  const { tours, startTour } = useTour();

  if (!tours.some((tour) => tour.id === tourId)) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={className}
          onClick={() => startTour(tourId)}
          aria-label={label}
        >
          <CircleHelp className="size-4 text-muted-foreground" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
