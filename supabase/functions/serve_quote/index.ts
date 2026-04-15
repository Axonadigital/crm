import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

/**
 * Serve Quote — returns quote HTML and signing URL as JSON.
 *
 * GET /serve_quote?id=<quote_id>
 *
 * Supabase Edge Functions override Content-Type to text/plain for
 * HTML responses (security policy). So we return JSON instead,
 * and the Vercel-hosted quote.html viewer renders it via iframe srcdoc.
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

  // Strip the write token from HTML unless the caller provides the correct approval_token.
  // This prevents customers (who receive the plain /quote.html?id=X URL) from seeing
  // the "Redigera offert" editor button. CRM users open the raw stored HTML via blob URL
  // and are unaffected by this stripping.
  let html = quote.html_content;
  const tokenValid =
    tokenParam.length > 0 && tokenParam === quote.approval_token;
  if (!tokenValid) {
    html = html.replace(
      /window\.QUOTE_WRITE_TOKEN\s*=\s*'[^']*';?/g,
      "window.QUOTE_WRITE_TOKEN = '';",
    );
  }

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
