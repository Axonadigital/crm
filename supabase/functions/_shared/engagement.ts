// Förfrågningar och samtal från kundsajterna: ren logik för mottagaren
// (site_event) och för summan i snapshoten. Databasen hanteras i respektive
// edge function.

export const EVENT_KINDS = ["form", "call", "email"] as const;
export type SiteEventKind = (typeof EVENT_KINDS)[number];

/** Högst så många händelser per sajt och dygn — ett formulär som loopar får inte fylla tabellen. */
export const MAX_EVENTS_PER_DAY = 500;

export interface ParsedSiteEvent {
  key: string;
  kind: SiteEventKind;
  page: string | null;
}

/**
 * Tolkar en händelse från sajten. Nyckeln är 8–64 hex-tecken (den vi delar
 * ut), typen en av tre, sidan högst 500 tecken. Allt annat ger ett fel med
 * orsak — sajten får 400, ingenting sparas.
 */
export function parseSiteEvent(body: unknown): ParsedSiteEvent {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const key = typeof b.key === "string" ? b.key.trim() : "";
  if (!/^[a-f0-9]{8,64}$/i.test(key)) throw new Error("key saknas eller är ogiltig");
  const kind = typeof b.kind === "string" ? b.kind.trim().toLowerCase() : "";
  if (!(EVENT_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`kind måste vara en av: ${EVENT_KINDS.join(", ")}`);
  }
  const page = typeof b.page === "string" && b.page.trim() ? b.page.trim().slice(0, 500) : null;
  return { key: key.toLowerCase(), kind: kind as SiteEventKind, page };
}

export interface EngagementSummary {
  inquiries: number;
  site_calls: number;
  email_clicks: number;
  measured: true;
}

/** Summan ur site_events_summary-svaret; null när sajten inte mäts alls. */
export function engagementFromSummary(
  summary: unknown,
  hasActiveKey: boolean,
): EngagementSummary | null {
  if (!hasActiveKey) return null;
  const s = (summary && typeof summary === "object" ? summary : {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
  return {
    inquiries: n(s.inquiries),
    site_calls: n(s.site_calls),
    email_clicks: n(s.email_clicks),
    measured: true,
  };
}

/**
 * Samtal totalt: tel:-klick på sajten plus samtalsklick på Google-profilen.
 * null när ingen av källorna mäts — 0 och "omätt" är olika saker.
 */
export function totalCalls(
  engagement: { site_calls?: number | null } | null | undefined,
  gbp: { calls?: number | null } | null | undefined,
): number | null {
  const site = typeof engagement?.site_calls === "number" ? engagement.site_calls : null;
  const profile = typeof gbp?.calls === "number" ? gbp.calls : null;
  if (site == null && profile == null) return null;
  return (site ?? 0) + (profile ?? 0);
}
