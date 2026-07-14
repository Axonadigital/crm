/**
 * Sends a CRM quote to the customer as a signable Fortnox offer.
 *
 * The whole manual chain — create the offer in Fortnox, download the PDF, upload
 * it to PandaDoc, type in the customer's details, drag a signature box onto it,
 * send — collapses into one click:
 *
 *   quote -> POST /3/offers -> GET /preview (PDF) -> DocuSeal -> customer
 *
 * The customer sees the plain Fortnox offer they already trust, with a signature
 * box on it. When they sign, docuseal_webhook turns the offer into an invoice
 * draft via Fortnox's own createinvoice.
 *
 * POST { quote_id }
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { OptionsMiddleware } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse, createJsonResponse } from "../_shared/utils.ts";
import {
  errorResponseFromUnknown,
  getPositiveIntegerField,
  HttpError,
  parseRequiredJsonBody,
} from "../_shared/http.ts";
import { getDocuSealBaseUrl } from "../_shared/serviceEndpoints.ts";
import { createFortnoxClient, FortnoxError } from "../_shared/fortnox/index.ts";
import { MissingBillingDataError } from "../_shared/fortnox/customers.ts";
import {
  ensureFortnoxCustomer,
  loadCompany,
} from "../_shared/fortnox/customerSync.ts";
import { mapOffer } from "../_shared/fortnox/offers.ts";
import {
  buildFortnoxOfferPayload,
  SIGNER_ROLE,
  toBase64,
} from "../_shared/fortnox/offerSigning.ts";

type FortnoxOfferResponse = {
  Offer?: Record<string, unknown> & { DocumentNumber?: string | number };
};

type DocuSealSubmitter = {
  id: number;
  slug?: string;
  embed_src?: string;
  email?: string;
};

type DocuSealSubmissionResponse = {
  id: number;
  submitters?: DocuSealSubmitter[];
};

async function requireUser(req: Request) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) throw new HttpError(401, "Missing authorization token");

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, "Unauthorized");
}

async function createDocuSealSubmission(params: {
  pdf: Uint8Array;
  documentName: string;
  signerName: string;
  signerEmail: string;
  subject: string;
  body: string;
}): Promise<DocuSealSubmissionResponse> {
  const apiKey = Deno.env.get("DOCUSEAL_API_KEY");
  if (!apiKey) {
    throw new HttpError(500, "DOCUSEAL_API_KEY not configured", {
      code: "docuseal_not_configured",
    });
  }

  const response = await fetch(`${getDocuSealBaseUrl()}/submissions/pdf`, {
    method: "POST",
    headers: {
      "X-Auth-Token": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: params.documentName,
      // No `fields`: the signature box places itself from the {{...}} text tags
      // Fortnox printed on the offer. DocuSeal strips the tag text.
      documents: [{ name: params.documentName, file: toBase64(params.pdf) }],
      submitters: [
        {
          role: SIGNER_ROLE,
          name: params.signerName,
          email: params.signerEmail,
        },
      ],
      message: { subject: params.subject, body: params.body },
    }),
  });

  const rawBody = await response.text();

  if (!response.ok) {
    console.error("fortnox_send_offer: DocuSeal rejected the submission", {
      status: response.status,
    });
    throw new HttpError(502, "Kunde inte skapa signeringen i DocuSeal", {
      code: "docuseal_error",
    });
  }

  return JSON.parse(rawBody) as DocuSealSubmissionResponse;
}

Deno.serve((req: Request) =>
  OptionsMiddleware(req, async (req) => {
    if (req.method !== "POST") {
      return createErrorResponse(405, "Method Not Allowed");
    }

    try {
      await requireUser(req);

      const body = await parseRequiredJsonBody(req);
      const quoteId = getPositiveIntegerField(body, "quote_id", {
        required: true,
      })!;

      const { data: quote, error } = await supabaseAdmin
        .from("quotes")
        .select(
          "id, quote_number, company_id, contact_id, deal_id, currency, payment_terms, delivery_terms, valid_until, vat_rate, terms_and_conditions, fortnox_offer_number",
        )
        .eq("id", quoteId)
        .maybeSingle();

      if (error || !quote) throw new HttpError(404, "Offerten hittades inte");

      if (quote.fortnox_offer_number) {
        throw new HttpError(
          409,
          `Offerten är redan skickad till Fortnox (offert ${quote.fortnox_offer_number}).`,
          { code: "already_sent" },
        );
      }

      if (!quote.company_id) {
        throw new HttpError(422, "Offerten saknar kopplat företag");
      }

      // Who signs. Without an email there is nobody to send to.
      let signerName = "";
      let signerEmail = "";
      if (quote.contact_id) {
        const { data: contact } = await supabaseAdmin
          .from("contacts")
          .select("first_name, last_name, email_jsonb")
          .eq("id", quote.contact_id)
          .maybeSingle();

        if (contact) {
          signerName =
            `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim();
          const emails = (contact.email_jsonb ?? []) as { email?: string }[];
          signerEmail = emails[0]?.email ?? "";
        }
      }

      if (!signerEmail) {
        throw new HttpError(
          422,
          "Kontakten på offerten saknar e-postadress — det finns ingen att skicka till.",
          { code: "missing_signer_email" },
        );
      }

      const { data: lineItems } = await supabaseAdmin
        .from("quote_line_items")
        .select("description, quantity, unit_price, vat_rate")
        .eq("quote_id", quoteId)
        .order("sort_order");

      const client = createFortnoxClient();
      const company = await loadCompany(supabaseAdmin, quote.company_id);
      const { customer_number } = await ensureFortnoxCustomer(
        supabaseAdmin,
        client,
        company,
      );

      const payload = buildFortnoxOfferPayload({
        quote,
        customerNumber: customer_number,
        lineItems: lineItems ?? [],
        yourReference: signerName || null,
      });

      const created = await client.post<FortnoxOfferResponse>(
        "/3/offers",
        payload,
      );

      const offerNumber = Number(created.Offer?.DocumentNumber);
      if (!Number.isInteger(offerNumber) || offerNumber <= 0) {
        throw new HttpError(502, "Fortnox returnerade inget offertnummer", {
          code: "fortnox_no_offer_number",
        });
      }

      // Record the offer BEFORE sending it. If the send fails we still know the
      // offer exists in Fortnox, instead of orphaning it and creating a second
      // one on the next click.
      const offerRow = mapOffer(
        created.Offer ?? { DocumentNumber: offerNumber },
        new Date().toISOString(),
      );

      await supabaseAdmin.from("fortnox_offers").upsert(
        {
          ...offerRow,
          company_id: quote.company_id,
          deal_id: quote.deal_id ?? null,
        },
        { onConflict: "document_number" },
      );

      await supabaseAdmin
        .from("quotes")
        .update({ fortnox_offer_number: offerNumber })
        .eq("id", quoteId);

      const pdf = await client.getPdf(`/3/offers/${offerNumber}/preview`);

      const companyName = company.name;
      const label = quote.quote_number ?? `Offert ${offerNumber}`;

      const submission = await createDocuSealSubmission({
        pdf,
        documentName: `Offert ${offerNumber} — ${companyName}`,
        signerName: signerName || companyName,
        signerEmail,
        subject: `Offert från Axona Digital AB (${label})`,
        body: `Hej!\n\nHär kommer offerten vi pratade om. Du signerar direkt i dokumentet via länken nedan.\n\n{{submitter.link}}\n\nHör av dig om något är oklart.\n\nVänliga hälsningar,\nAxona Digital AB`,
      });

      const submitter = submission.submitters?.[0];
      const signingUrl = submitter?.embed_src ?? null;

      await supabaseAdmin
        .from("fortnox_offers")
        .update({
          docuseal_submission_id: String(submission.id),
          signing_url: signingUrl,
          signing_status: "sent",
          signing_sent_at: new Date().toISOString(),
        })
        .eq("document_number", offerNumber);

      // The same ids on the quote. docuseal_webhook looks a signature up by
      // quotes.docuseal_submission_id — writing it here means the classic offer
      // reuses the entire signed-quote flow (status, deal to won, Discord,
      // confirmation email) instead of growing a parallel one.
      await supabaseAdmin
        .from("quotes")
        .update({
          docuseal_submission_id: String(submission.id),
          docuseal_signing_url: signingUrl,
          status: "sent",
          sent_at: new Date().toISOString(),
        })
        .eq("id", quoteId);

      // We sent it ourselves, so tell Fortnox the offer has gone out. Otherwise
      // it sits there looking unsent forever — the same trap as the invoices.
      try {
        await client.put(`/3/offers/${offerNumber}/externalprint`);
      } catch (markError) {
        console.warn("fortnox_send_offer: could not mark offer as sent", {
          offerNumber,
          message:
            markError instanceof Error ? markError.message : String(markError),
        });
      }

      return createJsonResponse({
        offer_number: offerNumber,
        submission_id: submission.id,
        signing_url: signingUrl,
        signer_email: signerEmail,
      });
    } catch (error) {
      if (error instanceof MissingBillingDataError) {
        return createErrorResponse(
          422,
          `Kunden saknar uppgifter som krävs: ${error.fields.join(", ")}`,
          { code: "missing_billing_data", fields: error.fields },
        );
      }
      if (error instanceof FortnoxError) {
        console.error("fortnox_send_offer: Fortnox rejected the request", {
          status: error.status,
          code: error.code,
        });
        return createErrorResponse(502, `Fortnox: ${error.message}`, {
          code: "fortnox_error",
        });
      }
      if (!(error instanceof HttpError)) {
        console.error("fortnox_send_offer error:", error);
      }
      return errorResponseFromUnknown(error);
    }
  }),
);
