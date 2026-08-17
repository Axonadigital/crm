import { useNotify } from "ra-core";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  imagesFromClipboard,
  type PendingFeedbackImage,
  pickFeedbackImages,
} from "./feedbackImageRules";

/**
 * Håller de bilder som valts men ännu inte laddats upp.
 *
 * Delas av input-baren och redigeringsformuläret så att gränserna, felnotiserna
 * och städningen av object-URL:er är identiska. Previews revokas både när en
 * bild tas bort och när komponenten avmonteras — Radix avmonterar
 * PopoverContent varje gång widgeten stängs, så utan det läcker varje
 * öppna/stäng-cykel.
 */
export const usePendingFeedbackImages = () => {
  const notify = useNotify();
  const [pending, setPending] = useState<PendingFeedbackImage[]>([]);

  const previewsRef = useRef<string[]>([]);
  useEffect(() => {
    previewsRef.current = pending.map((image) => image.preview);
  }, [pending]);
  useEffect(
    () => () => previewsRef.current.forEach((url) => URL.revokeObjectURL(url)),
    [],
  );

  const addFiles = useCallback(
    (files: File[], room: number) => {
      const { accepted, errors } = pickFeedbackImages(files, room);
      errors.forEach((message) => notify(message, { type: "warning" }));
      if (accepted.length === 0) return;
      setPending((prev) => [
        ...prev,
        ...accepted.map((file) => ({
          file,
          preview: URL.createObjectURL(file),
        })),
      ]);
    },
    [notify],
  );

  /** Ctrl+V av en skärmdump. Returnerar true när eventet konsumerats. */
  const addFromClipboard = useCallback(
    (data: DataTransfer | null, room: number) => {
      const files = imagesFromClipboard(data);
      if (files.length === 0) return false;
      addFiles(files, room);
      return true;
    },
    [addFiles],
  );

  const removeAt = useCallback((index: number) => {
    setPending((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((_, position) => position !== index);
    });
  }, []);

  const clear = useCallback(() => {
    setPending((prev) => {
      prev.forEach((image) => URL.revokeObjectURL(image.preview));
      return [];
    });
  }, []);

  return { pending, addFiles, addFromClipboard, removeAt, clear };
};
