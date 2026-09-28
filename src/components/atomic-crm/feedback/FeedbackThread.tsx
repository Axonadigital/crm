import type { Identifier } from "ra-core";
import { useEffect, useRef } from "react";

import { Spinner } from "@/components/ui/spinner";

import type { FeedbackItem } from "../types";
import { FeedbackBubble } from "./FeedbackBubble";
import { FeedbackEditForm } from "./FeedbackEditForm";

export const FeedbackThread = ({
  items,
  isPending,
  editingId,
  currentSalesId,
  onStartEdit,
  onCancelEdit,
  onSaved,
  onDeleted,
}: {
  items: FeedbackItem[];
  isPending: boolean;
  editingId: Identifier | null;
  currentSalesId?: Identifier;
  onStartEdit: (id: Identifier) => void;
  onCancelEdit: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Scrolla till nyaste posten (nederst) när tråden ändras — men inte medan
  // någon redigerar, då rycker en poll bort formuläret ur vyn.
  useEffect(() => {
    if (editingId != null) return;
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [items.length, editingId]);

  if (isPending && items.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
        Ingen feedback än. Skriv det första meddelandet 👇
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-2 overflow-y-auto p-3">
      {items.map((item) =>
        editingId === item.id ? (
          <FeedbackEditForm
            key={item.id}
            item={item}
            onCancel={onCancelEdit}
            onSaved={onSaved}
          />
        ) : (
          <FeedbackBubble
            key={item.id}
            item={item}
            // Radering bara på egna rader — RLS stoppar ändå andras.
            canDelete={
              currentSalesId != null && item.sales_id === currentSalesId
            }
            isEditingElsewhere={editingId != null}
            onStartEdit={() => onStartEdit(item.id)}
            onDeleted={onDeleted}
          />
        ),
      )}
      <div ref={bottomRef} />
    </div>
  );
};
