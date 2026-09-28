import * as React from "react";
import { Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RedirectionSideEffect, UseDeleteOptions } from "ra-core";
import {
  useDelete,
  useRecordContext,
  useRedirect,
  useResourceContext,
} from "ra-core";
import { Confirm } from "./confirm";

export type DeleteWithConfirmButtonProps = {
  label?: string;
  size?: "default" | "sm" | "lg" | "icon";
  mutationOptions?: UseDeleteOptions;
  redirect?: RedirectionSideEffect;
  resource?: string;
  successMessage?: string;
  className?: string;
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link";
  confirmTitle?: string;
  confirmContent?: string;
};

/**
 * A button that deletes a record after user confirmation.
 *
 * Shows a confirmation dialog before deleting. Use this instead of DeleteButton
 * for destructive actions where accidental deletion must be prevented.
 *
 * @example
 * import { DeleteWithConfirmButton } from '@/components/admin';
 *
 * const MyActions = () => (
 *   <DeleteWithConfirmButton redirect="list" />
 * );
 */
export const DeleteWithConfirmButton = (
  props: DeleteWithConfirmButtonProps,
) => {
  const {
    label = "ra.action.delete",
    size,
    mutationOptions,
    redirect: redirectTo = "list",
    successMessage,
    variant = "outline",
    className = "cursor-pointer hover:bg-destructive/10! text-destructive! border-destructive! focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
    confirmTitle = "ra.message.delete_title",
    confirmContent = "ra.message.delete_content",
  } = props;

  const record = useRecordContext(props);
  const resource = useResourceContext(props);
  const redirect = useRedirect();
  const [isOpen, setIsOpen] = React.useState(false);

  const [deleteOne, { isPending }] = useDelete(
    resource,
    { id: record?.id, previousData: record },
    {
      mutationMode: "pessimistic",
      ...mutationOptions,
      onSuccess: () => {
        setIsOpen(false);
        redirect(redirectTo, resource);
      },
    },
  );

  const handleDelete = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    deleteOne();
  };

  if (!record) return null;

  return (
    <>
      <Button
        variant={variant}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(true);
        }}
        disabled={isPending}
        size={size}
        className={className}
      >
        <Trash />
        {label === "ra.action.delete" ? "Delete" : label}
      </Button>
      <Confirm
        isOpen={isOpen}
        title={confirmTitle}
        content={confirmContent}
        onConfirm={handleDelete}
        onClose={() => setIsOpen(false)}
        loading={isPending}
        confirmColor="warning"
      />
    </>
  );
};
