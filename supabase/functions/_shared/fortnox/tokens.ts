/**
 * Token store for the Fortnox service account.
 *
 * The connection lives in `integration_tokens`, a table with RLS enabled and
 * no policies — only the service role (i.e. edge functions) can read it. The
 * Client-Secret itself never touches the database; it stays in Supabase
 * secrets.
 *
 * Preferred path: tenant_id present -> mint tokens with client_credentials,
 * which needs no user and never expires.
 * Fallback path: no tenant_id -> rotate the refresh token. Fortnox invalidates
 * the old refresh token on every use, so this path must never run concurrently;
 * it is serialised by the single-row upsert below.
 */

import { HttpError } from "../http.ts";
import { supabaseAdmin } from "../supabaseAdmin.ts";
import { FortnoxClient } from "./client.ts";
import { FortnoxError, parseFortnoxError } from "./errors.ts";
import { createSingleFlight } from "./singleFlight.ts";
import {
  accessTokenExpiresAt,
  authorizationCodeBody,
  basicAuthHeader,
  clientCredentialsBody,
  decodeJwtPayload,
  extractTenantId,
  FORTNOX_TOKEN_URL,
  type FortnoxTokenResponse,
  isExpired,
  refreshTokenBody,
} from "./oauth.ts";

export const FORTNOX_PROVIDER = "fortnox";

/**
 * Which Fortnox company a connection points at.
 *
 * Fortnox lets a developer account run up to 30 sandbox companies, each a full
 * Fortnox database you authorize exactly like a real one. Keeping both
 * connections side by side matters for more than convenience: the invoice sync
 * runs every 15 minutes, so a single shared connection pointed at a sandbox
 * would pull invented invoices straight into the production mirror that
 * Kundtäckning and Likviditet read. Separate rows make that impossible —
 * everything defaults to production and only an explicit opt-in reads sandbox.
 */
export type FortnoxEnvironment = "production" | "sandbox";

export const FORTNOX_SANDBOX_PROVIDER = "fortnox_sandbox";

/**
 * The `integration_tokens.provider` key for an environment. `provider` is the
 * table's primary key and carries no check constraint, so a second environment
 * is a second row — no schema change, and production is untouched.
 */
export function providerKey(
  environment: FortnoxEnvironment = "production",
): string {
  return environment === "sandbox"
    ? FORTNOX_SANDBOX_PROVIDER
    : FORTNOX_PROVIDER;
}

export function isFortnoxEnvironment(
  value: unknown,
): value is FortnoxEnvironment {
  return value === "production" || value === "sandbox";
}

/**
 * API host per environment. Fortnox's own developer docs don't state whether
 * sandboxes answer on a different host; if it turns out they do, set
 * FORTNOX_SANDBOX_API_BASE_URL rather than changing code.
 */
export function apiBaseUrlFor(
  environment: FortnoxEnvironment = "production",
): string | undefined {
  if (environment !== "sandbox") return undefined;
  return Deno.env.get("FORTNOX_SANDBOX_API_BASE_URL") || undefined;
}

export type FortnoxConnection = {
  provider: string;
  tenant_id: string | null;
  access_token: string | null;
  access_token_expires_at: string | null;
  refresh_token: string | null;
  scopes: string | null;
  connected_at: string | null;
  connected_by: number | null;
  token_claims: Record<string, unknown> | null;
};

export type FortnoxCredentials = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function getFortnoxCredentials(): FortnoxCredentials {
  const clientId = Deno.env.get("FORTNOX_CLIENT_ID");
  const clientSecret = Deno.env.get("FORTNOX_CLIENT_SECRET");
  const redirectUri = Deno.env.get("FORTNOX_REDIRECT_URI");

  if (!clientId || !clientSecret || !redirectUri) {
    throw new HttpError(
      500,
      "FORTNOX_CLIENT_ID, FORTNOX_CLIENT_SECRET or FORTNOX_REDIRECT_URI is not configured",
      { code: "fortnox_not_configured" },
    );
  }

  return { clientId, clientSecret, redirectUri };
}

async function postToken(
  body: string,
  extraHeaders: Record<string, string> = {},
): Promise<FortnoxTokenResponse> {
  const { clientId, clientSecret } = getFortnoxCredentials();

  const response = await fetch(FORTNOX_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(clientId, clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
      ...extraHeaders,
    },
    body,
  });

  const rawBody = await response.text();

  if (!response.ok) {
    // Deliberately does NOT carry the raw body: OAuth providers routinely echo
    // the submitted code or refresh token back in error_description, and this
    // error ends up in the function logs.
    const { message, code } = parseFortnoxError(rawBody);
    throw new FortnoxError(
      response.status,
      `Fortnox token request failed: ${message}`,
      { code },
    );
  }

  return JSON.parse(rawBody) as FortnoxTokenResponse;
}

export async function getConnection(
  environment: FortnoxEnvironment = "production",
): Promise<FortnoxConnection | null> {
  const { data, error } = await supabaseAdmin
    .from("integration_tokens")
    .select("*")
    .eq("provider", providerKey(environment))
    .maybeSingle();

  if (error) {
    throw new HttpError(500, "Failed to read Fortnox connection", {
      code: "fortnox_connection_read_failed",
    });
  }

  return (data as FortnoxConnection | null) ?? null;
}

async function persistTokens(
  token: FortnoxTokenResponse,
  existing: FortnoxConnection | null,
  connectedBySaleId?: number | null,
  environment: FortnoxEnvironment = "production",
): Promise<FortnoxConnection> {
  const claims = decodeJwtPayload(token.access_token);
  const tenantId = extractTenantId(claims) ?? existing?.tenant_id ?? null;

  const { data, error } = await supabaseAdmin
    .from("integration_tokens")
    .upsert(
      {
        provider: providerKey(environment),
        tenant_id: tenantId,
        access_token: token.access_token,
        access_token_expires_at: accessTokenExpiresAt(
          token.expires_in,
          Date.now(),
        ),
        // Fortnox omits refresh_token on client_credentials responses; keep the
        // one we already have rather than nulling out our fallback path.
        refresh_token: token.refresh_token ?? existing?.refresh_token ?? null,
        scopes: token.scope ?? existing?.scopes ?? null,
        token_claims: claims,
        connected_at: existing?.connected_at ?? new Date().toISOString(),
        connected_by: connectedBySaleId ?? existing?.connected_by ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider" },
    )
    .select()
    .single();

  if (error || !data) {
    throw new HttpError(500, "Failed to persist Fortnox tokens", {
      code: "fortnox_token_persist_failed",
    });
  }

  return data as FortnoxConnection;
}

/**
 * One-time: exchange the authorization code from the consent redirect.
 * This is what creates the service account and gives us the tenant id.
 */
export async function exchangeAuthorizationCode(
  code: string,
  connectedBySaleId?: number | null,
  environment: FortnoxEnvironment = "production",
): Promise<FortnoxConnection> {
  const { redirectUri } = getFortnoxCredentials();
  const token = await postToken(authorizationCodeBody(code, redirectUri));
  return persistTokens(
    token,
    await getConnection(environment),
    connectedBySaleId,
    environment,
  );
}

async function mintAccessToken(
  connection: FortnoxConnection,
  environment: FortnoxEnvironment = "production",
): Promise<FortnoxConnection> {
  if (connection.tenant_id) {
    const token = await postToken(clientCredentialsBody(), {
      TenantId: connection.tenant_id,
    });
    return persistTokens(token, connection, null, environment);
  }

  if (connection.refresh_token) {
    const token = await postToken(refreshTokenBody(connection.refresh_token));
    return persistTokens(token, connection, null, environment);
  }

  throw new HttpError(
    409,
    "Fortnox is not connected. Run the authorization flow from Settings.",
    { code: "fortnox_not_connected" },
  );
}

/**
 * Collapses concurrent refreshes into one. Critical in the refresh_token
 * fallback mode: Fortnox invalidates the old refresh token on every use, so a
 * parallel refresh would send an already-dead token and get invalid_grant.
 */
// One flight per environment: a shared one would let a sandbox refresh hand
// its connection to a production caller waiting on the same promise.
const refreshSingleFlights: Record<
  FortnoxEnvironment,
  ReturnType<typeof createSingleFlight<FortnoxConnection>>
> = {
  production: createSingleFlight<FortnoxConnection>(),
  sandbox: createSingleFlight<FortnoxConnection>(),
};

export async function getFortnoxAccessToken(
  options: { forceRefresh?: boolean; environment?: FortnoxEnvironment } = {},
): Promise<string> {
  const environment = options.environment ?? "production";
  const connection = await getConnection(environment);

  if (!connection) {
    throw new HttpError(
      409,
      environment === "sandbox"
        ? "Fortnox-testmiljön är inte kopplad. Auktorisera sandboxen från Inställningar."
        : "Fortnox is not connected. Run the authorization flow from Settings.",
      { code: "fortnox_not_connected" },
    );
  }

  if (
    !options.forceRefresh &&
    connection.access_token &&
    !isExpired(connection.access_token_expires_at, Date.now())
  ) {
    return connection.access_token;
  }

  const refreshed = await refreshSingleFlights[environment](() =>
    mintAccessToken(connection, environment),
  );

  if (!refreshed.access_token) {
    throw new HttpError(500, "Fortnox returned no access token", {
      code: "fortnox_no_access_token",
    });
  }

  return refreshed.access_token;
}

/**
 * The client every Fortnox-facing edge function should use. Defaults to the
 * production company, so an existing caller cannot accidentally read or write
 * sandbox data — reaching the sandbox takes an explicit environment.
 */
export function createFortnoxClient(
  environment: FortnoxEnvironment = "production",
): FortnoxClient {
  return new FortnoxClient({
    getAccessToken: (options) =>
      getFortnoxAccessToken({ ...options, environment }),
    baseUrl: apiBaseUrlFor(environment),
  });
}
