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
import type { TourDefinition } from "./types";

/**
 * Desktop tour launcher: sits in the sidebar footer. Opens a popover listing
 * the overview tour plus every page deep-guide, so the tour is always one click
 * away — not only on first login.
 *
 * Contextual tours are left out: they depend on a record being open and are
 * started from a TourHelpButton next to the feature instead.
 */
export function TourLauncher() {
  const { tours, startTour } = useTour();
  const [open, setOpen] = useState(false);

  const groups = groupTours(tours.filter((tour) => !tour.contextual));
  if (groups.length === 0) return null;

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
            className="max-h-[70vh] w-64 max-w-[calc(100vw-2rem)] overflow-y-auto p-1"
          >
            {groups.map((group) => (
              <div key={group.label}>
                <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  {group.label}
                </p>
                {group.tours.map((tour) => (
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
              </div>
            ))}
          </PopoverContent>
        </Popover>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

const DEFAULT_GROUP = "Guidade rundturer";

/**
 * Groups by `group`, keeping the order the tours are declared in so a new tour
 * lands in the right section just by sitting in the right place in the array —
 * no second list to keep in sync.
 */
function groupTours(
  tours: TourDefinition[],
): { label: string; tours: TourDefinition[] }[] {
  const groups: { label: string; tours: TourDefinition[] }[] = [];
  for (const tour of tours) {
    const label = tour.group ?? DEFAULT_GROUP;
    const last = groups.at(-1);
    if (last?.label === label) {
      last.tours.push(tour);
    } else {
      groups.push({ label, tours: [tour] });
    }
  }
  return groups;
}
