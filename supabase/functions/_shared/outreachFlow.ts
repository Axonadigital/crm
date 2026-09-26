// Rena beslutsregler för fyrstegsflödet. Ligger här, utan databas, så att
// de går att testa: motorn (process_sequences) anropar dem och gör I/O.

/** Steg 1 säger "i dag". Skanningen måste vara högst så här gammal. */
export const FRESH_SCAN_HOURS = 24;
/** Fler omskanningar än så per körning gör motorn långsam (varje tar ~30–60 s). */
export const MAX_RESCANS_PER_RUN = 2;

export function scanIsFresh(
  scannedAt: string | Date | null | undefined,
  now: Date = new Date(),
  maxHours = FRESH_SCAN_HOURS,
): boolean {
  if (!scannedAt) return false;
  const age = now.getTime() - new Date(scannedAt).getTime();
  return age >= 0 && age <= maxHours * 3_600_000;
}

/**
 * A/B för steg 3: hälften rings, hälften får referensmejlet. Deterministiskt
 * på enrollment-id så att samma enrollment alltid hamnar i samma grupp, och
 * jämnt även när id:n kommer i följd.
 */
export function abVariant(enrollmentId: number, shareCall = 0.5): "call" | "email" {
  // murmur3-finalizer: sprider id i följd jämnt över [0,1).
  let h = enrollmentId >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296 < shareCall ? "call" : "email";
}

export interface CallLogLike {
  call_outcome: string;
  created_at: string;
}

/**
 * Breakup-mejlet (steg 4) ska inte gå till någon vi faktiskt pratat med.
 * Ett samtal som nådde fram, ett bokat möte eller ett ändrat leadstatus
 * betyder att dialogen lever någon annanstans.
 */
export function shouldSkipBreakup(input: {
  leadStatus: string | null | undefined;
  callLogsSinceStep3: CallLogLike[];
}): { skip: boolean; reason: string | null } {
  const status = input.leadStatus ?? "new";
  if (status !== "new" && status !== "no_response") {
    return { skip: true, reason: `lead_status=${status}` };
  }
  const reached = input.callLogsSinceStep3.find((c) =>
    !["no_answer", "busy", "wrong_number"].includes(c.call_outcome)
  );
  if (reached) return { skip: true, reason: `samtal: ${reached.call_outcome}` };
  return { skip: false, reason: null };
}

/**
 * Noteringen som följer med till ringlistan. Kort, i den ordning den som
 * ringer behöver den: vad vi skrev, när, och vad samtalet ska handla om.
 */
export function callNote(input: {
  familyLabel: string;
  observation: string;
  sentStep1At: string | null;
  assetSent: boolean;
}): string {
  const när = input.sentStep1At
    ? new Date(input.sentStep1At).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm", day: "numeric", month: "short" })
    : "nyligen";
  const bild = input.assetSent ? " Bilden är skickad i mejl två." : "";
  return `Kallt mejl ${när} om ${input.familyLabel}: "${input.observation}"${bild} Fråga om de sett mejlet och om de vill att vi går vidare.`;
}

export const FAMILY_LABEL: Record<string, string> = {
  "slow-mobile": "mobilpoängen",
  "poor-crux": "laddtiden",
  "not-mobile": "mobilanpassningen",
  unreachable: "att sajten inte svarar",
  "no-https": "HTTPS-varningen",
  noindex: "Google-spärren",
  parked: "platshållarsidan",
  "no-gbp": "Google-profilen",
  "no-site": "en egen hemsida",
};
