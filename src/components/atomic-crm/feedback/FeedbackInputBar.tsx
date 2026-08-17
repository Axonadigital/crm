import { ImagePlus, SendHorizonal } from "lucide-react";
import { useCreate, useNotify } from "ra-core";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type { FeedbackCategory } from "../types";
import { FeedbackCategoryToggle } from "./FeedbackCategoryToggle";
import { FeedbackImagePicker } from "./FeedbackImagePicker";
import {
  FEEDBACK_IMAGE_ACCEPT,
  MAX_FEEDBACK_IMAGES,
  deleteFeedbackImages,
  uploadFeedbackImages,
} from "./feedbackImages";
import { usePendingFeedbackImages } from "./usePendingFeedbackImages";

export const FeedbackInputBar = ({ onCreated }: { onCreated: () => void }) => {
  const [create, { isPending }] = useCreate();
  const notify = useNotify();
  const [text, setText] = useState("");
  const [category, setCategory] = useState<FeedbackCategory>("works");
  const [isUploading, setIsUploading] = useState(false);
  const images = usePendingFeedbackImages();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const room = MAX_FEEDBACK_IMAGES - images.pending.length;
  const isBusy = isPending || isUploading;

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || isBusy) return;

    // Bilderna laddas upp FÖRE raden: misslyckas de sparas ingen feedback alls,
    // hellre än en buggrapport utan den skärmdump som förklarar felet.
    let imageUrls: string[] = [];
    if (images.pending.length > 0) {
      setIsUploading(true);
      try {
        imageUrls = await uploadFeedbackImages(
          images.pending.map((image) => image.file),
        );
      } catch (error) {
        notify(
          error instanceof Error
            ? error.message
            : "Kunde inte ladda upp bilderna",
          { type: "error" },
        );
        return;
      } finally {
        setIsUploading(false);
      }
    }

    create(
      "feedback_items",
      {
        // Skicka INTE sales_id — det fylls av DB-triggern (set_sales_id_default).
        data: {
          text: trimmed,
          category,
          status: "open",
          page_context: window.location.pathname,
          image_urls: imageUrls,
        },
      },
      {
        onSuccess: () => {
          setText("");
          images.clear();
          onCreated();
        },
        onError: () => {
          // Raden blev inte sparad → städa bilderna som redan hunnit upp, annars
          // ligger de kvar i bucketen utan att någon rad pekar på dem.
          void deleteFeedbackImages(imageUrls);
          notify("Kunde inte spara feedback", { type: "error" });
        },
      },
    );
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter skickar, Shift+Enter ger radbrytning.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // Inklistrad skärmdump (Win+Shift+S → Ctrl+V) blir en bilaga i stället för text.
    if (images.addFromClipboard(event.clipboardData, room)) {
      event.preventDefault();
    }
  };

  return (
    <div className="border-t p-3">
      <FeedbackCategoryToggle
        value={category}
        onChange={setCategory}
        className="mb-2"
      />

      {images.pending.length > 0 && (
        <div className="mb-2">
          <FeedbackImagePicker
            pending={images.pending}
            onAdd={(files) => images.addFiles(files, room)}
            onRemovePending={images.removeAt}
            disabled={isBusy}
            showAddTile={false}
          />
        </div>
      )}

      <div className="flex items-end gap-2">
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="Skriv feedback…"
          rows={2}
          // text-base på mobil: iOS Safari zoomar in på fält under 16px, vilket
          // skulle dra popovern halvt utanför skärmen när man börjar skriva.
          className="max-h-32 min-h-9 min-w-0 flex-1 resize-none text-base sm:text-sm"
        />

        {/* Egen knapp utanför FeedbackImagePicker, så första bilagan är nåbar
            innan förhandsvisningsraden ens finns. */}
        {room > 0 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isBusy}
                  aria-label="Bifoga bild"
                  className="h-10 w-10 shrink-0 cursor-pointer p-0"
                >
                  <ImagePlus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Bifoga bild (eller klistra in med Ctrl+V)
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={FEEDBACK_IMAGE_ACCEPT}
          multiple
          className="hidden"
          onChange={(event) => {
            images.addFiles(Array.from(event.target.files ?? []), room);
            event.target.value = "";
          }}
        />

        <Button
          onClick={() => void handleSend()}
          disabled={isBusy || !text.trim()}
          size="sm"
          aria-label="Skicka feedback"
          className="h-10 w-10 shrink-0 cursor-pointer p-0"
        >
          <SendHorizonal className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
