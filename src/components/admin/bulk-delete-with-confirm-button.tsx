import * as React from "react";
import { Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useListContext,
  useNotify,
  useRefresh,
  useResourceContext,
} from "ra-core";
import { cn } from "@/lib/utils";
import { supabase } from "@/components/atomic-crm/providers/supabase/supabase";
import { Confirm } from "./confirm";

export type BulkDeleteWithConfirmButtonProps = {
  label?: string;
  icon?: React.ReactNode;
  className?: string;
  confirmTitle?: string;
  confirmContent?: string;
};

/**
 * A bulk delete button that calls Supabase directly to ensure
 * records are actually deleted (bypasses ra-core data provider layer).
 */
export const BulkDeleteWithConfirmButton = ({
  icon = <Trash />,
  label,
  className,
  confirmTitle = "Radera markerade?",
  confirmContent,
}: BulkDeleteWithConfirmButtonProps) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isPending, setIsPending] = React.useState(false);
  const { selectedIds, onUnselectItems } = useListContext();
  const resource = useResourceContext();
  const refresh = useRefresh();
  const notify = useNotify();

  const count = selectedIds?.length ?? 0;
  const resolvedContent =
    confirmContent ??
    `Du är på väg att radera ${count} ${count === 1 ? "post" : "poster"}. Åtgärden kan inte ångras.`;

  const handleConfirm = async () => {
    setIsPending(true);
    try {
      const { error } = await supabase
        .from(resource)
        .delete()
        .in("id", selectedIds);

      if (error) {
        notify(`Radering misslyckades: ${error.message}`, { type: "error" });
        return;
      }

      notify(`${count} ${count === 1 ? "post raderad" : "poster raderade"}`, {
        type: "success",
      });
      onUnselectItems();
      setIsOpen(false);
      refresh();
    } catch (err) {
      notify(`Radering misslyckades: ${err}`, { type: "error" });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <>
      <Button
        variant="destructive"
        type="button"
        onClick={() => setIsOpen(true)}
        disabled={isPending}
        className={cn("h-9", className)}
      >
        {icon}
        {label ?? "Delete"}
      </Button>
      <Confirm
        isOpen={isOpen}
        title={confirmTitle}
        content={resolvedContent}
        onConfirm={handleConfirm}
        onClose={() => setIsOpen(false)}
        loading={isPending}
        confirmColor="warning"
      />
    </>
  );
};
