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
      console.error(`Google Custom Search failed: HTTP ${response.status}`);
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

    // Fetch company
    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .select("id, name, city, org_number, revenue, employees_estimate")
      .eq("id", company_id)
      .single();

    if (companyError || !company) {
      return createErrorResponse(404, "Företag hittades inte");
    }

    const allabolagData = await searchAllabolag(
      company.name,
      company.city,
      googleApiKey,
      googleCx,
    );

    if (!allabolagData) {
      await supabaseAdmin.from("enrichment_log").insert({
        company_id,
        source: "allabolag",
        status: "failed",
        error_message: "Ingen Allabolag-sida hittades",
      });

      return createJsonResponse({
        success: false,
        message: "Kunde inte hitta företaget på Allabolag",
      });
    }

    // Update company with Allabolag data (only fill in missing data)
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
    if (allabolagData.sni_code) {
      updateData.sni_code = allabolagData.sni_code;
    }
    if (allabolagData.allabolag_url) {
      updateData.allabolag_url = allabolagData.allabolag_url;
    }

    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from("companies")
        .update(updateData)
        .eq("id", company_id);

      if (updateError) {
        console.error("Company update error:", updateError);
      }
    }

    // Log success
    await supabaseAdmin.from("enrichment_log").insert({
      company_id,
      source: "allabolag",
      status: "success",
      enrichment_data: allabolagData,
    });

    return createJsonResponse({
      success: true,
      data: allabolagData,
      fields_updated: Object.keys(updateData),
    });
  } catch (err) {
    console.error("enrich_allabolag error:", err);
    return errorResponseFromUnknown(err);
  }
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req, _user) => {
        if (req.method !== "POST") {
          return createErrorResponse(405, "Metod ej tillåten");
        }
        return handleEnrichAllabolag(req);
      }),
    ),
  ),
);
