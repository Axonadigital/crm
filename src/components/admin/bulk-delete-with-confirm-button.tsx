import * as React from "react";
import { Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RaRecord } from "ra-core";
import {
  useDeleteMany,
  useListContext,
  useRefresh,
  useResourceContext,
} from "ra-core";
import { cn } from "@/lib/utils";
import { Confirm } from "./confirm";

export type BulkDeleteWithConfirmButtonProps = {
  label?: string;
  icon?: React.ReactNode;
  className?: string;
  confirmTitle?: string;
  confirmContent?: string;
};

/**
 * A bulk delete button that requires user confirmation before deleting selected records.
 *
 * Use in DataTable bulkActionButtons or BulkActionsToolbar when accidental
 * bulk deletion must be prevented.
 */
export const BulkDeleteWithConfirmButton = <
  RecordType extends RaRecord = RaRecord,
>({
  icon = <Trash />,
  label,
  className,
  confirmTitle = "Radera markerade?",
  confirmContent,
}: BulkDeleteWithConfirmButtonProps) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const { selectedIds, onUnselectItems } = useListContext();
  const resource = useResourceContext();
  const refresh = useRefresh();

  const [deleteMany, { isPending }] = useDeleteMany<RecordType>(
    resource,
    { ids: selectedIds },
    {
      mutationMode: "pessimistic",
      onSuccess: () => {
        onUnselectItems();
        setIsOpen(false);
        refresh();
      },
    },
  );

  const count = selectedIds?.length ?? 0;
  const resolvedContent =
    confirmContent ??
    `Du är på väg att radera ${count} ${count === 1 ? "post" : "poster"}. Åtgärden kan inte ångras.`;

  const handleConfirm = () => {
    deleteMany();
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
