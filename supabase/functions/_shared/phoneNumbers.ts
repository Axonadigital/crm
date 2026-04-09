export interface PhoneNumberEntry {
  number: string;
  source: string;
}

const SWEDISH_PHONE_REGEX =
  /(?:\+?46[\s-]?\(?\d+\)?[\d\s()-]{5,}\d|0\d[\d\s()-]{5,}\d)/g;

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
    .filter((match) => canonicalPhone(match).length >= 7);
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
