/**
 * Turning a CRM quote into a signable Fortnox offer.
 *
 * The customer sees Fortnox's plain offer — the document they already trust —
 * with a signature box on it. Axona's own premium quote stays available for
 * customers who have not made up their mind; this is the one you send to a
 * customer who has.
 *
 * The signature box places ITSELF. DocuSeal recognises `{{...}}` text tags
 * printed in the PDF and replaces them with real fields, then strips the tag
 * text. We put the tags in Fortnox's `Remarks` field, which Fortnox prints on
 * the offer. No coordinates, so nothing to recalibrate if Fortnox ever changes
 * its layout.
 */

import { mapQuoteLineItems, type QuoteLineItem } from "./customers.ts";

/** Role name shown to the signer. Must match the submitter role we send. */
export const SIGNER_ROLE = "Kund";

/**
 * Width/height are in pixels. Without them DocuSeal sizes the field to the tag
 * text, which would give a signature box one line tall.
 */
export const SIGNING_TAGS =
  `{{Signatur;type=signature;role=${SIGNER_ROLE};width=220;height=60}} ` +
  `{{Namnförtydligande;type=text;role=${SIGNER_ROLE};width=220;height=24}} ` +
  `{{Datum;type=datenow;role=${SIGNER_ROLE};width=120;height=24}}`;

export type QuoteForOffer = {
  id: number;
  quote_number?: string | null;
  deal_id?: number | null;
  currency?: string | null;
  payment_terms?: string | null;
  delivery_terms?: string | null;
  valid_until?: string | null;
  vat_rate?: number | null;
  terms_and_conditions?: string | null;
};

export type FortnoxOfferPayload = {
  Offer: Record<string, unknown>;
};

/**
 * Anything the seller wants printed above the signature box (payment terms and
 * the like) goes before the tags, so the tags stay at the very bottom of the
 * remarks block — and therefore of the offer.
 */
export function buildRemarks(
  quote: Pick<QuoteForOffer, "terms_and_conditions">,
  options: { includeSigningTags?: boolean } = {},
): string {
  const includeTags = options.includeSigningTags ?? true;
  const terms = quote.terms_and_conditions?.trim();

  const parts = [terms, includeTags ? SIGNING_TAGS : null].filter(
    (part): part is string => Boolean(part),
  );

  return parts.join("\n\n");
}

export function buildFortnoxOfferPayload(params: {
  quote: QuoteForOffer;
  customerNumber: string;
  lineItems: QuoteLineItem[];
  ourReference?: string | null;
  yourReference?: string | null;
  includeSigningTags?: boolean;
}): FortnoxOfferPayload {
  const { quote, customerNumber, lineItems } = params;

  const rows = mapQuoteLineItems(lineItems, {
    defaultVatRate: quote.vat_rate,
  });

  return {
    Offer: {
      CustomerNumber: customerNumber,
      OfferRows: rows,
      Currency: quote.currency ?? "SEK",
      Language: "SV",
      Remarks: buildRemarks(quote, {
        includeSigningTags: params.includeSigningTags,
      }),
      ...(quote.payment_terms ? { TermsOfPayment: quote.payment_terms } : {}),
      ...(quote.delivery_terms
        ? { TermsOfDelivery: quote.delivery_terms }
        : {}),
      ...(quote.valid_until ? { ExpireDate: quote.valid_until } : {}),
      ...(params.ourReference ? { OurReference: params.ourReference } : {}),
      ...(params.yourReference ? { YourReference: params.yourReference } : {}),
      // The link back to the CRM, so a sync can find its way home.
      ...(quote.deal_id
        ? { ExternalInvoiceReference2: `crm-deal-${quote.deal_id}` }
        : {}),
    },
  };
}

/** DocuSeal wants the PDF as base64, and a big offer must not blow the stack. */
export function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
