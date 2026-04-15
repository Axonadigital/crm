import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

/**
 * Serve Quote — returns quote HTML and signing URL as JSON.
 *
 * GET /serve_quote?id=<quote_id>[&token=<approval_token>]
 *
 * Supabase Edge Functions override Content-Type to text/plain for
 * HTML responses (security policy), so we return JSON and let the
 * Vercel-hosted quote.html viewer render it via iframe srcdoc.
 *
 * Security model (post-hotfix 2026-04-15):
 *  1. Edit-token strip runs UNCONDITIONALLY. Customers must never receive
 *     the editor credential regardless of how they reached the page.
 *  2. Access enforcement (requiring ?token= that matches approval_token)
 *     is gated behind the QUOTE_PUBLIC_TOKEN_ENFORCEMENT env flag.
 *     When the flag is "on", public quote links without a valid token
 *     return 403 and the IDOR vulnerability is closed. When the flag is
 *     off (default), any quote is reachable by id alone — the same
 *     behavior as before this hotfix — but the editor leak is still
 *     fixed because of guarantee (1).
 *
 *  Why the flag: there are already active, unsigned quotes in production
 *  whose public URLs were sent to customers WITHOUT a token. Activating
 *  enforcement immediately would break those links. The flag lets us
 *  deploy the hotfix now and flip enforcement on later, after a preflight
 *  check confirms no active tokenless links remain. See
 *  docs/deploy/quote-public-token-enforcement-preflight.md for the
 *  rollout procedure.
 */
Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "GET") {
    return Response.json(
      { error: "Method Not Allowed" },
      {
        status: 405,
        headers: { "Access-Control-Allow-Origin": "*" },
      },
    );
  }

  const url = new URL(req.url);
  const quoteIdParam = url.searchParams.get("id");
  const tokenParam = url.searchParams.get("token") || "";

  if (!quoteIdParam) {
    return Response.json(
      { error: "Missing quote id" },
      {
        status: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
      },
    );
  }

  // Validate that id is a positive integer (quotes.id is bigint)
  const quoteId = Number(quoteIdParam);
  if (!Number.isInteger(quoteId) || quoteId <= 0) {
    return Response.json(
      { error: "Invalid quote id: must be a positive integer" },
      {
        status: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
      },
    );
  }

  const { data: quote, error } = await supabaseAdmin
    .from("quotes")
    .select(
      "html_content, quote_number, docuseal_signing_url, status, approval_token",
    )
    .eq("id", quoteId)
    .single();

  if (error || !quote?.html_content) {
    return Response.json(
      { error: "Quote not found" },
      {
        status: 404,
        headers: { "Access-Control-Allow-Origin": "*" },
      },
    );
  }

  // Feature-flagged access enforcement. When the flag is "on", the
  // caller MUST supply a token that matches the quote's approval_token.
  // When off (default), tokenless access is allowed for backward
  // compatibility with already-issued customer links.
  const enforcementEnabled =
    (Deno.env.get("QUOTE_PUBLIC_TOKEN_ENFORCEMENT") || "off").toLowerCase() ===
    "on";

  if (enforcementEnabled) {
    if (!tokenParam || tokenParam !== quote.approval_token) {
      return Response.json(
        { error: "Unauthorized" },
        {
          status: 403,
          headers: { "Access-Control-Allow-Origin": "*" },
        },
      );
    }
  }

  // Always strip the dedicated write token from the public HTML response,
  // regardless of the enforcement flag. This is the non-negotiable fix
  // for the edit-button leak: the customer-facing HTML must never carry
  // a usable editor credential. Matches both single- and double-quoted
  // injection formats to cover any legacy generate_quote_pdf output.
  let html = quote.html_content.replace(
    /window\.QUOTE_WRITE_TOKEN\s*=\s*["'][^"']*["'];?/g,
    'window.QUOTE_WRITE_TOKEN = "";',
  );

  // Include signing URL if the quote is awaiting signature (sent or viewed)
  const signingUrl =
    quote.status === "sent" || quote.status === "viewed"
      ? quote.docuseal_signing_url
      : null;

  return Response.json(
    {
      html,
      quote_number: quote.quote_number,
      signing_url: signingUrl,
    },
    {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache",
      },
    },
  );
});
