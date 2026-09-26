/**
 * site_event — mottagare för förfrågningar och samtal från kundsajterna.
 *
 * Sajten postar { key, kind: "form" | "call" | "email", page? } när ett
 * formulär skickas eller någon trycker på ett tel:/mailto:-nummer. Nyckeln
 * (site_event_keys) pekar ut företaget. Raden hamnar i site_events och
 * summeras per kalendermånad in i website_snapshots.engagement av
 * analyze_website, därifrån till månadsrapporten och resultatkortet.
 *
 * Ingen JWT: anropas från webbläsaren på kundens domän. Nyckeln är inte
 * hemlig — det värsta någon kan göra med den är att skriva falska händelser
 * för ett företag, och det begränsas av dygnstaket per nyckel (500).
 * Deploy med --no-verify-jwt.
 *
 * Snippet för sajten: se README.md i den här mappen.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { MAX_EVENTS_PER_DAY, parseSiteEvent } from "../_shared/engagement.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": "86400",
};

const reply = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { ...CORS, ...(body === undefined ? {} : { "content-type": "application/json" }) },
  });

async function readJson(req: Request): Promise<unknown> {
  // sendBeacon skickar text/plain; tolka alltid som JSON.
  const text = await req.text();
  if (text.length > 4_096) throw new Error("för stor body");
  return text ? JSON.parse(text) : {};
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return reply(204);
  if (req.method !== "POST") return reply(405, { error: "POST krävs" });

  let event;
  try {
    event = parseSiteEvent(await readJson(req));
  } catch (e) {
    return reply(400, { error: e instanceof Error ? e.message : "ogiltig body" });
  }

  const { data: key } = await supabaseAdmin
    .from("site_event_keys")
    .select("company_id, active")
    .eq("key", event.key)
    .maybeSingle();
  if (!key || key.active !== true) return reply(403, { error: "okänd nyckel" });

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const { count } = await supabaseAdmin
    .from("site_events")
    .select("id", { count: "exact", head: true })
    .eq("company_id", key.company_id)
    .gte("occurred_at", dayStart.toISOString());
  if ((count ?? 0) >= MAX_EVENTS_PER_DAY) return reply(429, { error: "dygnstaket nått" });

  const { error } = await supabaseAdmin.from("site_events").insert({
    company_id: key.company_id,
    kind: event.kind,
    page: event.page,
    meta: { ua: (req.headers.get("user-agent") ?? "").slice(0, 200) },
  });
  if (error) {
    console.error("site_event insert failed:", error.message);
    return reply(500, { error: "kunde inte spara" });
  }
  return reply(204);
});
