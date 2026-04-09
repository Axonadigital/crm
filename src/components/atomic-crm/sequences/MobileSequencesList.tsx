import {
  InfiniteListBase,
  RecordContextProvider,
  useGetIdentity,
  useListContext,
  useTranslate,
} from "ra-core";

import { Badge } from "@/components/ui/badge";

import MobileHeader from "../layout/MobileHeader";
import { MobileContent } from "../layout/MobileContent";
import { InfinitePagination } from "../misc/InfinitePagination";

type Sequence = {
  id: string | number;
  name: string;
  status: string;
  trigger_type: string;
  updated_at?: string;
};

const statusVariants: Record<
  string,
  "secondary" | "default" | "outline" | "destructive"
> = {
  draft: "secondary",
  active: "default",
  paused: "outline",
};

const statusLabels: Record<string, string> = {
  draft: "Utkast",
  active: "Aktiv",
  paused: "Pausad",
};

const triggerLabels: Record<string, string> = {
  manual: "Manuell",
  new_lead: "Ny lead",
  segment_change: "Segmentändring",
};

/**
 * Mobile list of outreach sequences.
 *
 * Read-only: creation and editing live on desktop. Provides awareness
 * of which sequences exist, their status and trigger.
 */
export const MobileSequencesList = () => {
  const { identity } = useGetIdentity();
  if (!identity) return null;

  return (
    <InfiniteListBase
      perPage={25}
      sort={{ field: "updated_at", order: "DESC" }}
      queryOptions={{
        onError: () => {
          /* Disable error notification as layout handles it */
        },
      }}
    >
      <SequencesListLayoutMobile />
    </InfiniteListBase>
  );
};

const SequencesListLayoutMobile = () => {
  const { isPending, data, error } = useListContext<Sequence>();
  const translate = useTranslate();

  return (
    <>
      <MobileHeader>
        <h1 className="text-xl font-semibold">
          {translate("resources.sequences.name", {
            smart_count: 2,
            _: "Sekvenser",
          })}
        </h1>
      </MobileHeader>
      <MobileContent>
        {data?.length ? (
          <div className="flex flex-col gap-2">
            {data.map((sequence) => (
              <RecordContextProvider key={sequence.id} value={sequence}>
                <SequencesListItem sequence={sequence} />
              </RecordContextProvider>
            ))}
          </div>
        ) : !isPending ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {translate("ra.navigation.no_results", {
              _: "Inga sekvenser hittades",
            })}
          </p>
        ) : null}
        {!error && (
          <div className="flex justify-center">
            <InfinitePagination />
          </div>
        )}
      </MobileContent>
    </>
  );
};

const SequencesListItem = ({ sequence }: { sequence: Sequence }) => {
  const updatedLabel = sequence.updated_at
    ? new Date(sequence.updated_at).toLocaleDateString("sv-SE")
    : "";

  return (
    <div className="flex flex-col gap-1 p-3 rounded-lg">
      <div className="flex items-start gap-2 justify-between">
        <div className="font-medium text-sm truncate flex-1">
          {sequence.name}
        </div>
        <Badge
          variant={statusVariants[sequence.status] ?? "secondary"}
          className="text-[10px] px-1.5 py-0 shrink-0"
        >
          {statusLabels[sequence.status] ?? sequence.status}
        </Badge>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>
          {triggerLabels[sequence.trigger_type] ?? sequence.trigger_type}
        </span>
        {updatedLabel && <span>·</span>}
        {updatedLabel && <span>{updatedLabel}</span>}
      </div>
    </div>
  );
};
