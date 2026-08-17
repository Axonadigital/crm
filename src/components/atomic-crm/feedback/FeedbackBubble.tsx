import { Check, Pencil, Trash2 } from "lucide-react";
import { useDelete, useGetIdentity, useNotify, useUpdate } from "ra-core";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { RelativeDate } from "../misc/RelativeDate";
import { useGetSalesName } from "../sales/useGetSalesName";
import type { FeedbackItem } from "../types";
import { FeedbackAuthor } from "./FeedbackAuthor";
import { getFeedbackCategory } from "./feedbackCategories";
import { deleteFeedbackImages } from "./feedbackImages";

export const FeedbackBubble = ({
  item,
  canDelete,
  isEditingElsewhere,
  onStartEdit,
  onDeleted,
}: {
  item: FeedbackItem;
  canDelete: boolean;
  /** Ett annat meddelande redigeras just nu — se kommentaren vid pennan. */
  isEditingElsewhere: boolean;
  onStartEdit: () => void;
  onDeleted: () => void;
}) => {
  const { identity } = useGetIdentity();
  const notify = useNotify();
  const isCurrentUser = item.sales_id === identity?.id;
  const category = getFeedbackCategory(item.category);
  const isDone = item.status === "done";
  const images = item.image_urls ?? [];
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [update, { isPending }] = useUpdate();
  const [deleteFeedback, { isPending: isDeleting }] = useDelete();

  // Redigeringen är teamgemensam, men vem som skrev om det ska synas.
  const editedByCurrentUser = item.edited_by_sales_id === identity?.id;
  const editorName = useGetSalesName(item.edited_by_sales_id ?? undefined, {
    enabled: item.edited_by_sales_id != null && !editedByCurrentUser,
  });
  const editedSuffix = item.edited_at
    ? editedByCurrentUser
      ? " · redigerad av dig"
      : editorName
        ? ` · redigerad av ${editorName}`
        : " · redigerad"
    : "";

  const toggleDone = () => {
    update(
      "feedback_items",
      {
        id: item.id,
        data: { status: isDone ? "open" : "done" },
        previousData: item,
      },
      { mutationMode: "optimistic" },
    );
  };

  const handleDelete = () => {
    // Pessimistiskt läge i stället för repots vanliga "undoable": en ångrad
    // radering kan inte få tillbaka bilder som redan städats ur bucketen, och
    // undoable anropar onSuccess optimistiskt så det finns ingen säker hook.
    deleteFeedback(
      "feedback_items",
      { id: item.id, previousData: item },
      {
        onSuccess: async () => {
          await deleteFeedbackImages(images);
          onDeleted();
        },
        onError: () => {
          setConfirmDelete(false);
          notify("Kunde inte radera meddelandet", { type: "error" });
        },
      },
    );
  };

  return (
    <div
      className={cn(
        "rounded-lg border p-3 text-sm transition-opacity",
        isDone && "opacity-60",
      )}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <FeedbackAuthor salesId={item.sales_id} isCurrentUser={isCurrentUser} />
        <span className="min-w-0 text-right text-xs text-muted-foreground">
          <RelativeDate date={item.created_at} />
          {editedSuffix}
        </span>
      </div>

      <div className="flex items-start gap-2">
        {category && (
          <span
            className={cn(
              "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-xs",
              category.badgeClassName,
            )}
            title={category.label}
          >
            {category.emoji}
          </span>
        )}
        {/* min-w-0: utan den blir textens min-content-bredd (en lång URL eller
            ett långt ord) golvet för flexboxen och knuffar ut knappraden, vilket
            ger horisontell scroll i tråden. */}
        <p
          className={cn(
            "min-w-0 flex-1 whitespace-pre-wrap break-words",
            isDone && "line-through",
          )}
        >
          {item.text}
        </p>
        <TooltipProvider>
          <div className="flex shrink-0 items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                {/* Låst medan ett annat meddelande redigeras: bara ett
                    formulär åt gången, och ett byte hade kastat de osparade
                    ändringarna (inklusive valda bilder) utan varning. */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onStartEdit}
                  disabled={isEditingElsewhere}
                  aria-label="Redigera"
                  className="h-8 w-8 cursor-pointer p-0"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isEditingElsewhere
                  ? "Spara eller avbryt den pågående redigeringen först"
                  : "Redigera"}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={isDone ? "secondary" : "ghost"}
                  size="sm"
                  onClick={toggleDone}
                  disabled={isPending}
                  aria-label={isDone ? "Markera som öppen" : "Markera som klar"}
                  className="h-8 w-8 cursor-pointer p-0"
                >
                  <Check className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isDone ? "Markera som öppen" : "Markera som klar"}
              </TooltipContent>
            </Tooltip>

            {canDelete && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(true)}
                    disabled={isDeleting}
                    aria-label="Radera"
                    className="h-8 w-8 cursor-pointer p-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Radera</TooltipContent>
              </Tooltip>
            )}
          </div>
        </TooltipProvider>
      </div>

      {images.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {images.map((url) => (
            /* Öppnas i ny flik i full storlek — panelen är för trång för att
               zooma i en skärmdump. */
            <a key={url} href={url} target="_blank" rel="noopener noreferrer">
              <img
                src={url}
                alt="Skärmdump"
                loading="lazy"
                className="h-16 w-16 rounded-md border object-cover transition-opacity hover:opacity-80"
              />
            </a>
          ))}
        </div>
      )}

      {/* flex-wrap: på en 288px-panel får text + två knappar inte plats på en
          rad — då lägger sig knapparna på egen rad i stället för att klämmas. */}
      {confirmDelete && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2">
          <span className="text-xs">Radera meddelandet?</span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDelete(false)}
              disabled={isDeleting}
              className="h-8 cursor-pointer px-3 text-xs"
            >
              Avbryt
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={isDeleting}
              className="h-8 cursor-pointer px-3 text-xs"
            >
              Radera
            </Button>
          </div>
        </div>
      )}

      {item.page_context && (
        <p className="mt-1.5 truncate text-[11px] text-muted-foreground">
          📍 {item.page_context}
        </p>
      )}
    </div>
  );
};
