/**
 * Contract Fields — Formats quote data into a DocuSeal submission payload.
 *
 * Used by approve_proposal and send_quote_for_signing to create
 * signing requests using a pre-defined DocuSeal template (CE-compatible).
 */

export interface ContractInput {
  templateId: number;
  quote: {
    id: number;
    quote_number?: string;
    valid_until?: string;
    total_amount?: number;
    subtotal?: number;
    vat_amount?: number;
    vat_rate?: number;
    payment_terms?: string;
    delivery_terms?: string;
    terms_and_conditions?: string;
    generated_text?: string;
    currency?: string;
  };
  company: {
    name: string;
    org_number?: string;
  };
  contact: {
    name: string;
    email: string;
  };
  lineItems: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    total: number;
  }>;
  proposalUrl?: string;
}

export interface DocuSealSubmissionPayload {
  template_id: number;
  send_email: boolean;
  submitters: Array<{
    role: string;
    email: string;
    name: string;
    fields: Array<{
      name: string;
      default_value: string;
      readonly: boolean;
    }>;
  }>;
}

/** Format a number as Swedish currency string, e.g. "25 000,00 kr" */
function formatCurrency(amount: number, currency = "SEK"): string {
  const suffix = currency === "SEK" ? " kr" : ` ${currency}`;
  const formatted = amount.toLocaleString("sv-SE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${formatted}${suffix}`;
}

/** Format line items into readable text lines */
function formatLineItems(
  items: ContractInput["lineItems"],
  currency?: string,
): string {
  if (!items.length) return "Inga rader";

  return items
    .map((item) => {
      const qty = Number(item.quantity);
      const price = formatCurrency(Number(item.unit_price), currency);
      const total = formatCurrency(Number(item.total), currency);
      return `${item.description}  |  ${qty} x ${price}  =  ${total}`;
    })
    .join("\n");
}

/** Build DocuSeal submission payload from quote data */
export function buildSubmissionPayload(
  input: ContractInput,
): DocuSealSubmissionPayload {
  const { templateId, quote, company, contact, lineItems, proposalUrl } = input;
  const currency = quote.currency || "SEK";

  const today = new Date().toLocaleDateString("sv-SE");
  const validUntil = quote.valid_until
    ? new Date(quote.valid_until).toLocaleDateString("sv-SE")
    : "";

  // Truncate long text for the contract summary
  const scopeOfWork = quote.generated_text
    ? quote.generated_text.length > 2000
      ? quote.generated_text.substring(0, 2000) + "..."
      : quote.generated_text
    : "Se bifogad offert för fullständig beskrivning.";

  const fields: Array<{
    name: string;
    default_value: string;
    readonly: boolean;
  }> = [
    {
      name: "Offertnummer",
      default_value: quote.quote_number || `#${quote.id}`,
      readonly: true,
    },
    { name: "Datum", default_value: today, readonly: true },
    { name: "Giltig till", default_value: validUntil, readonly: true },
    { name: "Foretag", default_value: company.name, readonly: true },
    {
      name: "Kontaktperson",
      default_value: contact.name,
      readonly: true,
    },
    {
      name: "Uppdragsbeskrivning",
      default_value: scopeOfWork,
      readonly: true,
    },
    {
      name: "Prislista",
      default_value: formatLineItems(lineItems, currency),
      readonly: true,
    },
    {
      name: "Totalt",
      default_value: formatCurrency(quote.total_amount || 0, currency),
      readonly: true,
    },
    {
      name: "Betalningsvillkor",
      default_value: quote.payment_terms || "30 dagar netto",
      readonly: true,
    },
    {
      name: "Villkor",
      default_value:
        quote.terms_and_conditions || "Standardvillkor enligt offert.",
      readonly: true,
    },
  ];

  // Add proposal link if available
  if (proposalUrl) {
    fields.push({
      name: "Offertlank",
      default_value: proposalUrl,
      readonly: true,
    });
  }

  return {
    template_id: templateId,
    send_email: false,
    submitters: [
      {
        role: "First Party",
        email: contact.email,
        name: contact.name,
        fields,
      },
    ],
  };
}
