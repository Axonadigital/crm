import * as React from "react";
import { Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RaRecord, UseBulkDeleteControllerParams } from "ra-core";
import { useBulkDeleteController, useListContext } from "ra-core";
import { cn } from "@/lib/utils";
import { Confirm } from "./confirm";

export type BulkDeleteWithConfirmButtonProps<
  RecordType extends RaRecord = RaRecord,
  MutationOptionsError = unknown,
> = {
  label?: string;
  icon?: React.ReactNode;
  className?: string;
  confirmTitle?: string;
  confirmContent?: string;
} & UseBulkDeleteControllerParams<RecordType, MutationOptionsError>;

/**
 * A bulk delete button that requires user confirmation before deleting selected records.
 *
 * Use in DataTable bulkActionButtons or BulkActionsToolbar when accidental
 * bulk deletion must be prevented.
 */
export const BulkDeleteWithConfirmButton = <
  RecordType extends RaRecord = RaRecord,
  MutationOptionsError = unknown,
>({
  icon = <Trash />,
  label,
  className,
  confirmTitle = "Radera markerade?",
  confirmContent,
  ...props
}: BulkDeleteWithConfirmButtonProps<RecordType, MutationOptionsError>) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const { selectedIds } = useListContext();
  const { handleDelete, isPending } = useBulkDeleteController({
    mutationMode: "pessimistic",
    ...props,
  });

  const count = selectedIds?.length ?? 0;
  const resolvedContent =
    confirmContent ??
    `Du är på väg att radera ${count} ${count === 1 ? "post" : "poster"}. Åtgärden kan inte ångras.`;

  const handleConfirm = (e: React.MouseEvent<HTMLButtonElement>) => {
    handleDelete(e as unknown as React.MouseEvent<HTMLElement>);
    setIsOpen(false);
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
