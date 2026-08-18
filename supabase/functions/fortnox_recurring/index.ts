/**
 * Sets up "Återkommande fakturering" in Fortnox from a won CRM deal.
 *
 *   { action: "create_from_deal", deal_id } -> reviewable draft, bills nobody
 *   { action: "activate", deal_id }         -> starts the automatic invoicing
 *
 * Why two steps. Fortnox's POST always persists a recurring with status ACTIVE
 * and offers no "create a draft" input; ACTIVE also cannot move back to DRAFT.
 * The reachable review state is INACTIVE — "retained but not generating
 * invoices". So creation posts with MANUAL handling and immediately pauses to
 * INACTIVE, giving two independent reasons nothing can be billed, and the
 * record is visible and checkable in Fortnox until someone activates it here.
 *
 * That separation is the point. Creating is safe and reversible; activating is
 * the committing action, and it is a different button with its own confirmation.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { OptionsMiddleware } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse, createJsonResponse } from "../_shared/utils.ts";
import {
  errorResponseFromUnknown,
  getEnumField,
  getPositiveIntegerField,
  HttpError,
  parseRequiredJsonBody,
} from "../_shared/http.ts";
import {
  createFortnoxClient,
  FortnoxError,
  type FortnoxEnvironment,
  isFortnoxEnvironment,
} from "../_shared/fortnox/index.ts";
import { MissingBillingDataError } from "../_shared/fortnox/customers.ts";
import {
  ensureFortnoxCustomer,
  loadCompany,
} from "../_shared/fortnox/customerSync.ts";
import {
  buildCreateRecurringPayload,
  RECURRINGS_PATH,
  replaceOps,
  type RecurringInterval,
  type RecurringStatus,
  REVIEW_STATUS,
} from "../_shared/fortnox/recurring.ts";

type RecurringResponse = {
  id?: string;
  status?: RecurringStatus;
  invoice_handling?: string;
  dates?: { dates?: { invoice_date?: string; period_start_date?: string } };
};

async function requireUser(req: Request) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) throw new HttpError(401, "Missing authorization token");

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, "Unauthorized");
}

const DEAL_FIELDS =
  "id, name, company_id, billing_company_id, recurring_amount, recurring_interval, billing_start_date, stage, archived_at, fortnox_recurring_id, fortnox_recurring_status";

async function loadDeal(dealId: number) {
  const { data: deal, error } = await supabaseAdmin
    .from("deals")
    .select(DEAL_FIELDS)
    .eq("id", dealId)
    .maybeSingle();

  if (error || !deal) throw new HttpError(404, "Affären hittades inte");
  return deal;
}

/** `YYYY-MM-DD` for today, used when a deal has no billing start date set. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function createFromDeal(dealId: number, environment: FortnoxEnvironment) {
  const deal = await loadDeal(dealId);
  // A sandbox run exercises the Fortnox side only. Its ids belong to a test
  // company, so writing them onto the production deal would mark a real deal as
  // already set up and block the genuine one — the test must leave no trace in
  // the CRM.
  const isSandbox = environment === "sandbox";

  if (!isSandbox && deal.fortnox_recurring_id) {
    throw new HttpError(
      409,
      `Affären har redan en återkommande fakturering i Fortnox (${deal.fortnox_recurring_status ?? "okänd status"}).`,
      {
        code: "recurring_exists",
        details: { recurring_id: deal.fortnox_recurring_id },
      },
    );
  }

  if (deal.stage !== "won" || deal.archived_at) {
    throw new HttpError(
      422,
      "Bara vunna, aktiva affärer kan få återkommande fakturering",
    );
  }

  if (!deal.recurring_amount || deal.recurring_amount <= 0) {
    throw new HttpError(
      422,
      "Affären saknar återkommande belopp. Engångsaffärer faktureras med fakturaknappen i stället.",
    );
  }

  const billingCompanyId = deal.billing_company_id ?? deal.company_id;
  if (!billingCompanyId) {
    throw new HttpError(422, "Affären saknar kopplat företag");
  }

  const client = createFortnoxClient(environment);
  const company = await loadCompany(supabaseAdmin, billingCompanyId);
  const { customer_number } = await ensureFortnoxCustomer(
    supabaseAdmin,
    client,
    company,
  );

  const payload = buildCreateRecurringPayload({
    customerNumber: customer_number,
    description: deal.name,
    price: deal.recurring_amount,
    interval: deal.recurring_interval as RecurringInterval | null,
    // Without a billing start date the schedule has to start somewhere; today
    // is the honest default, and it is harmless while the record is a draft.
    startDate: deal.billing_start_date ?? todayIso(),
    ourReference: `crm-deal-${deal.id}`,
    invoiceHandling: "MANUAL",
  });

  const created = await client.requestWithHeaders<RecurringResponse>(
    RECURRINGS_PATH,
    { method: "POST", body: payload },
  );

  const recurringId = created.data?.id;
  if (!recurringId) {
    throw new HttpError(502, "Fortnox returnerade inget id för avtalet", {
      code: "fortnox_no_recurring_id",
    });
  }

  // Fortnox created it ACTIVE (its only option) with MANUAL handling, so it
  // already bills nobody. Pausing it to INACTIVE adds a second, independent
  // guarantee and makes the state obvious in Fortnox. If this fails the record
  // is still safe on MANUAL alone, so report it instead of pretending the whole
  // operation failed.
  let status: RecurringStatus = created.data?.status ?? "ACTIVE";
  let draftWarning: string | null = null;
  if (created.etag) {
    try {
      const patched = await client.patch<RecurringResponse>(
        `${RECURRINGS_PATH}/${recurringId}`,
        replaceOps({ status: REVIEW_STATUS }),
        { ifMatch: created.etag },
      );
      status = patched?.status ?? REVIEW_STATUS;
    } catch (error) {
      draftWarning =
        error instanceof FortnoxError
          ? `Kunde inte pausa avtalet (${error.message}). Det är upplagt med manuell hantering och skickar därför inga fakturor, men kontrollera statusen i Fortnox.`
          : "Kunde inte pausa avtalet. Det skickar inga fakturor eftersom hanteringen är manuell, men kontrollera statusen i Fortnox.";
    }
  } else {
    draftWarning =
      "Fortnox skickade ingen ETag, så avtalet kunde inte pausas. Det skickar inga fakturor eftersom hanteringen är manuell.";
  }

  // Conditional update: only lands while the deal has no recurring, so a double
  // click loses the race rather than creating a second one in Fortnox. Skipped
  // for sandbox runs, which must not touch production CRM state at all.
  if (!isSandbox) {
    const { data: linked, error: linkError } = await supabaseAdmin
      .from("deals")
      .update({
        fortnox_recurring_id: recurringId,
        fortnox_recurring_status: status,
      })
      .eq("id", dealId)
      .is("fortnox_recurring_id", null)
      .select("id");

    if (linkError || !linked || linked.length === 0) {
      throw new HttpError(
        409,
        `Återkommande fakturering skapades i Fortnox (${recurringId}) men affären hade redan en. Kontrollera i Fortnox och ta bort dubbletten.`,
        { code: "duplicate_recurring", details: { recurring_id: recurringId } },
      );
    }
  }

  return {
    recurring_id: recurringId,
    customer_number,
    status,
    invoice_handling: "MANUAL",
    environment,
    warning: draftWarning,
  };
}

/**
 * Turns the draft into live recurring invoicing: status ACTIVE and handling
 * AUTOMATIC, so Fortnox generates invoices on the schedule. This is the step
 * that actually starts billing the customer.
 */
async function activate(
  dealId: number,
  environment: FortnoxEnvironment,
  recurringIdOverride?: string | null,
) {
  const deal = await loadDeal(dealId);
  const isSandbox = environment === "sandbox";

  // A sandbox draft was never recorded on the deal, so its id has to be passed
  // in explicitly — which also keeps a test activation from ever resolving to
  // the production recurring by accident.
  const recurringId = isSandbox
    ? recurringIdOverride
    : (recurringIdOverride ?? deal.fortnox_recurring_id);

  if (!recurringId) {
    throw new HttpError(
      422,
      isSandbox
        ? "Ange recurring_id för att aktivera ett avtal i testmiljön"
        : "Affären har ingen återkommande fakturering i Fortnox att aktivera",
      { code: "no_recurring" },
    );
  }

  const client = createFortnoxClient(environment);
  const path = `${RECURRINGS_PATH}/${recurringId}`;

  // The current ETag is mandatory for PATCH: without If-Match Fortnox answers
  // 428, and with a stale one 412. Reading it now also confirms the recurring
  // still exists before we claim to have activated anything.
  const current = await client.requestWithHeaders<RecurringResponse>(path);
  if (!current.etag) {
    throw new HttpError(
      502,
      "Fortnox skickade ingen ETag, så avtalet kan inte uppdateras säkert",
      { code: "fortnox_missing_etag" },
    );
  }

  if (
    current.data?.status === "ACTIVE" &&
    current.data?.invoice_handling !== "MANUAL"
  ) {
    throw new HttpError(409, "Den återkommande faktureringen är redan aktiv", {
      code: "already_active",
    });
  }

  const patched = await client.patch<RecurringResponse>(
    path,
    replaceOps({ status: "ACTIVE", invoice_handling: "AUTOMATIC" }),
    { ifMatch: current.etag },
  );

  const status = patched?.status ?? "ACTIVE";
  if (!isSandbox) {
    await supabaseAdmin
      .from("deals")
      .update({ fortnox_recurring_status: status })
      .eq("id", dealId);
  }

  return {
    recurring_id: recurringId,
    environment,
    status,
    invoice_handling: patched?.invoice_handling ?? "AUTOMATIC",
    next_invoice_date: patched?.dates?.dates?.invoice_date ?? null,
  };
}

Deno.serve((req: Request) =>
  OptionsMiddleware(req, async (req) => {
    if (req.method !== "POST") {
      return createErrorResponse(405, "Method Not Allowed");
    }

    try {
      await requireUser(req);

      const body = await parseRequiredJsonBody(req);
      const action = getEnumField(
        body,
        "action",
        ["create_from_deal", "activate"],
        { required: true },
      );
      const dealId = getPositiveIntegerField(body, "deal_id", {
        required: true,
      })!;

      // Defaults to production so an ordinary click can never be redirected
      // somewhere unexpected; testing against the sandbox is an explicit ask.
      const environmentField = body.environment ?? "production";
      if (!isFortnoxEnvironment(environmentField)) {
        throw new HttpError(
          400,
          'environment must be "production" or "sandbox"',
          { code: "invalid_environment" },
        );
      }

      const recurringIdOverride =
        typeof body.recurring_id === "string" ? body.recurring_id : null;

      return createJsonResponse(
        action === "create_from_deal"
          ? await createFromDeal(dealId, environmentField)
          : await activate(dealId, environmentField, recurringIdOverride),
      );
    } catch (error) {
      if (error instanceof MissingBillingDataError) {
        return createErrorResponse(
          422,
          `Kunden saknar uppgifter som krävs för fakturering: ${error.fields.join(", ")}`,
          { code: "missing_billing_data", fields: error.fields },
        );
      }
      if (error instanceof FortnoxError) {
        console.error("fortnox_recurring: Fortnox rejected the request", {
          status: error.status,
          code: error.code,
        });
        return createErrorResponse(502, `Fortnox: ${error.message}`, {
          code: "fortnox_error",
        });
      }
      if (!(error instanceof HttpError)) {
        console.error("fortnox_recurring error:", error);
      }
      return errorResponseFromUnknown(error);
    }
  }),
);
