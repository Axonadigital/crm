/**
 * Pushes a CRM company to Fortnox as a customer ("Skapa i Fortnox").
 *
 * POST { company_id }                       — create/adopt via org number
 * POST { company_id, customer_number }      — link an existing Fortnox customer
 *                                             number by hand (org-number path
 *                                             can't reach it)
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { OptionsMiddleware } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse, createJsonResponse } from "../_shared/utils.ts";
import {
  errorResponseFromUnknown,
  getOptionalStringField,
  getPositiveIntegerField,
  HttpError,
  parseRequiredJsonBody,
} from "../_shared/http.ts";
import { createFortnoxClient, FortnoxError } from "../_shared/fortnox/index.ts";
import { MissingBillingDataError } from "../_shared/fortnox/customers.ts";
import {
  ensureFortnoxCustomer,
  linkFortnoxCustomerByNumber,
  loadCompany,
} from "../_shared/fortnox/customerSync.ts";

async function requireUser(req: Request) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) throw new HttpError(401, "Missing authorization token");

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, "Unauthorized");
}

Deno.serve((req: Request) =>
  OptionsMiddleware(req, async (req) => {
    if (req.method !== "POST") {
      return createErrorResponse(405, "Method Not Allowed");
    }

    try {
      await requireUser(req);

      const body = await parseRequiredJsonBody(req);
      const companyId = getPositiveIntegerField(body, "company_id", {
        required: true,
      })!;

      const company = await loadCompany(supabaseAdmin, companyId);
      const client = createFortnoxClient();

      // Manual link path: the human supplies an exact Fortnox customer number
      // for a customer the org-number path can't adopt.
      const customerNumber = getOptionalStringField(body, "customer_number");
      if (customerNumber && customerNumber.trim()) {
        const result = await linkFortnoxCustomerByNumber(
          supabaseAdmin,
          client,
          company,
          customerNumber,
        );
        return createJsonResponse(result);
      }

      const result = await ensureFortnoxCustomer(
        supabaseAdmin,
        client,
        company,
      );

      return createJsonResponse(result);
    } catch (error) {
      if (error instanceof MissingBillingDataError) {
        return createErrorResponse(
          422,
          `Företaget saknar uppgifter som krävs för fakturering: ${error.fields.join(", ")}`,
          { code: "missing_billing_data", fields: error.fields },
        );
      }
      if (error instanceof FortnoxError) {
        console.error("fortnox_customers: Fortnox rejected the request", {
          status: error.status,
          code: error.code,
        });
        return createErrorResponse(502, `Fortnox: ${error.message}`, {
          code: "fortnox_error",
        });
      }
      if (!(error instanceof HttpError)) {
        console.error("fortnox_customers error:", error);
      }
      return errorResponseFromUnknown(error);
    }
  }),
);
