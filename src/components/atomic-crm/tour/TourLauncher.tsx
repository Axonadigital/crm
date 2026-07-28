import { LifeBuoy, Play } from "lucide-react";
import { useState } from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

import { useTour } from "./TourContext";

/**
 * Desktop tour launcher: sits in the sidebar footer. Opens a popover listing
 * the overview tour plus every page deep-guide, so the tour is always one click
 * away — not only on first login.
 */
export function TourLauncher() {
  const { tours, startTour } = useTour();
  const [open, setOpen] = useState(false);

  if (tours.length === 0) return null;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <SidebarMenuButton
              data-tour="tour-launcher"
              tooltip="Rundtur & hjälp"
            >
              <LifeBuoy />
              <span>Rundtur & hjälp</span>
            </SidebarMenuButton>
          </PopoverTrigger>
          <PopoverContent
            side="right"
            align="end"
            className="w-64 max-w-[calc(100vw-2rem)] p-1"
          >
            <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              Guidade rundturer
            </p>
            {tours.map((tour) => (
              <button
                key={tour.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  startTour(tour.id);
                }}
                className="flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <Play className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {tour.label}
                  </span>
                  {tour.hint ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {tour.hint}
                    </span>
                  ) : null}
                </span>
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
