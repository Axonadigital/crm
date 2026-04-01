import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req, _user) => {
        if (req.method !== "POST") {
          return createErrorResponse(405, "Method Not Allowed");
        }

        try {
          const { quote_id } = await req.json();
          if (!quote_id) {
            return createErrorResponse(400, "Missing quote_id");
          }

          const docusealApiKey = Deno.env.get("DOCUSEAL_API_KEY");
          if (!docusealApiKey) {
            return createErrorResponse(500, "DOCUSEAL_API_KEY not configured");
          }

          const docusealBaseUrl =
            Deno.env.get("DOCUSEAL_BASE_URL") || "https://api.docuseal.com";

          const supabase = supabaseAdmin;

          // Fetch quote
          const { data: quote, error: quoteError } = await supabase
            .from("quotes")
            .select("*")
            .eq("id", quote_id)
            .single();

          if (quoteError || !quote) {
            return createErrorResponse(404, "Quote not found");
          }

          if (!quote.pdf_url) {
            return createErrorResponse(
              400,
              "Quote has no PDF — generate PDF first",
            );
          }

          // Fetch contact email
          let signerEmail = "";
          let signerName = "";
          if (quote.contact_id) {
            const { data: contact } = await supabase
              .from("contacts")
              .select("*")
              .eq("id", quote.contact_id)
              .single();

            if (contact) {
              signerName = `${contact.first_name} ${contact.last_name}`;
              // Get first email from email_jsonb
              const emails = contact.email_jsonb || [];
              if (emails.length > 0) {
                signerEmail = emails[0].email;
              }
            }
          }

          if (!signerEmail) {
            return createErrorResponse(
              400,
              "No email found for the contact — add an email to the contact first",
            );
          }

          // Validate pdf_url to prevent SSRF
          const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
          const apiExternalUrl = Deno.env.get("API_EXTERNAL_URL") || "";
          const allowedPrefixes = [
            `${supabaseUrl}/storage/`,
            `${apiExternalUrl}/storage/`,
          ].filter(Boolean);

          const isAllowedUrl = allowedPrefixes.some((prefix) =>
            quote.pdf_url.startsWith(prefix),
          );
          if (!isAllowedUrl) {
            return createErrorResponse(
              400,
              "Invalid PDF URL — must be a Supabase Storage URL",
            );
          }

          // Step 1: Create a DocuSeal template from the HTML document URL
          const templateResponse = await fetch(
            `${docusealBaseUrl}/api/templates/html`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Auth-Token": docusealApiKey,
              },
              body: JSON.stringify({
                html: await fetch(quote.pdf_url).then((r) => r.text()),
                name: `Offert ${quote.quote_number || quote.id}`,
              }),
            },
          );

          if (!templateResponse.ok) {
            const errorText = await templateResponse.text();
            console.error("DocuSeal template creation error:", errorText);
            return createErrorResponse(
              502,
              "Failed to create signing template",
            );
          }

          const template = await templateResponse.json();

          // Step 2: Create a submission (signing request) from the template
          const submissionPayload = {
            template_id: template.id,
            send_email: true,
            submitters: [
              {
                role: "First Party",
                email: signerEmail,
                name: signerName,
              },
            ],
          };

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
            return createErrorResponse(
              502,
              "Failed to create signing submission",
            );
          }

          const submissionResult = await docusealResponse.json();
          const submissionId = submissionResult[0]?.id || submissionResult.id;

          // Update quote with Docuseal info
          await supabase
            .from("quotes")
            .update({
              docuseal_submission_id: String(submissionId),
              status: "sent",
              sent_at: new Date().toISOString(),
            })
            .eq("id", quote_id);

          // Extract signing URL from response
          const signingUrl = Array.isArray(submissionResult)
            ? submissionResult[0]?.embed_src || submissionResult[0]?.signing_url
            : submissionResult.signing_url;

          return new Response(
            JSON.stringify({
              submission_id: submissionId,
              signing_url: signingUrl,
            }),
            {
              headers: {
                "Content-Type": "application/json",
                ...corsHeaders,
              },
            },
          );
        } catch (error) {
          console.error("send_quote_for_signing error:", error);
          return createErrorResponse(
            500,
            `Failed to send quote for signing: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      }),
    ),
  ),
);
