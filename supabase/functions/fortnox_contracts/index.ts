/**
 * Creates Fortnox contracts (avtal) from won recurring deals — the recurring-
 * billing setup.
 *
 *   { action: "create_from_deal", deal_id }  -> a Fortnox contract (avtal)
 *
 * Rules, mirroring fortnox_invoices:
 *
 * 1. It never books or sends anything. A contract is a template; Fortnox (or a
 *    later cron) generates unbooked draft invoices that a human still sends.
 * 2. One deal can only ever produce one contract. The guard is a conditional
 *    update on deals.fortnox_contract_number, so a double click loses the race
 *    instead of creating two contracts that both bill the customer.
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
import { createFortnoxClient, FortnoxError } from "../_shared/fortnox/index.ts";
import { MissingBillingDataError } from "../_shared/fortnox/customers.ts";
import {
  ensureFortnoxCustomer,
  loadCompany,
} from "../_shared/fortnox/customerSync.ts";
import { ensureContractArticle } from "../_shared/fortnox/articles.ts";
import {
  buildContractPayload,
  mapContract,
  type RecurringInterval,
} from "../_shared/fortnox/contracts.ts";

type FortnoxContractResponse = {
  Contract?: Record<string, unknown> & { DocumentNumber?: string | number };
};

async function requireUser(req: Request) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) throw new HttpError(401, "Missing authorization token");

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, "Unauthorized");
}

/** Best-effort mirror write so a fortnox_contracts view could read it later. */
async function mirrorContract(
  raw: Record<string, unknown>,
  links: { company_id: number; deal_id: number },
) {
  const row = mapContract(raw, new Date().toISOString());
  if (!row) return;

  const { error } = await supabaseAdmin
    .from("fortnox_contracts")
    .upsert({ ...row, ...links }, { onConflict: "document_number" });

  if (error) {
    console.warn("fortnox_contracts: mirror write failed", error.message);
  }
}

async function createFromDeal(dealId: number) {
  const { data: deal, error } = await supabaseAdmin
    .from("deals")
    .select(
      "id, name, company_id, stage, archived_at, recurring_amount, recurring_interval, fortnox_contract_number",
    )
    .eq("id", dealId)
    .maybeSingle();

  if (error || !deal) throw new HttpError(404, "Dealen hittades inte");

  if (deal.fortnox_contract_number) {
    throw new HttpError(
      409,
      `Dealen har redan ett Fortnox-avtal (${deal.fortnox_contract_number}).`,
      {
        code: "already_has_contract",
        details: { document_number: deal.fortnox_contract_number },
      },
    );
  }

  if (deal.stage !== "won" || deal.archived_at) {
    throw new HttpError(422, "Bara vunna, aktiva deals kan avtalsfaktureras");
  }

  if (!deal.recurring_amount || deal.recurring_amount <= 0) {
    throw new HttpError(422, "Dealen saknar återkommande belopp");
  }

  if (!deal.company_id) {
    throw new HttpError(422, "Dealen saknar kopplat företag");
  }

  const client = createFortnoxClient();
  const company = await loadCompany(supabaseAdmin, deal.company_id);
  const { customer_number } = await ensureFortnoxCustomer(
    supabaseAdmin,
    client,
    company,
  );
  const articleNumber = await ensureContractArticle(client);

  const startDate = new Date().toISOString().slice(0, 10);
  const payload = buildContractPayload(
    {
      id: deal.id,
      name: deal.name,
      recurring_amount: deal.recurring_amount,
      recurring_interval: deal.recurring_interval as RecurringInterval | null,
    },
    customer_number,
    startDate,
    articleNumber,
  );

  const created = await client.post<FortnoxContractResponse>("/3/contracts", {
    Contract: payload,
  });

  const documentNumber = Number(created.Contract?.DocumentNumber);
  if (!Number.isInteger(documentNumber) || documentNumber <= 0) {
    throw new HttpError(502, "Fortnox returnerade inget avtalsnummer", {
      code: "fortnox_no_document_number",
    });
  }

  // Conditional update: only lands if the deal still has no contract. A no-op
  // update is not an error in PostgREST, so an empty result means we lost a
  // race — and the loser's contract already exists in Fortnox.
  const { data: linked, error: linkError } = await supabaseAdmin
    .from("deals")
    .update({ fortnox_contract_number: documentNumber })
    .eq("id", dealId)
    .is("fortnox_contract_number", null)
    .select("id");

  if (linkError || !linked || linked.length === 0) {
    throw new HttpError(
      409,
      `Avtal ${documentNumber} skapades i Fortnox men dealen hade redan ett avtal. Kontrollera i Fortnox och ta bort dubbletten.`,
      {
        code: "duplicate_contract",
        details: { document_number: documentNumber },
      },
    );
  }

  await mirrorContract(created.Contract ?? {}, {
    company_id: deal.company_id,
    deal_id: deal.id,
  });

  return { document_number: documentNumber, customer_number, active: true };
}

Deno.serve((req: Request) =>
  OptionsMiddleware(req, async (req) => {
    if (req.method !== "POST") {
      return createErrorResponse(405, "Method Not Allowed");
    }

    try {
      await requireUser(req);

      const body = await parseRequiredJsonBody(req);
      const action = getEnumField(body, "action", ["create_from_deal"], {
        required: true,
      });

      if (action === "create_from_deal") {
        const dealId = getPositiveIntegerField(body, "deal_id", {
          required: true,
        })!;
        return createJsonResponse(await createFromDeal(dealId));
      }

      throw new HttpError(400, "Unknown action");
    } catch (error) {
      if (error instanceof MissingBillingDataError) {
        return createErrorResponse(
          422,
          `Kunden saknar uppgifter som krävs för fakturering: ${error.fields.join(", ")}`,
          { code: "missing_billing_data", fields: error.fields },
        );
      }
      if (error instanceof FortnoxError) {
        console.error("fortnox_contracts: Fortnox rejected the request", {
          status: error.status,
          code: error.code,
        });
        return createErrorResponse(502, `Fortnox: ${error.message}`, {
          code: "fortnox_error",
        });
      }
      if (!(error instanceof HttpError)) {
        console.error("fortnox_contracts error:", error);
      }
      return errorResponseFromUnknown(error);
    }
  }),
);
