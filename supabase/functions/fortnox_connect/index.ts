/**
 * Fortnox connection management, called from the CRM Settings page.
 *
 *   { action: "status" }    -> is Fortnox connected, and as which company
 *   { action: "authorize" } -> one-time consent URL (opens Fortnox login)
 *
 * The consent URL is only ever needed once: it creates a service account, after
 * which tokens are minted server-side with client_credentials. Requires a
 * signed-in CRM user — this hands out a URL that grants access to our books.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { OptionsMiddleware } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createJsonResponse, createErrorResponse } from "../_shared/utils.ts";
import {
  errorResponseFromUnknown,
  getEnumField,
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

async function requireUser(req: Request) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) throw new HttpError(401, "Missing authorization token");

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, "Unauthorized");

  return data.user;
}

/**
 * Verifies the stored grant actually works by asking Fortnox who we are.
 * A stored row means nothing if the grant was revoked in Fortnox.
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
      const user = await requireUser(req);
      const body = await parseRequiredJsonBody(req);
      const action = getEnumField(body, "action", ["status", "authorize"], {
        required: true,
      });

      if (action === "status") {
        const connection = await getConnection();

        if (!connection?.access_token && !connection?.refresh_token) {
          return createJsonResponse({ connected: false });
        }

        const company = await probeCompany();

        return createJsonResponse({
          connected: !company.error,
          company_name: company.name ?? null,
          org_number: company.orgNumber ?? null,
          scopes: connection.scopes,
          connected_at: connection.connected_at,
          // Surfaced so a broken grant is visible in the UI instead of failing
          // silently at the first invoice sync.
          error: company.error ?? null,
          auth_mode: connection.tenant_id ? "service_account" : "refresh_token",
        });
      }

      const { clientId, redirectUri } = getFortnoxCredentials();

      const { data: sale } = await supabaseAdmin
        .from("sales")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      const state = crypto.randomUUID();
      const { error: stateError } = await supabaseAdmin
        .from("integration_oauth_states")
        .insert({
          state,
          provider: FORTNOX_PROVIDER,
          created_by: sale?.id ?? null,
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
