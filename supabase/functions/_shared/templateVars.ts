/**
 * Härledda mallvariabler för sekvensmejlen (process_sequences). Ligger i
 * _shared så de kan testas utan att dra in Deno.serve.
 */

/**
 * Scannerns verdict slutar med "Största problemet: <sak>." — den saken är det
 * konkreta mejlet öppnar med. Saknas den (t.ex. betyg 0) pekar vi på
 * rapporten i stället, så mallen aldrig får en tom lucka.
 */
export function scanTopIssue(verdict: string): string {
  const match = verdict.match(/Största problemet:\s*([^.]+)\.?/i);
  const issue = match?.[1]?.trim() ?? "";
  return issue || "Det som står överst i rapporten";
}

/** "Ingen kontaktväg utöver telefon" → "ingen kontaktväg utöver telefon". */
export function lowerFirst(text: string): string {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

/** "https://www.bolagsfakta.se/5591117683-X" → "bolagsfakta.se" */
export function websiteHost(website: string): string {
  const trimmed = website.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return url.hostname.replace(/^www\./i, "");
  } catch {
    return trimmed
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .split("/")[0];
  }
}
