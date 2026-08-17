/**
 * Creates and sends Fortnox invoices from the CRM.
 *
 *   { action: "create_from_quote", quote_id } -> unbooked draft in Fortnox
 *   { action: "create_from_deal", deal_id }   -> unbooked draft in Fortnox
 *   { action: "send", document_number }       -> emails it to the customer
 *
 * Two rules this function will not break:
 *
 * 1. It never books an invoice. A booked invoice is part of the accounting
 *    record and cannot simply be undone. Creating and sending is enough; the
 *    accountant books.
 * 2. Nothing is ever billed twice. A quote or a whole-amount deal produces one
 *    invoice, guarded by the unique fortnox_invoice_number; a deal split into
 *    installments produces one invoice per part, guarded by the
 *    installments_invoiced counter. Either way a retry or a double click loses
 *    the race instead of billing the customer twice.
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
import { mapQuoteLineItems } from "../_shared/fortnox/customers.ts";
import {
  ensureFortnoxCustomer,
  loadCompany,
} from "../_shared/fortnox/customerSync.ts";
import {
  dealReference,
  installmentAmount,
  mapInvoice,
  quoteReference,
} from "../_shared/fortnox/invoices.ts";

type FortnoxInvoiceResponse = {
  Invoice?: Record<string, unknown> & { DocumentNumber?: string | number };
};

async function requireUser(req: Request) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) throw new HttpError(401, "Missing authorization token");

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, "Unauthorized");
}

/** Writes the freshly created invoice into the mirror so the UI updates now, not in 15 minutes. */
async function mirrorInvoice(
  raw: Record<string, unknown>,
  links: {
    company_id: number;
    quote_id: number | null;
    deal_id: number | null;
  },
) {
  const row = mapInvoice(raw, new Date().toISOString());
  if (!row) return;

  const { error } = await supabaseAdmin
    .from("fortnox_invoices")
    .upsert({ ...row, ...links }, { onConflict: "document_number" });

  if (error) {
    // Not fatal: the invoice exists in Fortnox and the next sync will pick it
    // up. Worth knowing about, though.
    console.warn("fortnox_invoices: mirror write failed", error.message);
  }
}

async function createFromQuote(quoteId: number) {
  const { data: quote, error } = await supabaseAdmin
    .from("quotes")
    .select(
      "id, quote_number, company_id, deal_id, vat_rate, payment_terms, currency, status, fortnox_invoice_number",
    )
    .eq("id", quoteId)
    .maybeSingle();

  if (error || !quote) throw new HttpError(404, "Offerten hittades inte");

  if (quote.fortnox_invoice_number) {
    throw new HttpError(
      409,
      `Offerten är redan fakturerad (Fortnox-faktura ${quote.fortnox_invoice_number}).`,
      {
        code: "already_invoiced",
        details: { document_number: quote.fortnox_invoice_number },
      },
    );
  }

  if (!quote.company_id) {
    throw new HttpError(422, "Offerten saknar kopplat företag");
  }

  const { data: lineItems } = await supabaseAdmin
    .from("quote_line_items")
    .select("description, quantity, unit_price, vat_rate")
    .eq("quote_id", quoteId)
    .order("sort_order");

  const rows = mapQuoteLineItems(lineItems ?? [], {
    defaultVatRate: quote.vat_rate,
  });

  const client = createFortnoxClient();
  const company = await loadCompany(supabaseAdmin, quote.company_id);
  const { customer_number } = await ensureFortnoxCustomer(
    supabaseAdmin,
    client,
    company,
  );

  const created = await client.post<FortnoxInvoiceResponse>("/3/invoices", {
    Invoice: {
      CustomerNumber: customer_number,
      InvoiceRows: rows,
      Currency: quote.currency ?? "SEK",
      Language: "SV",
      ...(quote.payment_terms ? { TermsOfPayment: quote.payment_terms } : {}),
      // The link back to the CRM, in both directions.
      ExternalInvoiceReference1: quoteReference(quote.id),
      ...(quote.deal_id
        ? { ExternalInvoiceReference2: dealReference(quote.deal_id) }
        : {}),
      ...(quote.quote_number ? { YourOrderNumber: quote.quote_number } : {}),
    },
  });

  const documentNumber = Number(created.Invoice?.DocumentNumber);
  if (!Number.isInteger(documentNumber) || documentNumber <= 0) {
    throw new HttpError(502, "Fortnox returnerade inget fakturanummer", {
      code: "fortnox_no_document_number",
    });
  }

  // Conditional update: it only lands if the quote is still uninvoiced. A
  // no-op update is NOT an error in PostgREST, so the row count is what tells
  // us we lost a race — and the loser's invoice is already in Fortnox, so it
  // must be surfaced, not swallowed.
  const { data: linked, error: linkError } = await supabaseAdmin
    .from("quotes")
    .update({ fortnox_invoice_number: documentNumber })
    .eq("id", quoteId)
    .is("fortnox_invoice_number", null)
    .select("id");

  if (linkError || !linked || linked.length === 0) {
    throw new HttpError(
      409,
      `Faktura ${documentNumber} skapades i Fortnox men offerten var redan fakturerad. Kontrollera i Fortnox och makulera dubbletten.`,
      {
        code: "duplicate_invoice",
        details: { document_number: documentNumber },
      },
    );
  }

  await mirrorInvoice(created.Invoice ?? {}, {
    company_id: quote.company_id,
    quote_id: quote.id,
    deal_id: quote.deal_id ?? null,
  });

  return {
    document_number: documentNumber,
    customer_number,
    booked: false,
    sent: false,
  };
}

/**
 * Invoices a won deal's one-time amount directly, without going through a
 * quote. This is the path that finally gives a mirrored invoice its deal_id:
 * the reference is stamped on the Fortnox invoice itself, so even a later
 * re-sync from Fortnox keeps the link (see parseDealReference in the sync).
 *
 * The customer is created in Fortnox on the way through if it doesn't exist —
 * ensureFortnoxCustomer handles create/link/update and writes the customer
 * number back to the company.
 */
async function createFromDeal(dealId: number) {
  const { data: deal, error } = await supabaseAdmin
    .from("deals")
    .select(
      "id, name, company_id, billing_company_id, amount, stage, archived_at, fortnox_invoice_number, billing_schedule_type, installment_count, installments_invoiced",
    )
    .eq("id", dealId)
    .maybeSingle();

  if (error || !deal) throw new HttpError(404, "Affären hittades inte");

  if (deal.stage !== "won" || deal.archived_at) {
    throw new HttpError(422, "Bara vunna, aktiva affärer kan faktureras");
  }

  if (!deal.amount || deal.amount <= 0) {
    throw new HttpError(
      422,
      "Affären saknar engångsbelopp att fakturera. Rena abonnemang faktureras via avtal i Fortnox.",
    );
  }

  // A deal is billed either in full (one invoice, guarded by
  // fortnox_invoice_number) or in equal parts (N invoices, guarded by the
  // installments_invoiced counter). The two paths differ only in what gets
  // invoiced and which guard applies; everything after this is shared.
  const installmentCount = deal.installment_count ?? 0;
  const isInstallment =
    deal.billing_schedule_type === "installment" && installmentCount > 0;
  const alreadyInvoiced = deal.installments_invoiced ?? 0;
  const partIndex = alreadyInvoiced + 1;

  if (isInstallment) {
    if (alreadyInvoiced >= installmentCount) {
      throw new HttpError(
        409,
        `Alla ${installmentCount} delfakturor är redan skapade för den här affären.`,
        { code: "all_installments_invoiced" },
      );
    }
  } else if (deal.fortnox_invoice_number) {
    throw new HttpError(
      409,
      `Affären är redan fakturerad (Fortnox-faktura ${deal.fortnox_invoice_number}).`,
      {
        code: "already_invoiced",
        details: { document_number: deal.fortnox_invoice_number },
      },
    );
  }

  const invoiceAmount = isInstallment
    ? installmentAmount(deal.amount, installmentCount, partIndex)
    : deal.amount;

  if (!(invoiceAmount > 0)) {
    throw new HttpError(
      422,
      "Kunde inte räkna ut ett belopp att fakturera för den här delen",
      { code: "installment_amount_unavailable" },
    );
  }

  // The invoice goes to the billing company when one is set, matching how
  // Kundtäckning groups money.
  const billingCompanyId = deal.billing_company_id ?? deal.company_id;
  if (!billingCompanyId) {
    throw new HttpError(422, "Affären saknar kopplat företag");
  }

  // The part number goes in the row text so the customer, the accountant and
  // the Fortnox invoice itself all say which part this is — the mirror only
  // stores a count.
  const description = isInstallment
    ? `${deal.name} (delbetalning ${partIndex}/${installmentCount})`
    : deal.name;

  const rows = mapQuoteLineItems([
    {
      description,
      quantity: 1,
      unit_price: invoiceAmount,
      vat_rate: null,
    },
  ]);

  const client = createFortnoxClient();
  const company = await loadCompany(supabaseAdmin, billingCompanyId);
  const { customer_number } = await ensureFortnoxCustomer(
    supabaseAdmin,
    client,
    company,
  );

  const created = await client.post<FortnoxInvoiceResponse>("/3/invoices", {
    Invoice: {
      CustomerNumber: customer_number,
      InvoiceRows: rows,
      Currency: "SEK",
      Language: "SV",
      ExternalInvoiceReference2: dealReference(deal.id),
    },
  });

  const documentNumber = Number(created.Invoice?.DocumentNumber);
  if (!Number.isInteger(documentNumber) || documentNumber <= 0) {
    throw new HttpError(502, "Fortnox returnerade inget fakturanummer", {
      code: "fortnox_no_document_number",
    });
  }

  // Conditional update as the race guard: it only lands if the deal is still in
  // the state we read a moment ago — uninvoiced, or with exactly this many
  // parts already billed. A double click therefore loses the race, and because
  // its invoice is already in Fortnox the loss must be surfaced, not swallowed.
  const guarded = isInstallment
    ? supabaseAdmin
        .from("deals")
        .update({ installments_invoiced: partIndex })
        .eq("id", dealId)
        .eq("installments_invoiced", alreadyInvoiced)
    : supabaseAdmin
        .from("deals")
        .update({ fortnox_invoice_number: documentNumber })
        .eq("id", dealId)
        .is("fortnox_invoice_number", null);

  const { data: linked, error: linkError } = await guarded.select("id");

  if (linkError || !linked || linked.length === 0) {
    throw new HttpError(
      409,
      `Faktura ${documentNumber} skapades i Fortnox men affären hade redan fakturerats. Kontrollera i Fortnox och makulera dubbletten.`,
      {
        code: "duplicate_invoice",
        details: { document_number: documentNumber },
      },
    );
  }

  await mirrorInvoice(created.Invoice ?? {}, {
    company_id: billingCompanyId,
    quote_id: null,
    deal_id: deal.id,
  });

  return {
    document_number: documentNumber,
    customer_number,
    booked: false,
    sent: false,
    ...(isInstallment
      ? {
          installment_index: partIndex,
          installment_count: installmentCount,
          amount: invoiceAmount,
        }
      : {}),
  };
}

async function sendInvoice(documentNumber: number) {
  const client = createFortnoxClient();

  // Fortnox sends the invoice to the customer's invoice email and flips Sent.
  const sent = await client.get<FortnoxInvoiceResponse>(
    `/3/invoices/${documentNumber}/email`,
  );

  await mirrorInvoiceById(documentNumber, sent.Invoice ?? {});

  return { document_number: documentNumber, sent: true };
}

async function mirrorInvoiceById(
  documentNumber: number,
  raw: Record<string, unknown>,
) {
  const row = mapInvoice(
    { DocumentNumber: documentNumber, ...raw },
    new Date().toISOString(),
  );
  if (!row) return;

  const { error } = await supabaseAdmin
    .from("fortnox_invoices")
    .update({
      sent: row.sent,
      balance: row.balance,
      raw: row.raw,
      synced_at: row.synced_at,
    })
    .eq("document_number", documentNumber);

  if (error) {
    console.warn("fortnox_invoices: mirror update failed", error.message);
  }
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
        ["create_from_quote", "create_from_deal", "send"],
        {
          required: true,
        },
      );

      if (action === "create_from_quote") {
        const quoteId = getPositiveIntegerField(body, "quote_id", {
          required: true,
        })!;
        return createJsonResponse(await createFromQuote(quoteId));
      }

      if (action === "create_from_deal") {
        const dealId = getPositiveIntegerField(body, "deal_id", {
          required: true,
        })!;
        return createJsonResponse(await createFromDeal(dealId));
      }

      const documentNumber = getPositiveIntegerField(body, "document_number", {
        required: true,
      })!;
      return createJsonResponse(await sendInvoice(documentNumber));
    } catch (error) {
      if (error instanceof MissingBillingDataError) {
        return createErrorResponse(
          422,
          `Kunden saknar uppgifter som krävs för fakturering: ${error.fields.join(", ")}`,
          { code: "missing_billing_data", fields: error.fields },
        );
      }
      if (error instanceof FortnoxError) {
        console.error("fortnox_invoices: Fortnox rejected the request", {
          status: error.status,
          code: error.code,
        });
        return createErrorResponse(502, `Fortnox: ${error.message}`, {
          code: "fortnox_error",
        });
      }
      if (!(error instanceof HttpError)) {
        console.error("fortnox_invoices error:", error);
      }
      return errorResponseFromUnknown(error);
    }
  }),
);
