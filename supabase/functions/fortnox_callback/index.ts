/**
 * Fortnox OAuth redirect target. Public by necessity — Fortnox redirects the
 * browser here with ?code=&state=, and a browser navigation carries no JWT.
 *
 * The `state` row is what authenticates this call: it was created by
 * fortnox_connect for a signed-in user, it is single-use, and it expires. A
 * code without a matching unconsumed state is rejected.
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

function page(title: string, message: string, ok: boolean): Response {
  return new Response(
    `<!doctype html>
<html lang="sv">
  <head><meta charset="utf-8" /><title>${title}</title></head>
  <body style="font-family: system-ui, sans-serif; padding: 3rem; max-width: 34rem; margin: 0 auto;">
    <h1 style="color: ${ok ? "#15803d" : "#b91c1c"}; font-size: 1.25rem;">${title}</h1>
    <p style="color: #334155; line-height: 1.6;">${message}</p>
    <p style="color: #64748b; font-size: 0.875rem;">Du kan stänga det här fönstret.</p>
  </body>
</html>`,
    {
      status: ok ? 200 : 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    },
  );
}

async function consumeState(state: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("integration_oauth_states")
    .select("state, created_at, consumed_at")
    .eq("state", state)
    .eq("provider", FORTNOX_PROVIDER)
    .maybeSingle();

  if (error || !data || data.consumed_at) return false;

  if (Date.now() - Date.parse(data.created_at) > STATE_TTL_MS) return false;

  // Mark consumed before the exchange: a replayed code must not get a second
  // shot at the token endpoint.
  const { error: updateError } = await supabaseAdmin
    .from("integration_oauth_states")
    .update({ consumed_at: new Date().toISOString() })
    .eq("state", state)
    .is("consumed_at", null);

  return !updateError;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return page(
      "Kopplingen avbröts",
      `Fortnox svarade: ${oauthError}. Starta om kopplingen från Inställningar i CRM:et.`,
      false,
    );
  }

  if (!code || !state) {
    return page(
      "Ogiltigt anrop",
      "Fortnox skickade ingen kod. Starta om kopplingen från Inställningar i CRM:et.",
      false,
    );
  }

  if (!(await consumeState(state))) {
    return page(
      "Ogiltig eller förbrukad förfrågan",
      "State-parametern saknas, har redan använts eller är för gammal. Starta om kopplingen från Inställningar i CRM:et.",
      false,
    );
  }

  try {
    const connection = await exchangeAuthorizationCode(code);

    const client = createFortnoxClient();
    const info = await client.get<{
      CompanyInformation?: { CompanyName?: string };
    }>("/3/companyinformation");

    const companyName = info.CompanyInformation?.CompanyName ?? "okänt företag";
    const mode = connection.tenant_id
      ? "Servicekonto aktivt — inloggning behövs aldrig igen."
      : "OBS: inget tenant-id hittades i tokenen, så kopplingen använder refresh-token som måste förnyas inom 45 dagar. Kontrollera loggarna.";

    return page(
      "Fortnox är kopplat",
      `CRM:et är nu anslutet till <strong>${companyName}</strong>. ${mode}`,
      true,
    );
  } catch (error) {
    console.error("fortnox_callback exchange failed:", error);
    return page(
      "Kopplingen misslyckades",
      "Kunde inte växla in koden mot en token. Kontrollera FORTNOX_CLIENT_ID, FORTNOX_CLIENT_SECRET och FORTNOX_REDIRECT_URI i Supabase secrets.",
      false,
    );
  }
});
