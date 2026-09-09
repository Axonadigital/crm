/**
 * Outreach-grinden — EN spärr som alla utgående kanaler frågar innan kontakt.
 *
 * Databasfunktionen public.is_suppressed() (migration 20260909120000) är
 * sanningskällan: den slår ihop explicita spärrar (outreach_suppressions,
 * legacy mc_outreach_suppressions, import_blocklist) med härledda skäl
 * (befintlig kund, sagt nej, enskild firma utan samtycke, avregistrerad).
 * Den här filen håller de rena hjälparna som både edge-funktioner och tester
 * använder, plus en tunn RPC-wrapper.
 */
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type SuppressionReason =
  | "manual"
  | "said_no"
  | "existing_customer"
  | "bad_fit"
  | "bounced"
  | "complained"
  | "unsubscribed"
  | "scb_reklamsparr"
  | "sole_trader_no_consent"
  | "import_deleted"
  | "recently_contacted"
  | "legacy_mc_suppression";

export interface GateVerdict {
  suppressed: boolean;
  reasons: SuppressionReason[];
}

export interface GateSubject {
  email?: string | null;
  /** Webbadress eller domän — normaliseras till bar domän. */
  website?: string | null;
  orgNumber?: string | null;
  companyId?: number | null;
  /** true = räkna även 90-dagars kontaktkarens (bara vid NY enrollment). */
  includeCooldown?: boolean;
}

/** Bara siffror, och de sista tio (12-siffrigt person-/orgnr → 10). */
export function normalizeOrgNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

/**
 * Enskild firma har personnummer som organisationsnummer. Skiljelinjen är
 * "månaden": i ett personnummer är siffra 3–4 en riktig månad (01–12), i ett
 * organisationsnummer är den alltid ≥ 20. En enskild firma är en fysisk
 * person och får därför inte kalla mejl utan förhandssamtycke (19 § MFL).
 */
export function isSoleTraderOrgNumber(raw: string | null | undefined): boolean {
  const org = normalizeOrgNumber(raw);
  if (!org) return false;
  const month = Number.parseInt(org.slice(2, 4), 10);
  return month >= 1 && month <= 12;
}

/** "https://www.Foo.se/om-oss" → "foo.se"; "anna@Foo.se" → "foo.se". */
export function toDomain(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let value = raw.trim().toLowerCase();
  if (!value) return null;
  const at = value.lastIndexOf("@");
  if (at >= 0) value = value.slice(at + 1);
  value = value.replace(/^[a-z]+:\/\//, "");
  value = value.split(/[/?#]/)[0] ?? "";
  value = value.split(":")[0] ?? "";
  value = value.replace(/^www\./, "");
  return value.includes(".") ? value : null;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  const value = raw?.trim().toLowerCase() ?? "";
  return value.includes("@") ? value : null;
}

/** Tolkar RPC-svaret defensivt — ett oväntat svar räknas som spärrat. */
export function parseVerdict(data: unknown): GateVerdict {
  if (!data || typeof data !== "object") {
    return { suppressed: true, reasons: ["manual"] };
  }
  const obj = data as Record<string, unknown>;
  const reasons = Array.isArray(obj.reasons)
    ? (obj.reasons.filter((r) => typeof r === "string") as SuppressionReason[])
    : [];
  return {
    suppressed: obj.suppressed === true || reasons.length > 0,
    reasons,
  };
}

/**
 * Frågar databasen. Vid fel eller tomt svar: fail-closed (spärrat), eftersom
 * ett utskick som slinker igenom kostar mer än ett som fördröjs.
 */
export async function checkGate(
  supabase: SupabaseClient,
  subject: GateSubject,
): Promise<GateVerdict> {
  const { data, error } = await supabase.rpc("is_suppressed", {
    p_email: normalizeEmail(subject.email),
    p_domain: toDomain(subject.website),
    p_org_number: normalizeOrgNumber(subject.orgNumber),
    p_company_id: subject.companyId ?? null,
    p_include_cooldown: subject.includeCooldown ?? false,
  });
  if (error) {
    console.error("is_suppressed rpc failed — fail-closed:", error.message);
    return { suppressed: true, reasons: ["manual"] };
  }
  return parseVerdict(data);
}
