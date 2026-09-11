import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse, createJsonResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import {
  errorResponseFromUnknown,
  getPositiveIntegerField,
  parseRequiredJsonBody,
} from "../_shared/http.ts";

// --- Types ---

interface AllabolagData {
  org_number: string | null;
  company_name: string | null;
  revenue: string | null;
  employees_estimate: number | null;
  sni_code: string | null;
  sni_description: string | null;
  allabolag_url: string | null;
  address: string | null;
  city: string | null;
  zipcode: string | null;
}

// --- Allabolag Scraping ---
// Allabolag.se doesn't have a public API, so we scrape the search results page.
// We use Google Custom Search as a proxy to find the correct Allabolag page,
// then fetch and parse key data from the page.

/**
 * Allabolag-länken vi redan HAR. 156 företag hade den liggande i
 * enrichment_data.serper_discovery.context_links utan att någon läste den,
 * och allabolag_url-kolumnen var tom på samtliga 510 (2026-09-11).
 * En sparad länk kostar noll sökfrågor.
 */
function storedAllabolagUrl(company: Record<string, unknown>): string | null {
  const direct = company.allabolag_url;
  if (typeof direct === "string" && direct.includes("allabolag.se")) {
    return direct;
  }
  const links = (company.enrichment_data as Record<string, unknown> | null)
    ?.serper_discovery as Record<string, unknown> | undefined;
  const list = links?.context_links;
  if (!Array.isArray(list)) return null;
  for (const item of list) {
    const url = (item as Record<string, unknown>)?.url;
    if (
      typeof url === "string" &&
      url.includes("allabolag.se/") &&
      !url.includes("/sok?") &&
      !url.includes("/nyheter/")
    ) {
      return url;
    }
  }
  return null;
}

/**
 * Serper som söktjänst. Google Custom Search JSON API är inte aktiverat i
 * Googles projekt ("This project does not have the access to Custom Search
 * JSON API", HTTP 403, verifierat 2026-09-11), medan SERPER_API_KEY redan
 * används av enrich_company och fungerar.
 */
async function searchAllabolagViaSerper(
  companyName: string,
  city: string | null,
  apiKey: string,
): Promise<{ link: string; snippet: string } | null> {
  try {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        q: `"${companyName}"${city ? ` ${city}` : ""} site:allabolag.se`,
        gl: "se",
        hl: "sv",
        num: 5,
      }),
    });
    if (!response.ok) {
      console.error(`Serper allabolag-sökning misslyckades: ${response.status}`);
      return null;
    }
    const data = (await response.json()) as {
      organic?: { link?: string; snippet?: string }[];
    };
    const hit = data.organic?.find(
      (item) =>
        typeof item.link === "string" &&
        item.link.includes("allabolag.se/") &&
        !item.link.includes("/sok?") &&
        !item.link.includes("/nyheter/"),
    );
    return hit?.link ? { link: hit.link, snippet: hit.snippet ?? "" } : null;
  } catch (err) {
    console.error("Serper allabolag-fel:", err);
    return null;
  }
}

async function searchAllabolag(
  companyName: string,
  city: string | null,
  googleApiKey: string,
  googleCx: string,
): Promise<AllabolagData | null> {
  const locationSuffix = city ? ` ${city}` : "";
  const query = encodeURIComponent(
    `"${companyName}"${locationSuffix} site:allabolag.se`,
  );

  try {
    const response = await fetch(
      `https://www.googleapis.com/customsearch/v1?key=${googleApiKey}&cx=${googleCx}&q=${query}&num=3`,
    );

    if (!response.ok) {
      // Kroppen behövs — ett blankt 403 säger inte om det är fel nyckel,
      // avstängt API eller en nyckelbegränsning, och de har olika åtgärd.
      const detail = await response.text().catch(() => "");
      console.error(
        `Google Custom Search failed: HTTP ${response.status} ${detail.slice(0, 400)}`,
      );
      return null;
    }

    const data = await response.json();
    const allabolagLink = data.items?.find(
      (item: { link: string }) =>
        item.link.includes("allabolag.se/") &&
        !item.link.includes("/sok?") &&
        !item.link.includes("/nyheter/"),
    );

    if (!allabolagLink) {
      console.warn(`No Allabolag page found for: ${companyName}`);
      return null;
    }

    // Fetch the Allabolag page and extract data
    return await scrapeAllabolagPage(allabolagLink.link, allabolagLink.snippet);
  } catch (err) {
    console.error("Allabolag search error:", err);
    return null;
  }
}

async function scrapeAllabolagPage(
  url: string,
  snippet: string,
): Promise<AllabolagData | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; CRMBot/1.0; +https://axonadigital.se)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.error(`Allabolag page fetch failed: HTTP ${response.status}`);
      return null;
    }

    const html = await response.text();
    return parseAllabolagHtml(html, url, snippet);
  } catch (err) {
    console.error("Allabolag page scrape error:", err);
    // Fall back to snippet parsing if page fetch fails
    return parseSnippetFallback(url, snippet);
  }
}

function parseAllabolagHtml(
  html: string,
  url: string,
  snippet: string,
): AllabolagData {
  const result: AllabolagData = {
    org_number: null,
    company_name: null,
    revenue: null,
    employees_estimate: null,
    sni_code: null,
    sni_description: null,
    allabolag_url: url,
    address: null,
    city: null,
    zipcode: null,
  };

  // Extract org number (format: XXXXXX-XXXX)
  const orgMatch = html.match(
    /(?:Org\.?\s*(?:nr|nummer)|Organisationsnummer)[:\s]*(\d{6}-?\d{4})/i,
  );
  if (orgMatch) {
    result.org_number = orgMatch[1].includes("-")
      ? orgMatch[1]
      : `${orgMatch[1].slice(0, 6)}-${orgMatch[1].slice(6)}`;
  }

  // Extract revenue / omsättning
  // Patterns: "Omsättning: 1 234 tkr", "Nettoomsättning 1 234 000 kr"
  const revenueMatch = html.match(
    /(?:Netto)?[Oo]ms[aä]ttning[:\s]*([\d\s,.]+)\s*(tkr|mkr|kr|TSEK|MSEK)/i,
  );
  if (revenueMatch) {
    const value = revenueMatch[1].replace(/\s/g, "").replace(",", ".");
    const unit = revenueMatch[2].toLowerCase();
    const numValue = parseFloat(value);
    if (unit === "tkr" || unit === "tsek") {
      result.revenue = `${Math.round(numValue)} tkr`;
    } else if (unit === "mkr" || unit === "msek") {
      result.revenue = `${numValue} mkr`;
    } else {
      result.revenue = `${Math.round(numValue / 1000)} tkr`;
    }
  }

  // Extract employees / antal anställda
  const empMatch = html.match(
    /(?:Antal\s*anst[aä]llda|Anst[aä]llda)[:\s]*(\d+)/i,
  );
  if (empMatch) {
    result.employees_estimate = parseInt(empMatch[1], 10);
  }

  // Extract SNI code
  const sniMatch = html.match(/SNI[:\s-]*(\d{2,5}(?:\.\d+)?)/i);
  if (sniMatch) {
    result.sni_code = sniMatch[1];
  }

  // Extract SNI description
  const sniDescMatch = html.match(
    /SNI[^<]*?(?:kod[^<]*?)?(?:<[^>]+>)*\s*[-–:]\s*([^<\n]{5,80})/i,
  );
  if (sniDescMatch) {
    result.sni_description = sniDescMatch[1].trim();
  }

  // If HTML parsing didn't find key data, try snippet
  if (!result.org_number && !result.revenue) {
    const snippetData = parseSnippetFallback(url, snippet);
    if (snippetData) {
      result.org_number = result.org_number || snippetData.org_number;
      result.revenue = result.revenue || snippetData.revenue;
      result.employees_estimate =
        result.employees_estimate ?? snippetData.employees_estimate;
    }
  }

  return result;
}

function parseSnippetFallback(
  url: string,
  snippet: string,
): AllabolagData | null {
  if (!snippet) return null;

  const result: AllabolagData = {
    org_number: null,
    company_name: null,
    revenue: null,
    employees_estimate: null,
    sni_code: null,
    sni_description: null,
    allabolag_url: url,
    address: null,
    city: null,
    zipcode: null,
  };

  // Org number from snippet
  const orgMatch = snippet.match(/(\d{6}-?\d{4})/);
  if (orgMatch) {
    result.org_number = orgMatch[1].includes("-")
      ? orgMatch[1]
      : `${orgMatch[1].slice(0, 6)}-${orgMatch[1].slice(6)}`;
  }

  // Revenue from snippet
  const revMatch = snippet.match(
    /(?:omsättning|omsattning)[:\s]*([\d\s,.]+)\s*(tkr|mkr|kr)/i,
  );
  if (revMatch) {
    result.revenue = `${revMatch[1].trim()} ${revMatch[2]}`;
  }

  // Employees from snippet
  const empMatch = snippet.match(/(\d+)\s*anst[aä]llda/i);
  if (empMatch) {
    result.employees_estimate = parseInt(empMatch[1], 10);
  }

  return result;
}

// --- Main Handler ---

interface EnrichOneResult {
  found: boolean;
  fieldsUpdated: string[];
  data: AllabolagData | null;
}

/**
 * Berikar ETT företag. Bruten ur handlern 2026-09-11 så batchläget kan
 * återanvända exakt samma logik — inte en andra, avvikande kopia.
 */
async function enrichOne(
  companyId: number,
  googleApiKey: string,
  googleCx: string,
): Promise<EnrichOneResult> {
  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select(
      "id, name, city, org_number, revenue, employees_estimate, allabolag_url, enrichment_data",
    )
    .eq("id", companyId)
    .single();
  if (companyError || !company) {
    throw new Error(`Företag ${companyId} hittades inte`);
  }

  // Tre källor i stigande kostnad: sparad länk (gratis), Serper, Google.
  let allabolagData: AllabolagData | null = null;
  let source = "stored_link";

  const stored = storedAllabolagUrl(company as Record<string, unknown>);
  if (stored) {
    allabolagData = await scrapeAllabolagPage(stored, "");
  }

  if (!allabolagData) {
    const serperKey = Deno.env.get("SERPER_API_KEY");
    if (serperKey) {
      source = "serper";
      const hit = await searchAllabolagViaSerper(
        company.name,
        company.city,
        serperKey,
      );
      if (hit) allabolagData = await scrapeAllabolagPage(hit.link, hit.snippet);
    }
  }

  if (!allabolagData) {
    source = "google_cse";
    allabolagData = await searchAllabolag(
      company.name,
      company.city,
      googleApiKey,
      googleCx,
    );
  }

  if (!allabolagData) {
    await supabaseAdmin.from("enrichment_log").insert({
      company_id: companyId,
      source: "allabolag",
      status: "failed",
      error_message: "Ingen Allabolag-sida hittades",
    });
    return { found: false, fieldsUpdated: [], data: null };
  }

  // Fyll bara tomma fält — en människas uppgift vinner alltid.
  const updateData: Record<string, unknown> = {};
  if (allabolagData.org_number && !company.org_number) {
    updateData.org_number = allabolagData.org_number;
  }
  if (allabolagData.revenue && !company.revenue) {
    updateData.revenue = allabolagData.revenue;
  }
  if (allabolagData.employees_estimate && !company.employees_estimate) {
    updateData.employees_estimate = allabolagData.employees_estimate;
  }
  if (allabolagData.sni_code) updateData.sni_code = allabolagData.sni_code;
  if (allabolagData.allabolag_url) {
    updateData.allabolag_url = allabolagData.allabolag_url;
  }

  if (Object.keys(updateData).length > 0) {
    const { error: updateError } = await supabaseAdmin
      .from("companies")
      .update(updateData)
      .eq("id", companyId);
    if (updateError) console.error("Company update error:", updateError);
  }

  await supabaseAdmin.from("enrichment_log").insert({
    company_id: companyId,
    source: "allabolag",
    status: "success",
    enrichment_data: { ...allabolagData, discovered_via: source },
  });

  return {
    found: true,
    fieldsUpdated: Object.keys(updateData),
    data: allabolagData,
  };
}

/**
 * Batchläge för cron. Plockar företag som saknar SNI-kod — den är den
 * renaste indatan till branschklassificeraren (_shared/industrySegment.ts)
 * och saknades på samtliga 510 företag 2026-09-11, eftersom funktionen
 * bara gick att anropa manuellt per företag.
 *
 * OBS kvot: Google Custom Search ger 100 frågor per dygn gratis. Därför
 * en liten batch och ett dygnsvis schema, inte en timvis genomkörning.
 */
async function handleBatch(body: Record<string, unknown> | null) {
  const googleApiKey = Deno.env.get("GOOGLE_CUSTOM_SEARCH_API_KEY");
  const googleCx = Deno.env.get("GOOGLE_CUSTOM_SEARCH_CX");
  if (!googleApiKey || !googleCx) {
    return createErrorResponse(
      500,
      "GOOGLE_CUSTOM_SEARCH_API_KEY eller GOOGLE_CUSTOM_SEARCH_CX saknas",
    );
  }

  const limit =
    typeof body?.limit === "number" && body.limit > 0
      ? Math.min(body.limit, 50)
      : 20;
  const startedAt = new Date().toISOString();
  const deadline = Date.now() + 100_000;

  // Hoppa över dem vi redan provat senaste månaden — annars mal jobbet
  // samma omöjliga företag och bränner dygnskvoten.
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: tried } = await supabaseAdmin
    .from("enrichment_log")
    .select("company_id")
    .eq("source", "allabolag")
    .gte("created_at", since);
  const skip = new Set((tried ?? []).map((r) => Number(r.company_id)));

  const { data: companies, error } = await supabaseAdmin
    .from("companies")
    .select("id, name")
    .is("sni_code", null)
    .not("name", "is", null)
    .order("id", { ascending: true })
    .limit(limit + skip.size);
  if (error) return createErrorResponse(500, error.message);

  let considered = 0;
  let enriched = 0;
  let missing = 0;
  let withSni = 0;
  const failures: string[] = [];

  for (const company of companies ?? []) {
    if (Date.now() > deadline || considered >= limit) break;
    if (skip.has(Number(company.id))) continue;
    considered += 1;
    try {
      const result = await enrichOne(Number(company.id), googleApiKey, googleCx);
      if (!result.found) {
        missing += 1;
        continue;
      }
      enriched += 1;
      if (result.data?.sni_code) withSni += 1;
    } catch (err) {
      failures.push(err instanceof Error ? err.message : String(err));
    }
  }

  const summary =
    `${enriched} berikade av ${considered} (${withSni} fick SNI-kod, ` +
    `${missing} saknade allabolag-sida, ${failures.length} fel)`;
  await supabaseAdmin.from("mc_job_heartbeats").insert({
    job: "enrich-allabolag",
    status: failures.length > 0 && enriched === 0 ? "failed" : "ok",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    message: summary.slice(0, 500),
    meta: { considered, enriched, with_sni: withSni, missing },
  });

  return createJsonResponse({
    success: true,
    considered,
    enriched,
    with_sni: withSni,
    missing,
    failures: failures.slice(0, 5),
    summary,
  });
}

async function handleEnrichAllabolag(req: Request) {
  try {
    const googleApiKey = Deno.env.get("GOOGLE_CUSTOM_SEARCH_API_KEY");
    const googleCx = Deno.env.get("GOOGLE_CUSTOM_SEARCH_CX");

    if (!googleApiKey || !googleCx) {
      return createErrorResponse(
        500,
        "GOOGLE_CUSTOM_SEARCH_API_KEY eller GOOGLE_CUSTOM_SEARCH_CX saknas",
      );
    }

    const body = await parseRequiredJsonBody(req);
    const company_id = getPositiveIntegerField(body, "company_id", {
      required: true,
    });

    const result = await enrichOne(company_id, googleApiKey, googleCx);
    if (!result.found) {
      return createJsonResponse({
        success: false,
        message: "Kunde inte hitta företaget på Allabolag",
      });
    }

    return createJsonResponse({
      success: true,
      data: result.data,
      fields_updated: result.fieldsUpdated,
    });
  } catch (err) {
    console.error("enrich_allabolag error:", err);
    return errorResponseFromUnknown(err);
  }
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) => {
    if (req.method !== "POST") {
      return createErrorResponse(405, "Metod ej tillåten");
    }

    // Cron-läge: x-cron-secret ger batchberikning utan användarkontext.
    // Allt annat går som förut genom inloggningen.
    const cronSecret = Deno.env.get("CRON_SECRET");
    const provided =
      req.headers.get("x-cron-secret") ||
      new URL(req.url).searchParams.get("secret");
    if (cronSecret && provided === cronSecret) {
      const body = (await req.clone().json().catch(() => null)) as
        | Record<string, unknown>
        | null;
      try {
        return await handleBatch(body);
      } catch (err) {
        console.error("enrich_allabolag batch error:", err);
        return errorResponseFromUnknown(err);
      }
    }

    return AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req, _user) =>
        handleEnrichAllabolag(req),
      ),
    );
  }),
);
