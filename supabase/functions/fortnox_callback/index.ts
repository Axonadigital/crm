/**
 * Fortnox OAuth redirect target. Public by necessity — Fortnox redirects the
 * browser here with ?code=&state=, and a browser navigation carries no JWT.
 *
 * The `state` row is what authenticates this call: it was created by
 * fortnox_connect for a signed-in administrator, it is single-use, and it
 * expires. A code without a matching unconsumed state is rejected.
 *
 * Nothing from the query string is ever echoed into the response — this page is
 * unauthenticated and renders HTML, so reflecting input would be a free XSS.
 * Values that do reach the page (the company name from Fortnox) are escaped.
 *
 * Runs once, ever. After this the integration mints its own tokens.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import {
  createFortnoxClient,
  exchangeAuthorizationCode,
  FORTNOX_PROVIDER,
} from "../_shared/fortnox/index.ts";

const STATE_TTL_MS = 15 * 60 * 1000;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function page(title: string, message: string, ok: boolean): Response {
  return new Response(
    `<!doctype html>
<html lang="sv">
  <head><meta charset="utf-8" /><title>${escapeHtml(title)}</title></head>
  <body style="font-family: system-ui, sans-serif; padding: 3rem; max-width: 34rem; margin: 0 auto;">
    <h1 style="color: ${ok ? "#15803d" : "#b91c1c"}; font-size: 1.25rem;">${escapeHtml(title)}</h1>
    <p style="color: #334155; line-height: 1.6;">${message}</p>
    <p style="color: #64748b; font-size: 0.875rem;">Du kan stänga det här fönstret.</p>
  </body>
</html>`,
    {
      status: ok ? 200 : 400,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        // Nothing on this page needs to load or execute anything.
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      },
    },
  );
}

type ConsumedState = { created_by: number | null };

/**
 * Validates and burns the state in one step. Marking it consumed before the
 * token exchange means a replayed code cannot get a second attempt.
 */
async function consumeState(state: string): Promise<ConsumedState | null> {
  const { data, error } = await supabaseAdmin
    .from("integration_oauth_states")
    .select("state, created_at, consumed_at, created_by")
    .eq("state", state)
    .eq("provider", FORTNOX_PROVIDER)
    .maybeSingle();

  if (error || !data || data.consumed_at) return null;
  if (Date.now() - Date.parse(data.created_at) > STATE_TTL_MS) return null;

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("integration_oauth_states")
    .update({ consumed_at: new Date().toISOString() })
    .eq("state", state)
    .is("consumed_at", null)
    .select("created_by")
    .maybeSingle();

  // No row updated means someone else burned it between our read and write.
  if (updateError || !updated) return null;

  return { created_by: updated.created_by ?? null };
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const restart = "Starta om kopplingen från Inställningar i CRM:et.";

  if (oauthError) {
    // Logged, never rendered: this value is attacker-controlled.
    console.warn("fortnox_callback: authorization denied by Fortnox");
    return page(
      "Kopplingen avbröts",
      `Fortnox nekade kopplingen. ${restart}`,
      false,
    );
  }

  if (!code || !state) {
    return page(
      "Ogiltigt anrop",
      `Fortnox skickade ingen kod. ${restart}`,
      false,
    );
  }

  const consumed = await consumeState(state);
  if (!consumed) {
    return page(
      "Ogiltig eller förbrukad förfrågan",
      `State-parametern saknas, har redan använts eller är för gammal. ${restart}`,
      false,
    );
  }

  try {
    const connection = await exchangeAuthorizationCode(
      code,
      consumed.created_by,
    );

    const client = createFortnoxClient();
    const info = await client.get<{
      CompanyInformation?: { CompanyName?: string };
    }>("/3/companyinformation");

    const companyName = escapeHtml(
      info.CompanyInformation?.CompanyName ?? "okänt företag",
    );
    const mode = connection.tenant_id
      ? "Servicekonto aktivt — inloggning behövs aldrig igen."
      : "OBS: inget tenant-id hittades i tokenen, så kopplingen vilar på en refresh-token som måste förnyas inom 45 dagar.";

    return page(
      "Fortnox är kopplat",
      `CRM:et är nu anslutet till <strong>${companyName}</strong>. ${mode}`,
      true,
    );
  } catch (error) {
    // Only the shape of the failure, never the body — Fortnox echoes submitted
    // codes back in error_description and this lands in the function logs.
    console.error("fortnox_callback exchange failed:", {
      status: (error as { status?: number })?.status,
      code: (error as { code?: number })?.code,
    });
    return page(
      "Kopplingen misslyckades",
      "Kunde inte växla in koden mot en token. Kontrollera FORTNOX_CLIENT_ID, FORTNOX_CLIENT_SECRET och FORTNOX_REDIRECT_URI i Supabase secrets.",
      false,
    );
  }
});
