import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

/**
 * Process Sequences Edge Function
 *
 * Triggered by external cron (e.g. cron-job.org, GitHub Actions).
 * Finds all active enrollments with next_action_at <= now(),
 * executes the current step, and advances or completes the enrollment.
 *
 * Auth: Uses a shared secret (CRON_SECRET) since there's no user context.
 */

const BATCH_SIZE = 50;

// --- Step Executors ---

async function executeSendEmail(
  step: Record<string, unknown>,
  enrollment: Record<string, unknown>,
): Promise<{ success: boolean; error?: string }> {
  const templateId = step.template_id;
  if (!templateId) {
    return { success: false, error: "No template_id on step" };
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  // Fetch template
  const { data: template, error: templateErr } = await supabaseAdmin
    .from("email_templates")
    .select("*")
    .eq("id", templateId)
    .single();

  if (templateErr || !template) {
    return { success: false, error: "Template not found" };
  }

  // Fetch contact
  const { data: contact, error: contactErr } = await supabaseAdmin
    .from("contacts")
    .select("*")
    .eq("id", enrollment.contact_id)
    .single();

  if (contactErr || !contact) {
    return { success: false, error: "Contact not found" };
  }

  const emailJsonb = contact.email_jsonb as Array<{
    email: string;
    type: string;
  }> | null;
  const primaryEmail = emailJsonb?.[0]?.email;
  if (!primaryEmail) {
    return { success: false, error: "Contact has no email" };
  }

  // Fetch company if linked
  let company = null;
  if (contact.company_id) {
    const { data } = await supabaseAdmin
      .from("companies")
      .select("name, website, industry")
      .eq("id", contact.company_id)
      .single();
    company = data;
  }

  // Build variables
  const variables: Record<string, string> = {
    first_name: contact.first_name || "",
    last_name: contact.last_name || "",
    full_name: `${contact.first_name || ""} ${contact.last_name || ""}`.trim(),
    email: primaryEmail,
    title: contact.title || "",
    company_name: company?.name || "",
    company_website: company?.website || "",
    company_industry: company?.industry || "",
  };

  // Render
  const renderTemplate = (tmpl: string) =>
    tmpl.replace(
      /\{\{(\w+)\}\}/g,
      (_m: string, key: string) => variables[key] ?? `{{${key}}}`,
    );

  const renderedSubject = renderTemplate(template.subject);
  const renderedBody = renderTemplate(template.body);
  const fromEmail =
    Deno.env.get("RESEND_FROM_EMAIL") || "noreply@axonadigital.se";

  // Log in email_sends
  const { data: emailSend, error: insertErr } = await supabaseAdmin
    .from("email_sends")
    .insert({
      template_id: templateId,
      contact_id: enrollment.contact_id,
      company_id: contact.company_id || null,
      subject: renderedSubject,
      body: renderedBody,
      to_email: primaryEmail,
      from_email: fromEmail,
      status: "queued",
      metadata: {
        sequence_id: enrollment.sequence_id,
        sequence_step: enrollment.current_step,
        enrollment_id: enrollment.id,
      },
    })
    .select()
    .single();

  if (insertErr || !emailSend) {
    return { success: false, error: "Failed to create email_sends record" };
  }

  // Send via Resend
  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: `Axona Digital <${fromEmail}>`,
      to: [primaryEmail],
      subject: renderedSubject,
      html: renderedBody.replace(/\n/g, "<br>"),
      text: renderedBody,
      tags: [
        {
          name: "sequence",
          value: `${enrollment.sequence_id}_step_${enrollment.current_step}`,
        },
      ],
    }),
  });

  if (!resendResponse.ok) {
    const errText = await resendResponse.text();
    await supabaseAdmin
      .from("email_sends")
      .update({
        status: "bounced",
        metadata: { ...emailSend.metadata, resend_error: errText },
      })
      .eq("id", emailSend.id);
    return { success: false, error: `Resend error: ${errText}` };
  }

  const resendResult = await resendResponse.json();
  await supabaseAdmin
    .from("email_sends")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      postmark_message_id: resendResult.id,
    })
    .eq("id", emailSend.id);

  return { success: true };
}

async function executeCreateTask(
  step: Record<string, unknown>,
  enrollment: Record<string, unknown>,
): Promise<{ success: boolean; error?: string }> {
  const config = (step.action_config || {}) as Record<string, unknown>;

  const { error } = await supabaseAdmin.from("tasks").insert({
    contact_id: enrollment.contact_id,
    type: config.task_type || "Email",
    text:
      config.task_text ||
      `Sekvens uppföljning (steg ${enrollment.current_step})`,
    due_date: new Date(
      Date.now() + ((config.due_days as number) || 1) * 86400000,
    ).toISOString(),
    done_date: null,
  });

  if (error) {
    return { success: false, error: `Failed to create task: ${error.message}` };
  }
  return { success: true };
}

async function executeUpdateLeadStatus(
  step: Record<string, unknown>,
  enrollment: Record<string, unknown>,
): Promise<{ success: boolean; error?: string }> {
  const config = (step.action_config || {}) as Record<string, unknown>;
  const newStatus = config.lead_status as string;

  if (!newStatus || !enrollment.company_id) {
    return {
      success: false,
      error: "Missing lead_status or company_id",
    };
  }

  const { error } = await supabaseAdmin
    .from("companies")
    .update({ lead_status: newStatus })
    .eq("id", enrollment.company_id);

  if (error) {
    return {
      success: false,
      error: `Failed to update lead status: ${error.message}`,
    };
  }
  return { success: true };
}

// --- Main Handler ---

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) => {
    // Auth: check CRON_SECRET header (no JWT for cron jobs)
    const cronSecret = Deno.env.get("CRON_SECRET");
    const providedSecret =
      req.headers.get("x-cron-secret") ||
      new URL(req.url).searchParams.get("secret");

    if (!cronSecret || providedSecret !== cronSecret) {
      return createErrorResponse(401, "Unauthorized");
    }

    if (req.method !== "POST") {
      return createErrorResponse(405, "Method Not Allowed");
    }

    try {
      const now = new Date().toISOString();

      // Find all active enrollments with due actions
      const { data: dueEnrollments, error: fetchErr } = await supabaseAdmin
        .from("sequence_enrollments")
        .select("*, sequences!inner(status)")
        .eq("status", "active")
        .lte("next_action_at", now)
        .eq("sequences.status", "active")
        .limit(BATCH_SIZE);

      if (fetchErr) {
        console.error("Fetch enrollments error:", fetchErr);
        return createErrorResponse(500, "Failed to fetch enrollments");
      }

      if (!dueEnrollments || dueEnrollments.length === 0) {
        return new Response(
          JSON.stringify({ processed: 0, message: "No due enrollments" }),
          { headers: { "Content-Type": "application/json", ...corsHeaders } },
        );
      }

      const results: Array<{
        enrollment_id: number;
        step: number;
        action: string;
        success: boolean;
        error?: string;
      }> = [];

      for (const enrollment of dueEnrollments) {
        const nextStep = enrollment.current_step + 1;

        // Fetch the next step for this sequence
        const { data: step, error: stepErr } = await supabaseAdmin
          .from("sequence_steps")
          .select("*")
          .eq("sequence_id", enrollment.sequence_id)
          .eq("step_number", nextStep)
          .single();

        if (stepErr || !step) {
          // No more steps — complete the enrollment
          await supabaseAdmin
            .from("sequence_enrollments")
            .update({
              status: "completed",
              completed_at: now,
              next_action_at: null,
            })
            .eq("id", enrollment.id);

          results.push({
            enrollment_id: enrollment.id,
            step: nextStep,
            action: "completed",
            success: true,
          });
          continue;
        }

        // Execute the step action
        let result: { success: boolean; error?: string };

        switch (step.action_type) {
          case "send_email":
            result = await executeSendEmail(step, enrollment);
            break;
          case "create_task":
            result = await executeCreateTask(step, enrollment);
            break;
          case "update_lead_status":
            result = await executeUpdateLeadStatus(step, enrollment);
            break;
          default:
            result = {
              success: false,
              error: `Unknown action: ${step.action_type}`,
            };
        }

        if (result.success) {
          // Check if there's a next step after this one
          const { data: futureStep } = await supabaseAdmin
            .from("sequence_steps")
            .select("step_number, delay_days, delay_hours")
            .eq("sequence_id", enrollment.sequence_id)
            .eq("step_number", nextStep + 1)
            .single();

          if (futureStep) {
            // Schedule next step
            const delayMs =
              ((futureStep.delay_days || 0) * 86400 +
                (futureStep.delay_hours || 0) * 3600) *
              1000;
            const nextActionAt = new Date(Date.now() + delayMs).toISOString();

            await supabaseAdmin
              .from("sequence_enrollments")
              .update({
                current_step: nextStep,
                next_action_at: nextActionAt,
              })
              .eq("id", enrollment.id);
          } else {
            // This was the last step — complete
            await supabaseAdmin
              .from("sequence_enrollments")
              .update({
                current_step: nextStep,
                status: "completed",
                completed_at: now,
                next_action_at: null,
              })
              .eq("id", enrollment.id);
          }
        } else {
          // On failure (e.g. bounce), pause the enrollment
          await supabaseAdmin
            .from("sequence_enrollments")
            .update({
              status: "paused",
              paused_at: now,
            })
            .eq("id", enrollment.id);
        }

        results.push({
          enrollment_id: enrollment.id,
          step: nextStep,
          action: step.action_type,
          success: result.success,
          error: result.error,
        });
      }

      return new Response(
        JSON.stringify({
          processed: results.length,
          results,
        }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    } catch (error) {
      console.error("process_sequences error:", error);
      return createErrorResponse(
        500,
        `Failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }),
);
