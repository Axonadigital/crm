import { type Identifier, useGetIdentity } from "ra-core";
import { useState } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import { FeedbackInputBar } from "./FeedbackInputBar";
import { FeedbackThread } from "./FeedbackThread";
import { useGetFeedback } from "./useGetFeedback";

type StatusView = "open" | "all";

export const FeedbackPanel = ({ open }: { open: boolean }) => {
  const [view, setView] = useState<StatusView>("open");
  const [editingId, setEditingId] = useState<Identifier | null>(null);
  const { identity } = useGetIdentity();

  const { data, isPending, refetch } = useGetFeedback(
    open,
    view === "open" ? "open" : undefined,
    // Pausa pollingen medan någon redigerar, annars byts listan ut mitt i ett utkast.
    editingId != null,
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Feedback</h2>
          <p className="text-[11px] text-muted-foreground">
            Vad funkar, vad är trasigt, vad saknas?
          </p>
        </div>
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(value) => {
            if (!value) return;
            // Stäng ett öppet formulär: raden kan försvinna ur den nya vyn.
            setEditingId(null);
            setView(value as StatusView);
          }}
          variant="outline"
          size="sm"
          className="shrink-0"
        >
          <ToggleGroupItem value="open" className="h-8 px-2.5 text-xs">
            Öppna
          </ToggleGroupItem>
          <ToggleGroupItem value="all" className="h-8 px-2.5 text-xs">
            Alla
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <FeedbackThread
        items={data ?? []}
        isPending={isPending}
        editingId={editingId}
        currentSalesId={identity?.id}
        onStartEdit={setEditingId}
        onCancelEdit={() => setEditingId(null)}
        onSaved={() => {
          setEditingId(null);
          refetch();
        }}
        onDeleted={() => {
          setEditingId(null);
          refetch();
        }}
      />

      <FeedbackInputBar onCreated={() => refetch()} />
    </div>
  );
};
