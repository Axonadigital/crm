/**
 * Rena regler för bildbilagor i feedback-widgeten — gränser, filtrering och
 * URL-tolkning. Egen fil utan supabase-import så reglerna kan enhetstestas
 * (vitest kör i browser-mode utan .env, där en import av supabase-klienten kastar).
 * Storage-anropen ligger i feedbackImages.ts, som återexporterar allt härifrån.
 */

export const FEEDBACK_IMAGES_BUCKET = "feedback-images";
export const MAX_FEEDBACK_IMAGES = 3;
/** Speglar bucketens file_size_limit i 20260817120000_feedback_images_and_edit.sql. */
export const MAX_FEEDBACK_IMAGE_BYTES = 5 * 1024 * 1024;
/**
 * Speglar bucketens allowed_mime_types EXAKT. Vi filtrerar på samma lista här,
 * inte bara på "image/*": annars accepterar klienten t.ex. SVG som bucketen
 * sedan avvisar, mitt i en batch där tidigare bilder redan laddats upp.
 * HEIC är medvetet utelämnat — Chrome/Firefox renderar det inte i <img>, så
 * tumnageln hade blivit trasig. (iOS konverterar normalt till JPEG vid uppladdning.)
 */
export const FEEDBACK_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

export type PendingFeedbackImage = { file: File; preview: string };

/** accept-attributet för filväljaren, så dialogen inte ens erbjuder fel format. */
export const FEEDBACK_IMAGE_ACCEPT = FEEDBACK_IMAGE_MIME_TYPES.join(",");

const isAllowedFeedbackImage = (file: File) =>
  (FEEDBACK_IMAGE_MIME_TYPES as readonly string[]).includes(file.type);

/**
 * Filtrerar valda filer mot antal-, typ- och storleksgränserna.
 * Ren funktion utan sidoeffekter, så filväljaren och inklistringen
 * använder exakt samma regler.
 */
export const pickFeedbackImages = (
  files: File[],
  room: number,
): { accepted: File[]; errors: string[] } => {
  const errors: string[] = [];

  const images = files.filter((file) => {
    if (isAllowedFeedbackImage(file)) return true;
    errors.push(
      file.type.startsWith("image/")
        ? `${file.name} har ett bildformat som inte stöds (använd PNG, JPG, WEBP eller GIF).`
        : `${file.name} är inte en bild.`,
    );
    return false;
  });

  if (images.length > Math.max(0, room)) {
    errors.push(`Max ${MAX_FEEDBACK_IMAGES} bilder per meddelande.`);
  }

  const accepted = images.slice(0, Math.max(0, room)).filter((file) => {
    if (file.size <= MAX_FEEDBACK_IMAGE_BYTES) return true;
    errors.push(`${file.name} är större än 5 MB och hoppades över.`);
    return false;
  });

  return { accepted, errors };
};

/**
 * Plockar bildfiler ur ett paste-event, så en skärmdump kan klistras in
 * direkt i textfältet med Ctrl+V.
 */
export const imagesFromClipboard = (data: DataTransfer | null): File[] => {
  if (!data) return [];
  return Array.from(data.items)
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file != null);
};

/** Publik URL → storage-path, eller null om URL:en inte hör till bucketen. */
export const feedbackImagePath = (url: string): string | null => {
  const marker = `/${FEEDBACK_IMAGES_BUCKET}/`;
  const index = url.lastIndexOf(marker);
  if (index === -1) return null;
  const path = url.slice(index + marker.length);
  return path.length > 0 ? path : null;
};
