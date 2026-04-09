import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { buildSubmissionPayload } from "../_shared/contractFields.ts";

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) => {
    if (req.method !== "POST")
      return createErrorResponse(405, "Method Not Allowed");

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return createErrorResponse(401, "Missing authorization token");

    let isServiceRole = false;
    try {
      const payloadB64 = token.split(".")[1];
      if (payloadB64) {
        const payload = JSON.parse(atob(payloadB64));
        isServiceRole = payload.role === "service_role";
      }
    } catch {
      /* not a JWT */
    }

    if (!isServiceRole) {
      try {
        const { data: userData } = await supabaseAdmin.auth.getUser(token);
        if (!userData?.user) return createErrorResponse(401, "Unauthorized");
      } catch {
        return createErrorResponse(401, "Unauthorized");
      }
    }

    try {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return createErrorResponse(400, "Invalid JSON body");
      }

      if (typeof body !== "object" || body === null || Array.isArray(body)) {
        return createErrorResponse(400, "Request body must be a JSON object");
      }

      const { quote_id } = body as Record<string, unknown>;

      if (!quote_id || typeof quote_id !== "string") {
        return createErrorResponse(400, "Missing or invalid quote_id");
      }

      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(quote_id)) {
        return createErrorResponse(400, "quote_id must be a valid UUID");
      }

      const docusealApiKey = Deno.env.get("DOCUSEAL_API_KEY");
      const docusealTemplateId = Deno.env.get("DOCUSEAL_TEMPLATE_ID");
      if (!docusealApiKey || !docusealTemplateId) {
        return createErrorResponse(
          500,
          "DOCUSEAL_API_KEY or DOCUSEAL_TEMPLATE_ID not configured",
        );
      }

      const docusealBaseUrl =
        Deno.env.get("DOCUSEAL_BASE_URL") || "https://sign.axonadigital.se";
      const supabase = supabaseAdmin;

      const { data: quote, error: quoteError } = await supabase
        .from("quotes")
        .select("*")
        .eq("id", quote_id)
        .single();
      if (quoteError || !quote)
        return createErrorResponse(404, "Quote not found");

      let signerEmail = "";
      let signerName = "";
      if (quote.contact_id) {
        const { data: contact } = await supabase
          .from("contacts")
          .select("*")
          .eq("id", quote.contact_id)
          .single();
        if (contact) {
          signerName = `${contact.first_name} ${contact.last_name}`.trim();
          const emails = contact.email_jsonb || [];
          if (emails.length > 0) signerEmail = emails[0].email;
        }
      }
      if (!signerEmail)
        return createErrorResponse(400, "No email found for the contact");

      let companyName = "";
      let companyOrgNumber = "";
      if (quote.company_id) {
        const { data: company } = await supabase
          .from("companies")
          .select("name, org_number")
          .eq("id", quote.company_id)
          .single();
        companyName = company?.name || "";
        companyOrgNumber = company?.org_number || "";
      }

      const { data: lineItems } = await supabase
        .from("quote_line_items")
        .select("description, quantity, unit_price, total")
        .eq("quote_id", quote.id)
        .order("sort_order");

      const crmPublicUrl =
        Deno.env.get("CRM_PUBLIC_URL") ||
        Deno.env.get("ALLOWED_ORIGIN") ||
        "http://localhost:5173";
      const proposalUrl = `${crmPublicUrl}/quote.html?id=${quote.id}`;

      const submissionPayload = buildSubmissionPayload({
        templateId: Number(docusealTemplateId),
        quote: {
          id: quote.id,
          quote_number: quote.quote_number,
          valid_until: quote.valid_until,
          total_amount: quote.total_amount,
          subtotal: quote.subtotal,
          vat_amount: quote.vat_amount,
          vat_rate: quote.vat_rate,
          payment_terms: quote.payment_terms,
          delivery_terms: quote.delivery_terms,
          terms_and_conditions: quote.terms_and_conditions,
          generated_text: quote.generated_text,
          currency: quote.currency,
        },
        company: { name: companyName, org_number: companyOrgNumber },
        contact: { name: signerName, email: signerEmail },
        lineItems: lineItems || [],
        proposalUrl,
      });

      const docusealResponse = await fetch(
        `${docusealBaseUrl}/api/submissions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Auth-Token": docusealApiKey,
          },
          body: JSON.stringify(submissionPayload),
        },
      );

      if (!docusealResponse.ok) {
        const errorText = await docusealResponse.text();
        console.error("DocuSeal submission error:", errorText);
        return createErrorResponse(502, "Failed to create signing submission");
      }

      const submissionResult = await docusealResponse.json();
      const submitters = Array.isArray(submissionResult)
        ? submissionResult
        : [submissionResult];
      const submissionId = submitters[0]?.submission_id || submitters[0]?.id;
      // Customer's signing slug is the last submitter (Axona is first, already completed)
      const customerSubmitter = submitters[submitters.length - 1];
      const signingSlug = customerSubmitter?.slug;
      const signingUrl = signingSlug
        ? `${docusealBaseUrl}/s/${signingSlug}`
        : null;

      await supabase
        .from("quotes")
        .update({
          docuseal_submission_id: String(submissionId),
          docuseal_signing_url: signingUrl,
          status: "sent",
          sent_at: new Date().toISOString(),
        })
        .eq("id", quote_id);

      return new Response(
        JSON.stringify({
          submission_id: submissionId,
          signing_url: signingUrl,
        }),
        {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    } catch (error) {
      console.error("send_quote_for_signing error:", error);
      return createErrorResponse(500, "Failed to send quote for signing");
    }
  }),
);
