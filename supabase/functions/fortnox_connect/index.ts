/**
 * Fortnox connection management, called from the CRM Settings page.
 *
 *   { action: "status" }                      -> is Fortnox connected, and to which company
 *   { action: "authorize", reconnect?: bool } -> one-time consent URL
 *
 * ADMIN ONLY. The consent URL grants access to our books, and completing the
 * flow overwrites whatever connection is stored — a non-admin employee could
 * otherwise point the CRM's accounting integration at a Fortnox account they
 * control. Same `sales.administrator` gate as the users function.
 *
 * The consent URL is only ever needed once: it creates a service account, after
 * which tokens are minted server-side with client_credentials.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { OptionsMiddleware } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse, createJsonResponse } from "../_shared/utils.ts";
import {
  errorResponseFromUnknown,
  getEnumField,
  getOptionalBooleanField,
  HttpError,
  parseRequiredJsonBody,
} from "../_shared/http.ts";
import {
  buildAuthorizationUrl,
  createFortnoxClient,
  FORTNOX_PROVIDER,
  FORTNOX_SCOPES,
  getConnection,
  getFortnoxCredentials,
} from "../_shared/fortnox/index.ts";

type CompanyInformationResponse = {
  CompanyInformation?: {
    CompanyName?: string;
    OrganizationNumber?: string;
  };
};

type CallerSale = { id: number; administrator: boolean };

/** Resolves the caller to a sales row and rejects anyone who is not an admin. */
async function requireAdminSale(req: Request): Promise<CallerSale> {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) throw new HttpError(401, "Missing authorization token");

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, "Unauthorized");

  const { data: sale } = await supabaseAdmin
    .from("sales")
    .select("id, administrator")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (!sale?.administrator) {
    throw new HttpError(
      403,
      "Fortnox can only be managed by an administrator",
      {
        code: "fortnox_admin_required",
      },
    );
  }

  return sale as CallerSale;
}

/**
 * Verifies the stored grant actually works by asking Fortnox who we are.
 * A stored row means nothing if the grant was revoked inside Fortnox.
 */
async function probeCompany(): Promise<{
  name?: string;
  orgNumber?: string;
  error?: string;
}> {
  try {
    const client = createFortnoxClient();
    const result = await client.get<CompanyInformationResponse>(
      "/3/companyinformation",
    );
    return {
      name: result.CompanyInformation?.CompanyName,
      orgNumber: result.CompanyInformation?.OrganizationNumber,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

Deno.serve((req: Request) =>
  OptionsMiddleware(req, async (req) => {
    if (req.method !== "POST") {
      return createErrorResponse(405, "Method Not Allowed");
    }

    try {
      const sale = await requireAdminSale(req);
      const body = await parseRequiredJsonBody(req);
      const action = getEnumField(body, "action", ["status", "authorize"], {
        required: true,
      });

      const connection = await getConnection();
      const hasStoredGrant = Boolean(
        connection?.access_token || connection?.refresh_token,
      );

      if (action === "status") {
        if (!hasStoredGrant) return createJsonResponse({ connected: false });

        const company = await probeCompany();

        return createJsonResponse({
          connected: !company.error,
          company_name: company.name ?? null,
          org_number: company.orgNumber ?? null,
          scopes: connection?.scopes ?? null,
          connected_at: connection?.connected_at ?? null,
          // Surfaced so a revoked grant is visible in the UI instead of failing
          // silently at the next invoice sync.
          error: company.error ?? null,
          auth_mode: connection?.tenant_id
            ? "service_account"
            : "refresh_token",
        });
      }

      // Completing the consent flow overwrites the stored connection, so a
      // second authorize must be a deliberate "reconnect", never a stray click.
      const reconnect = getOptionalBooleanField(body, "reconnect") ?? false;
      if (hasStoredGrant && !reconnect) {
        throw new HttpError(
          409,
          "Fortnox is already connected. Pass reconnect: true to replace the connection.",
          { code: "fortnox_already_connected" },
        );
      }

      const { clientId, redirectUri } = getFortnoxCredentials();

      // Housekeeping: consent states are single-use and short-lived, so anything
      // older than an hour is dead weight.
      await supabaseAdmin
        .from("integration_oauth_states")
        .delete()
        .eq("provider", FORTNOX_PROVIDER)
        .lt("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());

      const state = crypto.randomUUID();
      const { error: stateError } = await supabaseAdmin
        .from("integration_oauth_states")
        .insert({
          state,
          provider: FORTNOX_PROVIDER,
          created_by: sale.id,
        });

      if (stateError) {
        throw new HttpError(500, "Failed to start Fortnox authorization", {
          code: "fortnox_state_insert_failed",
        });
      }

      return createJsonResponse({
        authorization_url: buildAuthorizationUrl({
          clientId,
          redirectUri,
          state,
          scopes: FORTNOX_SCOPES,
        }),
      });
    } catch (error) {
      if (!(error instanceof HttpError)) {
        console.error("fortnox_connect error:", error);
      }
      return errorResponseFromUnknown(error);
    }
  }),
);
