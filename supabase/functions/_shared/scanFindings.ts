/**
 * Plockar det som är värt att skriva om ur en skanning.
 *
 * Skannern producerar redan strukturerade fynd med rubrik, konsekvens i
 * klartext, insats och påverkan 0–100. Mallarna använde inte dem — de
 * plockade en textsträng ur verdict-fältet och öppnade med totalpoängen.
 *
 * Det är fel material att öppna med. "47 av 100" betyder ingenting för en
 * målare i Hackås, och att sätta betyg på någons sida i ämnesraden bjuder in
 * till försvar. "Sajten är blockerad från Google" är däremot konkret,
 * kontrollerbart och något ägaren nästan säkert inte vet — och det är den
 * sortens observation ett kallt mejl måste öppna med för att förtjäna ett svar.
 */

export interface ScanFinding {
  id: string;
  /** Rubriken: "Sajten är blockerad från Google". */
  title: string;
  /** Konsekvensen i klartext, skriven för mottagaren — inte för oss. */
  why: string;
  fix: string;
  axis: string;
  /** "quick" | "large" — avgör om vi kan säga att det är gjort på en kvart. */
  effort: string;
  /** 0–100. Skannerns egen bedömning av hur mycket det spelar roll. */
  impact: number;
  service: string;
  severity: string;
}

const SEVERITY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

function str(obj: Record<string, unknown>, key: string): string {
  const value = obj[key];
  return typeof value === "string" ? value.trim() : "";
}

/** Tål allt: null, sträng med JSON, array, skräp. Returnerar alltid en array. */
export function parseFindings(raw: unknown): ScanFinding[] {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
    .map((f) => ({
      id: str(f, "id"),
      title: str(f, "title"),
      why: str(f, "why"),
      fix: str(f, "fix"),
      axis: str(f, "axis"),
      effort: str(f, "effort"),
      impact: typeof f.impact === "number" ? f.impact : 0,
      service: str(f, "service"),
      severity: str(f, "severity").toLowerCase(),
    }))
    .filter((f) => f.title !== "");
}

/**
 * Rangordnar fynden som en säljare skulle: allvarligt före påverkande.
 *
 * Ett "high"-fynd med påverkan 70 slår ett "medium" med 95, eftersom
 * allvarsgraden säger att något är trasigt medan påverkan bara säger att det
 * spelar roll. Sorteringen är stabil, så samma skanning ger alltid samma
 * mejl — annars kan en omkörning byta öppningsrad mellan steg 1 och steg 2.
 */
export function rankFindings(raw: unknown): ScanFinding[] {
  return parseFindings(raw)
    .map((f, i) => ({ f, i }))
    .sort((a, b) => {
      const sev =
        (SEVERITY_RANK[b.f.severity] ?? 0) - (SEVERITY_RANK[a.f.severity] ?? 0);
      if (sev !== 0) return sev;
      if (b.f.impact !== a.f.impact) return b.f.impact - a.f.impact;
      return a.i - b.i;
    })
    .map((x) => x.f);
}

/** Det fynd mejlet ska öppna med. Null när skanningen inte gav något. */
export function topFinding(raw: unknown): ScanFinding | null {
  return rankFindings(raw)[0] ?? null;
}

/**
 * Fyndet uppföljningen ska ta. Att upprepa samma sak i mejl två är det
 * snabbaste sättet att bli ignorerad — då är mejlet uppenbart automatiskt.
 */
export function secondFinding(raw: unknown): ScanFinding | null {
  return rankFindings(raw)[1] ?? null;
}

/** Första meningen, för när hela why-texten är för lång för en mejlrad. */
export function firstSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const match = trimmed.match(/^[^.!?]*[.!?]/);
  return (match ? match[0] : trimmed).trim();
}

/**
 * Hur många av fynden som går att fixa snabbt. Ger mejlet en ärlig
 * storleksangivelse i stället för "det mesta behöver ni inte oss för",
 * som tog bort hela skälet att svara.
 */
export function quickWinCount(raw: unknown): number {
  return parseFindings(raw).filter((f) => f.effort === "quick").length;
}
