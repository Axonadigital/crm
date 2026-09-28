/**
 * Skickar en outreach-tråd som TEST till en egen adress, via exakt samma
 * väg som motorn: Rasmus Gmail-signatur ur mc_settings, HTML + textdel,
 * bilden som fjärrbild, trådning med In-Reply-To/References. Ingenting
 * loggas i email_sends och ingen enrollment rörs.
 *
 * Bakgrund 2026-09-26: testtråden som skickades via Gmail-kopplingen i
 * Claude tappade alla bilder (kopplingen strippar <img>), så signaturens
 * foto och före/efter-bilden såg ut att saknas fast produktionsvägen
 * skickar dem. Den här funktionen visar hur mejlen FAKTISKT ser ut.
 *
 * Auth: x-cron-secret. Body:
 *   { to: "adress", subject: "ämnesrad",
 *     steps: [{ body: "brödtext", image_url?: "https://…", image_alt?: "…" }] }
 * Steg 2 och framåt får ämnet "Re: …" precis som mallarna. Högst 6 steg,
 * och mottagaren måste vara en axonadigital-adress eller Rasmus egna
 * Gmail: funktionen ska aldrig kunna användas för riktig utkorg.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { OptionsMiddleware } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse, createJsonResponse } from "../_shared/utils.ts";
import { getAccessToken, gmailConfigFromEnv, sendViaGmail } from "../_shared/gmail.ts";
import { fetchMessageIdHeader } from "../_shared/gmailRead.ts";
import { renderWithGmailSignature } from "../_shared/signature.ts";
import { parseSteps } from "./parseSteps.ts";

const ALLOWED_RECIPIENTS = /^(?:[^@\s]+@axonadigital\.(?:se|com)|rasmus\.joonsson(?:\+[^@\s]*)?@gmail\.com)$/i;

type Row = Record<string, unknown>;

async function loadGmailSignature(): Promise<string> {
  const { data } = await supabaseAdmin.from("mc_settings").select("value").eq("key", "outreach_signature").maybeSingle();
  const value = (data?.value ?? null) as Row | null;
  return value && typeof value.html === "string" ? value.html : "";
}

Deno.serve((req) =>
  OptionsMiddleware(req, async (req) => {
    const cronSecret = Deno.env.get("CRON_SECRET");
    const provided = req.headers.get("x-cron-secret");
    if (!cronSecret || provided !== cronSecret) return createErrorResponse(401, "Unauthorized");
    if (req.method !== "POST") return createErrorResponse(405, "Method not allowed");

    let body: Row;
    try {
      body = (await req.json()) as Row;
    } catch {
      return createErrorResponse(400, "Ogiltig JSON");
    }
    const to = typeof body.to === "string" ? body.to.trim() : "";
    if (!ALLOWED_RECIPIENTS.test(to)) return createErrorResponse(400, "Mottagaren måste vara en egen adress");
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    if (!subject) return createErrorResponse(400, "subject saknas");
    const parsed = parseSteps(body.steps);
    if ("error" in parsed) return createErrorResponse(400, parsed.error);

    const gmail = gmailConfigFromEnv((k) => Deno.env.get(k));
    if (!gmail) return createErrorResponse(500, "Gmail är inte konfigurerat");

    try {
      const signature = await loadGmailSignature();
      const token = await getAccessToken(gmail);
      const sent: { step: number; message_id: string; thread_id: string }[] = [];
      let threadId: string | undefined;
      const chain: string[] = [];
      for (const [i, step] of parsed.steps.entries()) {
        const rendered = renderWithGmailSignature(step.body, signature, { imageUrl: step.imageUrl, imageAlt: step.imageAlt });
        const result = await sendViaGmail(gmail, {
          to,
          subject: i === 0 ? subject : `Re: ${subject}`,
          text: rendered.text,
          html: rendered.html,
          threadId,
          inReplyTo: chain.length > 0 ? chain[chain.length - 1] : undefined,
          references: chain.length > 0 ? chain.join(" ") : undefined,
        });
        threadId = result.threadId;
        const header = await fetchMessageIdHeader(token, result.messageId);
        if (header) chain.push(header);
        sent.push({ step: i + 1, message_id: result.messageId, thread_id: result.threadId });
      }
      return createJsonResponse({ ok: true, to, from: gmail.fromEmail, signature: signature.length > 0, sent });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("send_outreach_test:", message);
      return createErrorResponse(500, message);
    }
  }));
