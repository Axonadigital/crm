/**
 * Tolkning av Cal.coms webhook-händelser.
 *
 * Ligger separat från calcom_webhook för att gå att testa: reglerna för vad
 * som räknas som en avbokning och vad som ska stoppa den kalla utkorgen är
 * lätta att få subtilt fel, och konsekvensen av att ha fel är att vi mejlar
 * vidare till någon som just bokat möte med oss.
 */

/** Cal.com skickar triggerEvent; äldre nyttolaster använder type. */
export function getEventType(body: unknown): string {
  const obj = (body ?? {}) as Record<string, unknown>;
  return String(obj.triggerEvent ?? obj.type ?? "").toLowerCase();
}

/**
 * En avbokning i vid mening: både kunden som avbokar och värden som avvisar
 * en förfrågan. Båda betyder att mötet inte blir av.
 */
export function isCancellation(eventType: string): boolean {
  return /cancel|reject|declined/.test(eventType);
}

export function mapStatus(eventType: string): "cancelled" | "scheduled" {
  return isCancellation(eventType) ? "cancelled" : "scheduled";
}

/**
 * Ska den här händelsen stoppa pågående kall utkorg?
 *
 * Ja för allt som betyder att någon faktiskt vill träffa oss — inklusive
 * booking_requested, som är en bokning som väntar på godkännande. Att någon
 * begär en tid är intresse nog; att fortsätta mejla dem under tiden vore
 * pinsamt.
 *
 * Nej för avbokningar. Vi återupptar INTE sekvensen automatiskt när någon
 * avbokar — den som bokat och avbokat ska ha ett samtal, inte nästa
 * automatiska mejl i kön.
 */
export function bookingStopsOutreach(eventType: string): boolean {
  if (!eventType || isCancellation(eventType)) return false;
  if (/payment_initiated|recording_ready|form_submitted/.test(eventType)) {
    return false;
  }
  return /booking|meeting/.test(eventType);
}
