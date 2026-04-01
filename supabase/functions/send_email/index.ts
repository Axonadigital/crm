import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

// --- Template variable rendering ---

function renderTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    return variables[key] ?? `{{${key}}}`;
  });
}

// --- Main Handler ---

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req, user) => {
        if (req.method !== "POST") {
          return createErrorResponse(405, "Method Not Allowed");
        }

        try {
          const {
            template_id,
            contact_id,
            variables: customVariables,
          } = await req.json();

          if (!template_id || !contact_id) {
            return createErrorResponse(
              400,
              "Missing template_id or contact_id",
            );
          }

          const resendApiKey = Deno.env.get("RESEND_API_KEY");
          if (!resendApiKey) {
            return createErrorResponse(500, "RESEND_API_KEY not configured");
          }

          // Fetch template
          const { data: template, error: templateError } = await supabaseAdmin
            .from("email_templates")
            .select("*")
            .eq("id", template_id)
            .single();

          if (templateError || !template) {
            return createErrorResponse(404, "Template not found");
          }

          // Fetch contact with email
          const { data: contact, error: contactError } = await supabaseAdmin
            .from("contacts")
            .select("*")
            .eq("id", contact_id)
            .single();

          if (contactError || !contact) {
            return createErrorResponse(404, "Contact not found");
          }

          // Get contact's primary email
          const emailJsonb = contact.email_jsonb as Array<{
            email: string;
            type: string;
          }> | null;
          const primaryEmail = emailJsonb?.[0]?.email;
          if (!primaryEmail) {
            return createErrorResponse(400, "Contact has no email address");
          }

          // Fetch company if linked
          let company = null;
          if (contact.company_id) {
            const { data } = await supabaseAdmin
              .from("companies")
              .select("*")
              .eq("id", contact.company_id)
              .single();
            company = data;
          }

          // Fetch sender (sales) info
          let sender = null;
          if (user) {
            const { data } = await supabaseAdmin
              .from("sales")
              .select("*")
              .eq("user_id", user.id)
              .single();
            sender = data;
          }

          // Build variables for template rendering
          const variables: Record<string, string> = {
            first_name: contact.first_name || "",
            last_name: contact.last_name || "",
            full_name:
              `${contact.first_name || ""} ${contact.last_name || ""}`.trim(),
            email: primaryEmail,
            title: contact.title || "",
            company_name: company?.name || "",
            company_website: company?.website || "",
            company_industry: company?.industry || "",
            sender_name: sender
              ? `${sender.first_name || ""} ${sender.last_name || ""}`.trim()
              : "",
            sender_first_name: sender?.first_name || "",
            sender_email: sender?.email || "",
            ...customVariables,
          };

          // Render template
          const renderedSubject = renderTemplate(template.subject, variables);
          const renderedBody = renderTemplate(template.body, variables);

          // Determine from email
          const fromEmail =
            Deno.env.get("RESEND_FROM_EMAIL") ||
            sender?.email ||
            "noreply@axonadigital.se";

          const fromName = sender
            ? `${sender.first_name} ${sender.last_name}`.trim()
            : "Axona Digital";

          // Insert email_sends record as queued
          const { data: emailSend, error: insertError } = await supabaseAdmin
            .from("email_sends")
            .insert({
              template_id,
              contact_id,
              company_id: contact.company_id || null,
              sales_id: sender?.id || null,
              subject: renderedSubject,
              body: renderedBody,
              to_email: primaryEmail,
              from_email: fromEmail,
              status: "queued",
              metadata: { variables, template_name: template.name },
            })
            .select()
            .single();

          if (insertError || !emailSend) {
            console.error("Insert email_sends error:", insertError);
            return createErrorResponse(500, "Failed to create email record");
          }

          // Send via Resend
          const resendResponse = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${resendApiKey}`,
            },
            body: JSON.stringify({
              from: `${fromName} <${fromEmail}>`,
              to: [primaryEmail],
              subject: renderedSubject,
              html: renderedBody.replace(/\n/g, "<br>"),
              text: renderedBody,
              tags: [
                { name: "category", value: template.category || "outreach" },
                { name: "template_id", value: String(template.id) },
              ],
            }),
          });

          if (!resendResponse.ok) {
            const errorData = await resendResponse.text();
            console.error("Resend API error:", errorData);

            await supabaseAdmin
              .from("email_sends")
              .update({
                status: "bounced",
                metadata: {
                  ...emailSend.metadata,
                  resend_error: errorData,
                },
              })
              .eq("id", emailSend.id);

            return createErrorResponse(502, "Failed to send email via Resend");
          }

          const resendResult = await resendResponse.json();

          // Update with Resend message ID and sent status
          await supabaseAdmin
            .from("email_sends")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
              postmark_message_id: resendResult.id, // reuse column for provider message ID
            })
            .eq("id", emailSend.id);

          return new Response(
            JSON.stringify({
              success: true,
              email_send_id: emailSend.id,
              message_id: resendResult.id,
            }),
            {
              headers: {
                "Content-Type": "application/json",
                ...corsHeaders,
              },
            },
          );
        } catch (error) {
          console.error("send_email error:", error);
          return createErrorResponse(
            500,
            `Failed to send email: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      }),
    ),
  ),
);
