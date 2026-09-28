/**
 * Pure helpers for the Fortnox OAuth 2.0 flow.
 *
 * We run the authorization-code flow exactly once, with `account_type=service`,
 * to create a service account. After that we mint access tokens with
 * `grant_type=client_credentials` + a TenantId header, which never expires and
 * needs no user interaction.
 *
 * The refresh token from the one-time exchange is stored as a fallback for the
 * case where no tenant id can be resolved (see extractTenantId).
 */

export const FORTNOX_AUTH_URL = "https://apps.fortnox.se/oauth-v1/auth";
export const FORTNOX_TOKEN_URL = "https://apps.fortnox.se/oauth-v1/token";
export const FORTNOX_API_BASE_URL = "https://api.fortnox.se";

/** Scopes registered for the Axona integration in the Fortnox developer portal. */
export const FORTNOX_SCOPES = [
  "companyinformation",
  "settings",
  "customer",
  "invoice",
  "article",
  "payment",
  "offer",
  // Ekonomi-statistik (2026-07): leverantörsfakturor för kostnader/abonnemang,
  // bokföring för faktiskt resultat per konto. Kräver omauktorisering — scopes
  // följer inte med i befintlig grant.
  "supplierinvoice",
  "bookkeeping",
] as const;

export type FortnoxTokenResponse = {
  access_token: string;
  refresh_token?: string;
  scope?: string;
  expires_in: number;
  token_type: string;
};

export function buildAuthorizationUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  scopes?: readonly string[];
}): string {
  const url = new URL(FORTNOX_AUTH_URL);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("scope", (params.scopes ?? FORTNOX_SCOPES).join(" "));
  url.searchParams.set("state", params.state);
  url.searchParams.set("response_type", "code");
  // `offline` keeps the grant alive without the user being present.
  url.searchParams.set("access_type", "offline");
  // `service` is what turns this grant into a service account, which is the
  // prerequisite for the client_credentials flow below.
  url.searchParams.set("account_type", "service");
  return url.toString();
}

export function basicAuthHeader(
  clientId: string,
  clientSecret: string,
): string {
  return `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
}

export function authorizationCodeBody(
  code: string,
  redirectUri: string,
): string {
  return new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  }).toString();
}

export function refreshTokenBody(refreshToken: string): string {
  return new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  }).toString();
}

export function clientCredentialsBody(scopes?: readonly string[]): string {
  const params = new URLSearchParams({ grant_type: "client_credentials" });
  if (scopes && scopes.length > 0) {
    params.set("scope", scopes.join(" "));
  }
  return params.toString();
}

export function decodeJwtPayload(
  token: string,
): Record<string, unknown> | null {
  const segments = token.split(".");
  if (segments.length < 2) return null;

  try {
    const base64 = segments[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "=",
    );
    const parsed: unknown = JSON.parse(atob(padded));
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Fortnox documents that the tenant id must be stored for client_credentials
 * requests, but never says where it comes from. It is carried as a claim on the
 * access token — under a name that has changed across their API versions — so
 * match any claim that looks like a tenant id rather than hardcoding one key.
 *
 * Returns undefined when nothing matches; the caller then falls back to the
 * refresh-token flow instead of silently breaking.
 */
export function extractTenantId(
  payload: Record<string, unknown> | null,
): string | undefined {
  if (!payload) return undefined;

  for (const [key, value] of Object.entries(payload)) {
    if (!/tenant/i.test(key)) continue;
    if (typeof value === "string" && value.length > 0) return value;
    if (typeof value === "number") return String(value);
  }

  return undefined;
}

/** Seconds of headroom so a token is never used in the last moments of its life. */
const EXPIRY_SAFETY_MARGIN_SECONDS = 120;

export function accessTokenExpiresAt(
  expiresInSeconds: number,
  nowMs: number,
): string {
  const lifetime = Math.max(0, expiresInSeconds - EXPIRY_SAFETY_MARGIN_SECONDS);
  return new Date(nowMs + lifetime * 1000).toISOString();
}

export function isExpired(expiresAt: string | null, nowMs: number): boolean {
  if (!expiresAt) return true;
  const parsed = Date.parse(expiresAt);
  if (Number.isNaN(parsed)) return true;
  return parsed <= nowMs;
}
