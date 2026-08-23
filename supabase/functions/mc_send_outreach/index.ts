/**
 * MC outreach-utskick — enda vägen för godkända cold emails.
 *
 * Anropas av mc-applierns email_outreach-hanterare (VPS) EFTER mänskligt
 * godkännande i Mission Control. Auth: x-cron-secret (samma CRON_SECRET
 * som mc_submit). Kontrollerar suppressionslistan, skickar via Resend och
 * loggar i email_sends (så Postmarks svarsmatchning fungerar).
 *
 * Body: { to_email, subject, body, company_id? }
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { OptionsMiddleware } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse, createJsonResponse } from "../_shared/utils.ts";

Deno.serve((req) => OptionsMiddleware(req, handle));

async function handle(req: Request): Promise<Response> {
  // Två godkända anropare: cron med x-cron-secret, eller VPS:ens service-nyckel.
  // Nyckeln jämförs inte mot env (edge-miljön har nytt nyckelformat, VPS:en
  // legacy-JWT) utan VALIDERAS genom att användas mot auth-admin-API:t —
  // bara en äkta service-nyckel passerar det.
  const secret = Deno.env.get("CRON_SECRET");
  const viaSecret =
    Boolean(secret) && req.headers.get("x-cron-secret") === secret;
  let viaServiceRole = false;
  const providedKey = req.headers.get("x-service-key");
  if (!viaSecret && providedKey) {
    const check = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/auth/v1/admin/users?per_page=1`,
      {
        headers: {
          apikey: providedKey,
          Authorization: `Bearer ${providedKey}`,
        },
      },
    );
    viaServiceRole = check.ok;
  }
  if (!viaSecret && !viaServiceRole) {
    return createErrorResponse(401, "Unauthorized");
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return createErrorResponse(400, "Invalid JSON");
  }

  const toEmail = String(body.to_email || "")
    .trim()
    .toLowerCase();
  const subject = String(body.subject || "").trim();
  const text = String(body.body || "").trim();
  const companyId = Number.isFinite(body.company_id) ? body.company_id : null;
  if (!toEmail || !subject || !text) {
    return createErrorResponse(400, "to_email, subject och body krävs");
  }

  const { data: suppressed } = await supabaseAdmin
    .from("mc_outreach_suppressions")
    .select("email")
    .eq("email", toEmail)
    .maybeSingle();
  if (suppressed) {
    return createJsonResponse({ sent: false, suppressed: true });
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) return createErrorResponse(500, "RESEND_API_KEY saknas");
  const fromEmail =
    Deno.env.get("RESEND_FROM_EMAIL") || "noreply@axonadigital.se";

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `Axona Digital <${fromEmail}>`,
      to: [toEmail],
      subject,
      text,
    }),
  });
  if (!resendRes.ok) {
    return createErrorResponse(502, `Resend: ${await resendRes.text()}`);
  }
  const resendJson = await resendRes.json();

  const { error: logError } = await supabaseAdmin.from("email_sends").insert({
    company_id: companyId,
    subject,
    body: text,
    to_email: toEmail,
    from_email: fromEmail,
    status: "sent",
    sent_at: new Date().toISOString(),
    metadata: { source: "mc_outreach", resend_id: resendJson.id ?? null },
  });
  if (logError) {
    return createJsonResponse({
      sent: true,
      logged: false,
      log_error: logError.message,
    });
  }
  return createJsonResponse({ sent: true, logged: true });
}
