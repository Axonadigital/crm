/**
 * Creates and sends Fortnox invoices from the CRM.
 *
 *   { action: "create_from_quote", quote_id }  -> unbooked draft in Fortnox
 *   { action: "send", document_number }        -> emails it to the customer
 *
 * Two rules this function will not break:
 *
 * 1. It never books an invoice. A booked invoice is part of the accounting
 *    record and cannot simply be undone. Creating and sending is enough; the
 *    accountant books.
 * 2. One quote can only ever produce one invoice. The guard is a unique index
 *    on quotes.fortnox_invoice_number, so a retry or a double click loses the
 *    race instead of billing the customer twice.
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
  mapInvoice,
  quoteReference,
} from "../_shared/fortnox/invoices.ts";

type FortnoxInvoiceResponse = {
  Invoice?: Record<string, unknown> & { DocumentNumber?: string | number };
};

/**
 * A signed-in CRM user, or the service role — docuseal_webhook calls this
 * function to turn a signed offer into an invoice, and it has no user.
 */
async function requireUser(req: Request) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) throw new HttpError(401, "Missing authorization token");

  try {
    const payloadB64 = token.split(".")[1];
    if (payloadB64) {
      const payload = JSON.parse(atob(payloadB64));
      if (payload.role === "service_role") return;
    }
  } catch {
    /* not a JWT — fall through to the user check */
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, "Unauthorized");
}

/** Writes the freshly created invoice into the mirror so the UI updates now, not in 15 minutes. */
async function mirrorInvoice(
  raw: Record<string, unknown>,
  links: {
    company_id: number | null;
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
 * Turns a signed Fortnox offer into an invoice, using Fortnox's own conversion.
 * Every row, article, VAT rate and account carries over untouched — which is the
 * whole reason the customer-facing document is a Fortnox offer in the first
 * place.
 *
 * Idempotent: the unique index on fortnox_offers.fortnox_invoice_number means a
 * replayed webhook cannot invoice the same offer twice.
 */
async function createFromOffer(offerNumber: number) {
  const { data: offer, error } = await supabaseAdmin
    .from("fortnox_offers")
    .select("document_number, company_id, deal_id, fortnox_invoice_number")
    .eq("document_number", offerNumber)
    .maybeSingle();

  if (error || !offer) throw new HttpError(404, "Offerten hittades inte");

  if (offer.fortnox_invoice_number) {
    return {
      document_number: offer.fortnox_invoice_number,
      already_invoiced: true,
    };
  }

  const client = createFortnoxClient();
  const created = await client.put<FortnoxInvoiceResponse>(
    `/3/offers/${offerNumber}/createinvoice`,
  );

  const documentNumber = Number(created.Invoice?.DocumentNumber);
  if (!Number.isInteger(documentNumber) || documentNumber <= 0) {
    throw new HttpError(502, "Fortnox returnerade inget fakturanummer", {
      code: "fortnox_no_document_number",
    });
  }

  // Conditional: a replayed webhook loses the race and leaves the first invoice
  // alone. A no-op UPDATE is not an error in PostgREST, so check the row count.
  const { data: linked } = await supabaseAdmin
    .from("fortnox_offers")
    .update({ fortnox_invoice_number: documentNumber })
    .eq("document_number", offerNumber)
    .is("fortnox_invoice_number", null)
    .select("document_number");

  if (!linked || linked.length === 0) {
    console.warn("fortnox_invoices: offer was invoiced concurrently", {
      offerNumber,
      documentNumber,
    });
  }

  if (offer.deal_id) {
    await supabaseAdmin
      .from("deals")
      .update({ fortnox_invoice_number: documentNumber })
      .eq("id", offer.deal_id)
      .is("fortnox_invoice_number", null);
  }

  await mirrorInvoice(created.Invoice ?? {}, {
    company_id: offer.company_id,
    quote_id: null,
    deal_id: offer.deal_id ?? null,
  });

  return { document_number: documentNumber, booked: false, sent: false };
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
        ["create_from_quote", "create_from_offer", "send"],
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

      if (action === "create_from_offer") {
        const offerNumber = getPositiveIntegerField(body, "offer_number", {
          required: true,
        })!;
        return createJsonResponse(await createFromOffer(offerNumber));
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
