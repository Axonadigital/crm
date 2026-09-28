// Tidigare kontakt: ett lead vi redan pratat, mejlat eller haft möte med får
// aldrig ett kallt mejl "från ingenstans". I stället läggs ett personligt
// utkast i Gmail, skrivet utifrån historiken, som Rasmus läser och skickar.
//
// Bakgrund 2026-09-26: Elkompetens i Jämtland låg tre gånger i CRM:et.
// Historiken (förslag i april, sju samtal, möte bokat, inget svar sedan
// maj) satt på den äldsta raden; grinden tittade bara på den nyaste och
// hade skickat ett kallt mejl till en kontakt vi ringt sju gånger.
//
// Källor: CRM:et via outreach_prior_contact() (samlar dubbletter på orgnr,
// domän och mejl) och Gmail-brevlådan motorn skickar från. Ren logik här,
// databas och Gmail i process_sequences.

export interface HistoryEvent {
  /** call | deal | deal_note | contact_note | task | email | inbound | transcript | gmail */
  kind: string;
  /** ISO-tid. */
  at: string;
  /** Kort etikett: utfall, deal-steg, ämnesrad … */
  label: string;
  /** Anteckning, snippet eller brödtext (klipps). */
  text: string;
  source: "crm" | "gmail";
}

const FREE_MAILBOX = new Set([
  "gmail.com", "hotmail.com", "hotmail.se", "outlook.com", "live.se", "live.com",
  "telia.com", "telia.se", "icloud.com", "yahoo.com", "yahoo.se", "me.com", "spray.se",
  "bredband.net", "comhem.se", "tele2.se", "msn.com", "protonmail.com", "pm.me",
]);

/** Domänen ur en adress eller webbadress, utan www. */
export function domainOf(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw) return null;
  const host = raw.includes("@") ? raw.split("@")[1] : raw.replace(/^https?:\/\//, "").split(/[/?#]/)[0];
  const clean = (host ?? "").replace(/^www\./, "").trim();
  return clean.includes(".") ? clean : null;
}

/**
 * Gmail-sökningen. Egen domän ⇒ hela domänen (alla på företaget). Fri
 * brevlåda (gmail, telia …) ⇒ bara den exakta adressen, annars träffar vi
 * varenda gmail-användare vi någonsin mejlat.
 */
export function gmailHistoryQuery(email: string | null, website: string | null): string | null {
  const addr = (email ?? "").trim().toLowerCase();
  const emailDomain = domainOf(addr);
  const siteDomain = domainOf(website);
  const parts: string[] = [];
  if (addr) parts.push(`from:${addr}`, `to:${addr}`);
  if (emailDomain && !FREE_MAILBOX.has(emailDomain)) parts.push(`from:@${emailDomain}`, `to:@${emailDomain}`);
  if (siteDomain && siteDomain !== emailDomain) parts.push(`from:@${siteDomain}`, `to:@${siteDomain}`);
  if (parts.length === 0) return null;
  return `{${parts.join(" ")}} -in:draft -in:spam`;
}

const CALL_LABELS: Record<string, string> = {
  none: "samtal",
  hot_lead: "het lead",
  active_customer: "aktiv kund",
  under_negotiation: "under förhandling",
  follow_up: "att följa upp",
  never_contacted: "aldrig kontaktad",
  contacted_no_response: "kontaktad, inget svar",
  not_interested: "inte intresserad",
  meeting_booked: "möte bokat",
  interested: "intresserad",
  send_info: "skicka info",
  callback_requested: "ring upp igen",
  no_answer: "inget svar",
};

const KIND_LABELS: Record<string, string> = {
  call: "samtal",
  deal: "affär",
  deal_note: "anteckning på affären",
  contact_note: "anteckning",
  task: "uppgift",
  email: "mejl från oss",
  inbound: "mejl från dem",
  transcript: "möte",
  gmail: "mejl",
};

/** Raderna ur outreach_prior_contact() → händelser. Tål okända former. */
export function crmHistoryEvents(rows: unknown): HistoryEvent[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => ({
      kind: String(r.kind ?? ""),
      at: String(r.at ?? ""),
      label: String(r.label ?? ""),
      text: String(r.text ?? "").replace(/\s+/g, " ").trim(),
      source: "crm" as const,
    }))
    .filter((e) => e.kind && e.at);
}

function day(at: string): string {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? at.slice(0, 10) : d.toISOString().slice(0, 10);
}

/**
 * Historiken som text åt modellen och åt uppgiften i CRM:et: äldst först,
 * högst `max` rader, texter klippta. Samtal utan anteckning blir en rad
 * ("inget svar") — de säger något om hur ofta vi försökt.
 */
export function summarizeHistory(events: HistoryEvent[], max = 14, textMax = 220): string {
  const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at));
  const picked = sorted.length > max ? sorted.slice(sorted.length - max) : sorted;
  const lines = picked.map((e) => {
    const kind = KIND_LABELS[e.kind] ?? e.kind;
    const label = e.kind === "call" ? (CALL_LABELS[e.label] ?? e.label) : e.label;
    const text = e.text.length > textMax ? `${e.text.slice(0, textMax).trim()}…` : e.text;
    return `${day(e.at)} ${kind}${label ? ` (${label})` : ""}${text ? `: ${text}` : ""}`;
  });
  const skipped = sorted.length - picked.length;
  return (skipped > 0 ? `(${skipped} äldre händelser utelämnade)\n` : "") + lines.join("\n");
}

/** Senaste händelsen, för uppgiften: "senast 12 maj: samtal (inget svar)". */
export function latestEvent(events: HistoryEvent[]): HistoryEvent | null {
  if (events.length === 0) return null;
  return [...events].sort((a, b) => b.at.localeCompare(a.at))[0];
}

export interface WarmContext {
  namn: string;
  kontaktnamn: string | null;
  historik: string;
  /** Fyndet ur dagens skanning, t.ex. "Långsam på mobil (38/100)", eller null. */
  fynd: string | null;
  /** Erbjudandet i v5, redan formulerat (krokCopy erbjudande). */
  erbjudande: string;
  referens: string | null;
}

export const WARM_SYSTEM = `Du skriver korta, personliga uppföljningsmejl på svenska åt Rasmus Jönsson, medgrundare av Axona Digital i Östersund (hemsidor åt lokala företag).
Regler som inte får brytas:
- Mejlet går till någon vi redan haft kontakt med. Utgå från historiken: nämn konkret vad som hände senast (samtal, möte, förslag) och hur länge sedan det var. Låtsas aldrig att det är första kontakten.
- Skriv som en människa som minns, inte som ett system som läst en logg. Inga listor, inga rubriker, inga citat ur anteckningarna.
- Högst 90 ord i brödtexten. Ett ärende. En fråga i slutet som är lätt att svara ja eller nej på.
- Påstå ingenting om deras verksamhet eller sida som inte står i underlaget. Fyndet från skanningen får nämnas som en iakttagelse, aldrig som ett löfte om resultat.
- Inga priser, inga procent, inga "AI". Ingen brådska, ingen skuld ("ni svarade aldrig").
- Ämnesraden: 2–5 ord, gemener där det går, gärna som fråga. Ingen hälsning eller signatur i brödtexten; de läggs på efteråt.`;

export function warmFollowupPrompt(c: WarmContext): string {
  return [
    `Företag: ${c.namn}`,
    `Kontaktperson: ${c.kontaktnamn ?? "okänd (skriv utan namn)"}`,
    `Historik (äldst först):`,
    c.historik || "(ingen text, bara att kontakt funnits)",
    ``,
    `Dagens skanning av deras sida: ${c.fynd ?? "inget mejlbart fynd"}`,
    `Vad vi kan erbjuda nu: ${c.erbjudande}`,
    c.referens ? `Referens i samma bransch: ${c.referens} (se axonadigital.se/referenser)` : `Ingen referens att nämna.`,
    ``,
    `Skriv ämnesrad och brödtext.`,
  ].join("\n");
}

export const WARM_SCHEMA = {
  type: "object",
  properties: { subject: { type: "string" }, body: { type: "string" } },
  required: ["subject", "body"],
  additionalProperties: false,
} as const;

export interface WarmDraft {
  subject: string;
  body: string;
}

/** Modellens svar → utkast. Klipper ämnesraden och vägrar tomma texter. */
export function parseWarmDraft(raw: unknown): WarmDraft | null {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  const obj = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const subject = String(obj.subject ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const body = String(obj.body ?? "").trim();
  if (!subject || body.split(/\s+/).length < 15) return null;
  return { subject, body };
}

/** Uppgiftstexten i CRM:et när ett varmt utkast lagts (eller inte kunde läggas). */
export function warmTaskText(namn: string, latest: HistoryEvent | null, drafted: boolean): string {
  const senast = latest
    ? ` Senast ${day(latest.at)}: ${KIND_LABELS[latest.kind] ?? latest.kind}${
      latest.label ? ` (${latest.kind === "call" ? (CALL_LABELS[latest.label] ?? latest.label) : latest.label})` : ""
    }.`
    : "";
  return drafted
    ? `Tidigare kontakt med ${namn}: det kalla mejlet stoppades. Ett personligt utkast ligger i Gmail, läs, justera och skicka.${senast}`
    : `Tidigare kontakt med ${namn}: det kalla mejlet stoppades. Utkastet kunde inte skrivas automatiskt, skriv det själv utifrån historiken i CRM:et.${senast}`;
}
