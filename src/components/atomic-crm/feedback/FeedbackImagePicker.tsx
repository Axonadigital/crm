import { ImagePlus, X } from "lucide-react";
import { useRef } from "react";

import { cn } from "@/lib/utils";

import {
  FEEDBACK_IMAGE_ACCEPT,
  MAX_FEEDBACK_IMAGES,
  type PendingFeedbackImage,
} from "./feedbackImageRules";

/**
 * Bild-UI:t för feedback-widgeten: förhandsvisningar + "lägg till bild"-tile.
 *
 * Delas av input-baren och redigeringsformuläret. Den hanterar två separata
 * listor — redan sparade URL:er (`existingUrls`) och nya, ännu inte uppladdade
 * filer (`pending`) — vilket är det som gör "ta bort en gammal bild" och
 * "lägg till en ny" komponerbart i samma formulär.
 *
 * X-knapparna hålls visuellt små (20px) för att inte täcka tumnageln, men får
 * en osynlig `before:`-yta på ~36px så de går att träffa med ett finger.
 */
export const FeedbackImagePicker = ({
  existingUrls = [],
  pending,
  onAdd,
  onRemoveExisting,
  onRemovePending,
  thumbClassName = "h-14 w-14",
  disabled = false,
  showAddTile = true,
}: {
  existingUrls?: string[];
  pending: PendingFeedbackImage[];
  onAdd: (files: File[]) => void;
  onRemoveExisting?: (url: string) => void;
  onRemovePending: (index: number) => void;
  thumbClassName?: string;
  disabled?: boolean;
  /** Av i input-baren, som har en egen kompakt bifoga-knapp vid skicka-knappen. */
  showAddTile?: boolean;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const room = MAX_FEEDBACK_IMAGES - existingUrls.length - pending.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input
        ref={inputRef}
        type="file"
        accept={FEEDBACK_IMAGE_ACCEPT}
        multiple
        className="hidden"
        onChange={(event) => {
          onAdd(Array.from(event.target.files ?? []));
          // Nollställ så samma fil kan väljas igen efter att den tagits bort.
          event.target.value = "";
        }}
      />

      {existingUrls.map((url) => (
        <div key={url} className="relative">
          <img
            src={url}
            alt="Skärmdump"
            loading="lazy"
            className={cn("rounded-md border object-cover", thumbClassName)}
          />
          {onRemoveExisting && (
            <button
              type="button"
              onClick={() => onRemoveExisting(url)}
              disabled={disabled}
              aria-label="Ta bort bilden"
              className="absolute -top-1.5 -right-1.5 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-destructive text-destructive-foreground before:absolute before:-inset-2"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}

      {pending.map((image, index) => (
        <div key={image.preview} className="relative">
          <img
            src={image.preview}
            alt={image.file.name}
            className={cn("rounded-md border object-cover", thumbClassName)}
          />
          <button
            type="button"
            onClick={() => onRemovePending(index)}
            disabled={disabled}
            aria-label="Ta bort bilden"
            className="absolute -top-1.5 -right-1.5 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-destructive text-destructive-foreground before:absolute before:-inset-2"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}

      {showAddTile && room > 0 && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          aria-label="Lägg till bild"
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md border border-dashed text-muted-foreground transition-colors hover:border-primary hover:text-primary",
            thumbClassName,
          )}
        >
          <ImagePlus className="h-4 w-4" />
          <span className="text-[10px]">Bild</span>
        </button>
      )}
    </div>
  );
};
