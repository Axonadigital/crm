import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse, createJsonResponse } from "../_shared/utils.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { gmailConfigFromEnv, getAccessToken } from "../_shared/gmail.ts";
import {
  decodeHtmlPart,
  fetchMessage,
  fetchSendAsAliases,
  searchMessages,
  signatureForAddress,
} from "../_shared/gmailRead.ts";
import {
  extractSignatureHtml,
  htmlSignatureToText,
} from "../_shared/signature.ts";

/**
 * Hämtar Rasmus signatur ur Gmail och lägger den i mc_settings.
 *
 * Varför inte tvärtom? Gmails signatur läggs på av KLIENTEN när någon skriver
 * i webbläsaren — inte av servern vid sändning. Vi skickar färdig MIME direkt
 * till servern, så en signatur i inställningarna kommer aldrig med av sig
 * själv. Att sätta den via API:t hade alltså inte gjort någon nytta.
 *
 * Att LÄSA den gör däremot stor nytta: Rasmus designar signaturen i Gmail som
 * vanligt, och den följer med hit. Ett ställe att underhålla, inte två.
 *
 * TVÅ KÄLLOR, i den ordningen:
 *
 *  1. sendAs-inställningen. Fungerar bara om signaturen ligger i API:ts egen
 *     slot. Gmails nyare namngivna flersignaturfunktion syns INTE där — API:t
 *     hanterar en signatur per adress, skild från listan i webbgränssnittet.
 *
 *  2. Ett mejl Rasmus skickat till sig själv med bara signaturen i. Det är
 *     vägen som faktiskt fungerar när han designat signaturen i webbläsaren:
 *     vi läser HTML-delen ur meddelandet och plockar ut signaturblocket.
 *
 * Signaturen sparas i mc_settings så sekvensmotorn slipper ett API-anrop per
 * utskick. Kör den här funktionen igen när signaturen ändrats i Gmail.
 *
 * Auth: x-cron-secret. Kräver scopet gmail.settings.basic.
 */

const SETTING_KEY = "outreach_signature";

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) => {
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

    const gmail = gmailConfigFromEnv((k) => Deno.env.get(k));
    if (!gmail) {
      return createErrorResponse(500, "Gmail är inte konfigurerat");
    }

    try {
      const accessToken = await getAccessToken(gmail);
      const aliases = await fetchSendAsAliases(accessToken);
      let html = signatureForAddress(aliases, gmail.fromEmail);
      let source = "gmail_send_as";

      // Reserv: mejlet Rasmus skickat till sig själv. Nyast först, och bara
      // det senaste dygnets — annars riskerar vi att plocka en gammal version
      // av signaturen han redan bytt ut.
      if (!html) {
        const query = `from:${gmail.fromEmail} subject:signatur newer_than:2d`;
        const ids = await searchMessages(accessToken, query, 3);
        for (const id of ids) {
          const message = await fetchMessage(accessToken, id);
          const candidate = extractSignatureHtml(
            decodeHtmlPart(message?.payload),
          );
          if (candidate) {
            html = candidate;
            source = "gmail_message";
            break;
          }
        }
      }

      if (!html) {
        // Inget fel — men värt att säga rakt ut, annars ser det ut att ha
        // fungerat medan mejlen fortsätter gå ut osignerade.
        return createJsonResponse({
          ok: false,
          reason:
            "Hittade ingen signatur. Sätt den i Gmails inställningar, eller " +
            `skicka ett mejl från ${gmail.fromEmail} till dig själv med ordet ` +
            '"signatur" i ämnesraden och bara signaturen i brödtexten.',
          from_email: gmail.fromEmail,
          addresses: aliases.map((a) => ({
            email: a.sendAsEmail,
            has_signature: a.signature !== "",
          })),
        });
      }

      const { error } = await supabaseAdmin.from("mc_settings").upsert({
        key: SETTING_KEY,
        value: {
          html,
          text: htmlSignatureToText(html),
          from_email: gmail.fromEmail,
          source,
          synced_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      });
      if (error) {
        return createErrorResponse(500, `Kunde inte spara: ${error.message}`);
      }

      return createJsonResponse({
        ok: true,
        source,
        from_email: gmail.fromEmail,
        html_length: html.length,
        images: (html.match(/<img/gi) || []).length,
        text_preview: htmlSignatureToText(html).slice(0, 300),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("sync_gmail_signature error:", message);
      return createErrorResponse(500, message);
    }
  }),
);
