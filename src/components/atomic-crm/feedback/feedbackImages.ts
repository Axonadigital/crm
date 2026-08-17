import { supabase } from "../providers/supabase/supabase";
import {
  FEEDBACK_IMAGES_BUCKET,
  feedbackImagePath,
} from "./feedbackImageRules";

/**
 * Storage-anropen för bildbilagor i feedback-widgeten.
 *
 * Egen modul i stället för dataProviderns beforeSave-mönster (som notes använder):
 * här finns inga RAFile från ett ra-formulär utan råa File från en <input>, felen
 * ska visas på svenska i widgeten, och redigeringen kräver en ordning som
 * lifecycle-callbacks inte kan uttrycka (ladda upp → skriv raden → städa först
 * därefter de bilder som länkats bort).
 *
 * Gränserna och de rena hjälpfunktionerna bor i feedbackImageRules.ts och
 * återexporteras här, så komponenter bara behöver importera den här modulen.
 */
export * from "./feedbackImageRules";

/**
 * auth.uid() (uuid) — bucketpolicyn kräver att första mappnivån är den.
 * OBS: useGetIdentity().id är sales.id (bigint) och skulle ge 403 här.
 */
const getAuthUserId = async (): Promise<string | null> => {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
};

/** Best effort-radering. Kastar aldrig — används i städ-/felvägar. */
const removePaths = async (paths: string[]): Promise<void> => {
  if (paths.length === 0) return;
  const { error } = await supabase.storage
    .from(FEEDBACK_IMAGES_BUCKET)
    .remove(paths);
  if (error) {
    console.error("removeFeedbackImages:", error);
  }
};

/**
 * Laddar upp sekventiellt och returnerar publika URL:er i samma ordning.
 *
 * Allt-eller-inget: misslyckas en fil mitt i batchen städas de som redan
 * hunnit upp innan felet kastas vidare, så bucketen aldrig får filer som
 * ingen rad pekar på. Anroparen ska avbryta hela sparningen — hellre det än
 * ett meddelande utan den skärmdump som förklarar felet.
 */
export const uploadFeedbackImages = async (
  files: File[],
): Promise<string[]> => {
  if (files.length === 0) return [];

  const userId = await getAuthUserId();
  if (!userId) {
    throw new Error("Du måste vara inloggad för att bifoga bilder");
  }

  const uploadedPaths: string[] = [];
  try {
    const urls: string[] = [];
    for (const file of files) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      // Egen mapp per användare — uppladdningspolicyn kräver det.
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from(FEEDBACK_IMAGES_BUCKET)
        .upload(path, file, { contentType: file.type });

      if (error) {
        console.error("uploadFeedbackImages:", error);
        throw new Error(`Kunde inte ladda upp ${file.name}. Försök igen.`);
      }

      uploadedPaths.push(path);
      urls.push(
        supabase.storage.from(FEEDBACK_IMAGES_BUCKET).getPublicUrl(path).data
          .publicUrl,
      );
    }
    return urls;
  } catch (error) {
    await removePaths(uploadedPaths);
    throw error;
  }
};

/**
 * Best effort-städning av filer som ingen rad längre pekar på.
 * Kastar inte: raden är redan skriven, och ett misslyckat storage-anrop ska
 * inte få det att se ut som att sparningen gick fel.
 */
export const deleteFeedbackImages = async (urls: string[]): Promise<void> => {
  await removePaths(
    urls
      .map((url) => feedbackImagePath(url))
      .filter((path): path is string => path != null),
  );
};
