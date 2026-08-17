import { useNotify, useUpdate } from "ra-core";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

import type { FeedbackCategory, FeedbackItem } from "../types";
import { FeedbackCategoryToggle } from "./FeedbackCategoryToggle";
import { FeedbackImagePicker } from "./FeedbackImagePicker";
import {
  MAX_FEEDBACK_IMAGES,
  deleteFeedbackImages,
  uploadFeedbackImages,
} from "./feedbackImages";
import { usePendingFeedbackImages } from "./usePendingFeedbackImages";

/**
 * Inline-redigering av ett skickat meddelande. Ersätter bubblan i tråden i
 * stället för att öppna en dialog — panelen är 24rem bred och en nästlad
 * Radix-dialog inuti popovern är onödigt bräcklig.
 *
 * Delad inkorg: alla i teamet får redigera allas meddelanden. DB-triggern
 * stämplar edited_at + edited_by_sales_id så ändringen alltid har ett spår.
 */
export const FeedbackEditForm = ({
  item,
  onCancel,
  onSaved,
}: {
  item: FeedbackItem;
  onCancel: () => void;
  onSaved: () => void;
}) => {
  const notify = useNotify();
  const [update] = useUpdate();
  const [text, setText] = useState(item.text);
  const [category, setCategory] = useState<FeedbackCategory>(item.category);
  const [existingUrls, setExistingUrls] = useState<string[]>(
    item.image_urls ?? [],
  );
  const [isSaving, setIsSaving] = useState(false);
  const images = usePendingFeedbackImages();

  const room =
    MAX_FEEDBACK_IMAGES - existingUrls.length - images.pending.length;

  const handleCancel = () => {
    images.clear();
    onCancel();
  };

  const handleSave = async () => {
    const trimmed = text.trim();
    if (!trimmed || isSaving) return;

    setIsSaving(true);
    let uploaded: string[] = [];
    try {
      uploaded = await uploadFeedbackImages(
        images.pending.map((image) => image.file),
      );
      const imageUrls = [...existingUrls, ...uploaded];

      await update(
        "feedback_items",
        {
          id: item.id,
          data: { text: trimmed, category, image_urls: imageUrls },
          // Obligatoriskt: postgrest-providern diffar mot previousData.
          previousData: item,
        },
        { returnPromise: true },
      );

      // Städa bort avlänkade filer FÖRST efter lyckad skrivning, annars kan
      // raden peka på bilder som redan är raderade.
      await deleteFeedbackImages(
        (item.image_urls ?? []).filter((url) => !imageUrls.includes(url)),
      );
      images.clear();
      onSaved();
    } catch (error) {
      // Raden blev inte sparad → de nyss uppladdade filerna är föräldralösa.
      await deleteFeedbackImages(uploaded);
      notify(
        error instanceof Error ? error.message : "Kunde inte spara ändringen",
        { type: "error" },
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
      <FeedbackCategoryToggle value={category} onChange={setCategory} />

      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        onPaste={(event) => {
          if (images.addFromClipboard(event.clipboardData, room)) {
            event.preventDefault();
          }
        }}
        autoFocus
        rows={3}
        // text-base på mobil: iOS Safari zoomar in på fält under 16px.
        className="max-h-40 resize-none text-base sm:text-sm"
      />

      <FeedbackImagePicker
        existingUrls={existingUrls}
        pending={images.pending}
        onAdd={(files) => images.addFiles(files, room)}
        onRemoveExisting={(url) =>
          setExistingUrls((prev) => prev.filter((current) => current !== url))
        }
        onRemovePending={images.removeAt}
        thumbClassName="h-12 w-12"
        disabled={isSaving}
      />

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCancel}
          disabled={isSaving}
          className="h-8 cursor-pointer px-3 text-xs"
        >
          Avbryt
        </Button>
        <Button
          size="sm"
          onClick={() => void handleSave()}
          disabled={isSaving || !text.trim()}
          className="h-8 cursor-pointer px-3 text-xs"
        >
          {isSaving ? <Spinner className="h-3 w-3" /> : "Spara"}
        </Button>
      </div>
    </div>
  );
};
