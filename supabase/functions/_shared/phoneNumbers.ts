export interface PhoneNumberEntry {
  number: string;
  source: string;
}

// Inte direkt efter en siffra: "2025-09-29" gav tidigare numret
// "025 09 29" (2026-09-28, nystartade bolag). Samma sak med postnummer.
const SWEDISH_PHONE_REGEX =
  /(?<![\d-])(?:\+?46[\s-]?\(?\d+\)?[\d\s()-]{5,}\d|0\d[\d\s()-]{5,}\d)/g;

/** Ett svenskt nummer har 8–10 siffror med inledande nolla (11 med 46). */
const MIN_PHONE_DIGITS = 8;

export function normalizePhoneNumber(value: string): string {
  return value
    .trim()
    .replace(/[()\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^00/, "+");
}

function canonicalPhone(value: string): string {
  return normalizePhoneNumber(value).replace(/[^\d+]/g, "");
}

export function extractPhoneNumbersFromText(text?: string | null): string[] {
  if (!text) return [];

  const matches = text.match(SWEDISH_PHONE_REGEX) ?? [];
  return matches
    .map((match) => normalizePhoneNumber(match))
    .filter((match) => canonicalPhone(match).replace(/^\+/, "").length >= MIN_PHONE_DIGITS)
    // Datum skrivna som 2026-09-18 eller 20260918 är inga nummer.
    .filter((match) => !/^(?:19|20)\d{2}[\s-]?(?:0[1-9]|1[0-2])[\s-]?(?:0[1-9]|[12]\d|3[01])$/.test(match.trim()));
}

export function parseStoredPhoneNumbers(value: unknown): PhoneNumberEntry[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const entry = item as Record<string, unknown>;
    if (typeof entry.number !== "string" || entry.number.trim().length === 0) {
      return [];
    }

    return [{
      number: normalizePhoneNumber(entry.number),
      source: typeof entry.source === "string" && entry.source.trim().length > 0
        ? entry.source
        : "existing",
    }];
  });
}

export function mergePhoneNumbers(
  ...groups: PhoneNumberEntry[][]
): PhoneNumberEntry[] {
  const merged: PhoneNumberEntry[] = [];
  const seen = new Set<string>();

  for (const group of groups) {
    for (const entry of group) {
      const normalized = normalizePhoneNumber(entry.number);
      const canonical = canonicalPhone(normalized);

      if (!canonical || seen.has(canonical)) continue;

      seen.add(canonical);
      merged.push({
        number: normalized,
        source: entry.source,
      });
    }
  }

  return merged;
}

export function createPhoneEntries(
  numbers: Iterable<string>,
  source: string,
): PhoneNumberEntry[] {
  return [...numbers]
    .map((number) => normalizePhoneNumber(number))
    .filter((number) => canonicalPhone(number).length >= 7)
    .map((number) => ({ number, source }));
}

export function choosePrimaryPhone(
  existingPrimaryPhone: string | null | undefined,
  phoneNumbers: PhoneNumberEntry[],
): string | null {
  const normalizedExisting = existingPrimaryPhone
    ? normalizePhoneNumber(existingPrimaryPhone)
    : null;

  if (normalizedExisting) {
    return normalizedExisting;
  }

  return phoneNumbers[0]?.number ?? null;
}
