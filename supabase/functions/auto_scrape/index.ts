import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

// --- Types ---

interface SearchProfile {
  id: number;
  name: string;
  query_template: string;
  branch: string;
  city: string;
  extra_keywords: string[];
  min_rating: number;
  max_results: number;
  is_active: boolean;
  auto_enrich: boolean;
}

interface GoogleMapsPlace {
  place_id: string;
  name: string;
  address: string;
  phone: string;
  website: string;
  rating: number;
  reviews_count: number;
  category: string;
  latitude?: number;
  longitude?: number;
}

interface ScrapeRunResult {
  profile_id: number;
  profile_name: string;
  total_found: number;
  new_imported: number;
  duplicates_skipped: number;
  auto_enriched: number;
}

// --- Website Quality Scoring ---
// Scores website quality based on real technical signals.
// A "good" site = modern, well-built (bad lead for a web agency).
// A "poor" site = outdated, needs work (good lead for a web agency).

// Booking platforms and profile pages that are NOT real websites.
// If a company's "website" is one of these, they don't have their own site.
const NOT_A_REAL_WEBSITE = [
  // Social media
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  // Swedish booking platforms
  "bokadirekt.se",
  "voady.com",
  "voady.se",
  "boka.se",
  "bokamera.se",
  "timecenter.se",
  "cliento.com",
  "wondr.se",
  "marketbooking.se",
  // International booking platforms
  "booksy.com",
  "fresha.com",
  "treatwell.se",
  "treatwell.com",
  "mindbodyonline.com",
  "mindbody.io",
  "calendly.com",
  "acuityscheduling.com",
  // Directory / listing sites
  "google.com/maps",
  "maps.google",
  "hitta.se",
  "eniro.se",
  "gulasidorna.se",
  "allabolag.se",
  "ratsit.se",
  "merinfo.se",
  "yelp.com",
  "tripadvisor.com",
  "tripadvisor.se",
  // Generic profile/page builders (not real sites)
  "linktr.ee",
  "linktree.com",
  "bio.link",
  "beacons.ai",
  "carrd.co",
];

async function scoreWebsiteQuality(websiteUrl: string): Promise<{
  website_score: number;
  website_quality: "none" | "poor" | "ok" | "good";
}> {
  const urlLower = websiteUrl.toLowerCase();
  const isProfileSite = NOT_A_REAL_WEBSITE.some((domain) =>
    urlLower.includes(domain),
  );
  if (isProfileSite) {
    console.log(`Not a real website (profile/booking): ${websiteUrl}`);
    return { website_score: 0, website_quality: "none" };
  }

  const url = websiteUrl.startsWith("http")
    ? websiteUrl
    : `https://${websiteUrl}`;

  try {
    const startTime = Date.now();
    const siteResponse = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    const responseTime = Date.now() - startTime;
    const html = await siteResponse.text();
    const htmlLower = html.toLowerCase();

    // --- NEGATIVE signals (deduct from 100) ---
    let deductions = 0;
    const details: Record<string, unknown> = {};

    // 1. Site doesn't load (-100)
    if (!siteResponse.ok) {
      return { website_score: 0, website_quality: "poor" };
    }

    // 2. No HTTPS (-15)
    const finalUrl = siteResponse.url || url;
    if (!finalUrl.startsWith("https://")) {
      deductions += 15;
      details.no_ssl = true;
    }

    // 3. Slow response (-5 to -15)
    if (responseTime > 5000) {
      deductions += 15;
      details.very_slow = responseTime;
    } else if (responseTime > 3000) {
      deductions += 10;
      details.slow = responseTime;
    } else if (responseTime > 2000) {
      deductions += 5;
      details.moderate_speed = responseTime;
    }

    // 4. No viewport / not mobile responsive (-20)
    const hasViewport = /meta[^>]+viewport/i.test(html);
    if (!hasViewport) {
      deductions += 20;
      details.not_responsive = true;
    }

    // 5. Parking/placeholder page (-50)
    const isParked =
      htmlLower.includes("parkering") ||
      htmlLower.includes("domain is for sale") ||
      htmlLower.includes("under construction") ||
      htmlLower.includes("coming soon") ||
      htmlLower.includes("denna domän") ||
      htmlLower.includes("köp denna") ||
      html.length < 2000;
    if (isParked) {
      deductions += 50;
      details.parked = true;
    }

    // 6. Outdated tech signals (-10 to -25)
    const outdatedSignals: string[] = [];

    // Table-based layout (very old school)
    const tableCount = (htmlLower.match(/<table/g) || []).length;
    const divCount = (htmlLower.match(/<div/g) || []).length;
    if (tableCount > 3 && tableCount > divCount * 0.5) {
      outdatedSignals.push("table_layout");
    }

    // Inline styles (sloppy/old)
    const inlineStyleCount = (htmlLower.match(/style="/g) || []).length;
    if (inlineStyleCount > 15) {
      outdatedSignals.push("excessive_inline_styles");
    }

    // Flash/Java/ActiveX
    if (
      htmlLower.includes("shockwave-flash") ||
      htmlLower.includes(".swf") ||
      htmlLower.includes("application/x-java") ||
      htmlLower.includes("activexobject")
    ) {
      outdatedSignals.push("flash_or_java");
    }

    // Old jQuery (pre-2.0 patterns)
    const jqueryMatch = html.match(/jquery[.-]?([\d]+)\.([\d]+)/i);
    if (jqueryMatch) {
      const majorVer = parseInt(jqueryMatch[1], 10);
      if (majorVer < 3) {
        outdatedSignals.push("old_jquery");
      }
    }

    // No CSS framework / no external CSS at all
    const hasExternalCSS = /<link[^>]+\.css/i.test(html);
    if (!hasExternalCSS && !htmlLower.includes("<style")) {
      outdatedSignals.push("no_css");
    }

    // Old doctype or no doctype
    if (
      !html.trim().toLowerCase().startsWith("<!doctype html>") &&
      !html.trim().toLowerCase().startsWith("<!doctype html ")
    ) {
      const hasOldDoctype =
        htmlLower.includes("xhtml") || htmlLower.includes("transitional");
      if (hasOldDoctype) {
        outdatedSignals.push("xhtml_doctype");
      } else if (!htmlLower.includes("<!doctype")) {
        outdatedSignals.push("no_doctype");
      }
    }

    // Frames/framesets
    if (
      htmlLower.includes("<frameset") ||
      (htmlLower.includes("<iframe") &&
        (htmlLower.match(/<iframe/g) || []).length > 3)
    ) {
      outdatedSignals.push("frames");
    }

    // Old meta tags (generator)
    const generatorMatch = html.match(
      /meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i,
    );
    if (generatorMatch) {
      const gen = generatorMatch[1].toLowerCase();
      details.generator = generatorMatch[1];

      // Old WordPress versions
      const wpMatch = gen.match(/wordpress\s*([\d.]+)/);
      if (wpMatch) {
        const wpVersion = parseFloat(wpMatch[1]);
        if (wpVersion < 5.0) {
          outdatedSignals.push("old_wordpress");
        }
      }

      // Old Joomla
      if (
        gen.includes("joomla") &&
        !gen.includes("4.") &&
        !gen.includes("5.")
      ) {
        outdatedSignals.push("old_joomla");
      }

      // Old Drupal
      if (gen.includes("drupal") && !gen.includes("9") && !gen.includes("10")) {
        outdatedSignals.push("old_drupal");
      }
    }

    // Font tags (very 2000s)
    if (htmlLower.includes("<font")) {
      outdatedSignals.push("font_tags");
    }

    // Deduct based on number of outdated signals
    if (outdatedSignals.length >= 4) {
      deductions += 30;
    } else if (outdatedSignals.length >= 2) {
      deductions += 20;
    } else if (outdatedSignals.length >= 1) {
      deductions += 10;
    }
    if (outdatedSignals.length > 0) {
      details.outdated_signals = outdatedSignals;
    }

    // 7. Modern framework detection (bonus, reduces deductions by up to 15)
    let modernBonus = 0;
    const modernFrameworks: string[] = [];

    // React/Next.js
    if (htmlLower.includes("__next") || htmlLower.includes("_next/static")) {
      modernFrameworks.push("nextjs");
      modernBonus += 15;
    } else if (htmlLower.includes("__nuxt") || htmlLower.includes("/_nuxt/")) {
      modernFrameworks.push("nuxt");
      modernBonus += 15;
    } else if (htmlLower.includes("react") && htmlLower.includes("root")) {
      modernFrameworks.push("react");
      modernBonus += 10;
    }

    // Tailwind
    if (
      htmlLower.includes("tailwind") ||
      /class="[^"]*(?:flex|grid|gap-|text-|bg-|p-|m-)\w/i.test(html)
    ) {
      modernFrameworks.push("tailwind");
      modernBonus += 5;
    }

    // Modern CMS/builders (latest versions)
    if (htmlLower.includes("squarespace")) {
      modernFrameworks.push("squarespace");
      modernBonus += 10;
    }
    if (htmlLower.includes("wix.com") || htmlLower.includes("wixsite")) {
      modernFrameworks.push("wix");
      modernBonus += 5;
    }
    if (htmlLower.includes("webflow")) {
      modernFrameworks.push("webflow");
      modernBonus += 10;
    }
    if (htmlLower.includes("shopify")) {
      modernFrameworks.push("shopify");
      modernBonus += 10;
    }

    // Modern WordPress (block editor / FSE)
    if (
      htmlLower.includes("wp-block-") ||
      htmlLower.includes("wp-element") ||
      htmlLower.includes("wp-json")
    ) {
      modernFrameworks.push("modern_wordpress");
      modernBonus += 5;
    }

    if (modernFrameworks.length > 0) {
      details.modern_frameworks = modernFrameworks;
    }

    // 8. Performance hints
    // Lazy loading images (modern practice)
    if (
      htmlLower.includes('loading="lazy"') ||
      htmlLower.includes("lazyload")
    ) {
      modernBonus += 3;
    }

    // Preconnect/prefetch (modern optimization)
    if (htmlLower.includes("preconnect") || htmlLower.includes("prefetch")) {
      modernBonus += 2;
    }

    // Calculate final score (100 - deductions + bonus, clamped to 0-100)
    const finalScore = Math.max(
      0,
      Math.min(100, 100 - deductions + Math.min(15, modernBonus)),
    );

    const website_quality: "none" | "poor" | "ok" | "good" =
      finalScore >= 70 ? "good" : finalScore >= 40 ? "ok" : "poor";

    console.log(
      `Website scored: ${url} → ${finalScore}/100 (${website_quality}) | deductions=${deductions}, bonus=${modernBonus} | ${JSON.stringify(details)}`,
    );

    return { website_score: finalScore, website_quality };
  } catch (err) {
    console.error("Website check error:", err);
    return { website_score: 0, website_quality: "poor" };
  }
}

// --- Google Maps Scraping (with page token support) ---

interface ScrapeResult {
  places: GoogleMapsPlace[];
  nextPageToken: string | null;
}

async function scrapeGoogleMaps(
  query: string,
  limit: number,
  apiKey: string,
  pageToken?: string | null,
): Promise<ScrapeResult> {
  // If we have a page token from a previous run, use it to get the next page
  let searchUrl: string;
  if (pageToken) {
    searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?pagetoken=${pageToken}&key=${apiKey}`;
    // Google requires a short delay before using a page token
    await new Promise((r) => setTimeout(r, 2000));
  } else {
    searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}`;
  }

  const searchResponse = await fetch(searchUrl);
  const searchData = await searchResponse.json();

  if (searchData.status === "REQUEST_DENIED") {
    throw new Error(
      `Google Maps API nekade: ${searchData.error_message || "Kontrollera API-nyckeln"}`,
    );
  }
  if (searchData.status === "OVER_QUERY_LIMIT") {
    throw new Error("Google Maps API kvot överskriden");
  }
  if (searchData.status === "INVALID_REQUEST" && pageToken) {
    // Page token expired or invalid — reset and start from the beginning
    return { places: [], nextPageToken: null };
  }
  if (!searchData.results || searchData.results.length === 0) {
    return { places: [], nextPageToken: null };
  }

  const results = searchData.results.slice(0, limit);
  const places: GoogleMapsPlace[] = [];

  for (const result of results) {
    try {
      const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${result.place_id}&fields=name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,types,geometry&key=${apiKey}`;
      const detailsResponse = await fetch(detailsUrl);
      const detailsData = await detailsResponse.json();

      if (detailsData.status === "OK" && detailsData.result) {
        const place = detailsData.result;
        places.push({
          place_id: result.place_id,
          name: place.name || "",
          address: place.formatted_address || "",
          phone: place.formatted_phone_number || "",
          website: place.website || "",
          rating: place.rating || 0,
          reviews_count: place.user_ratings_total || 0,
          category: place.types?.[0] || "",
          latitude: place.geometry?.location?.lat,
          longitude: place.geometry?.location?.lng,
        });
      }
    } catch (error) {
      console.error(`Detaljer-fel för plats ${result.place_id}:`, error);
    }
  }

  return {
    places,
    nextPageToken: searchData.next_page_token || null,
  };
}

// --- Dedup Check ---

async function getExistingPlaceIds(placeIds: string[]): Promise<Set<string>> {
  if (placeIds.length === 0) return new Set();

  const { data } = await supabaseAdmin
    .from("companies")
    .select("google_place_id")
    .in("google_place_id", placeIds);

  return new Set(
    (data ?? []).map((row: { google_place_id: string }) => row.google_place_id),
  );
}

// --- City & Zipcode extraction ---

function extractCity(address: string): string {
  const parts = address.split(",").map((s) => s.trim());
  if (parts.length >= 2) {
    // The city is usually in the second-to-last part (before country)
    const cityPart = parts[parts.length - 2];
    // Remove zipcode if present
    return cityPart.replace(/\b\d{3}\s?\d{2}\b/, "").trim();
  }
  return "";
}

function extractZipcode(address: string): string {
  const match = address.match(/\b\d{3}\s?\d{2}\b/);
  return match ? match[0].replace(/\s/g, "") : "";
}

// --- Build search query ---

function buildQuery(profile: SearchProfile): string {
  let query = profile.query_template
    .replace("{bransch}", profile.branch)
    .replace("{stad}", profile.city);

  if (profile.extra_keywords.length > 0) {
    query += " " + profile.extra_keywords.join(" ");
  }

  return query;
}

// --- Enrichment (calls enrich_company internally) ---

async function enrichCompany(companyId: number): Promise<boolean> {
  try {
    const { data: company, error } = await supabaseAdmin
      .from("companies")
      .select("*")
      .eq("id", companyId)
      .single();

    if (error || !company) return false;

    const googleApiKey = Deno.env.get("GOOGLE_CUSTOM_SEARCH_API_KEY");
    const googleCx = Deno.env.get("GOOGLE_CUSTOM_SEARCH_CX");

    let socialResults = {
      facebook_url: null as string | null,
      instagram_url: null as string | null,
      has_facebook: false,
      has_instagram: false,
    };

    // Social media discovery (uses Google Custom Search — 100 free queries/day)
    let searchQuotaExhausted = false;

    if (googleApiKey && googleCx && company.name) {
      try {
        const locationSuffix = company.city ? ` "${company.city}"` : "";

        // Facebook
        const fbQuery = encodeURIComponent(
          `"${company.name}"${locationSuffix} site:facebook.com`,
        );
        const fbResponse = await fetch(
          `https://www.googleapis.com/customsearch/v1?key=${googleApiKey}&cx=${googleCx}&q=${fbQuery}&num=3`,
        );
        if (fbResponse.status === 429) {
          console.warn(
            "Google Custom Search quota exhausted — skipping social media & Allabolag",
          );
          searchQuotaExhausted = true;
        } else if (fbResponse.ok) {
          const fbData = await fbResponse.json();
          const fbPage = fbData.items?.find(
            (item: { link: string }) =>
              item.link.includes("facebook.com/") &&
              !item.link.includes("/posts/") &&
              !item.link.includes("/photos/"),
          );
          if (fbPage) {
            socialResults.facebook_url = fbPage.link;
            socialResults.has_facebook = true;
          }
        }

        // Instagram (skip if quota exhausted)
        if (!searchQuotaExhausted) {
          await new Promise((r) => setTimeout(r, 300));

          const igQuery = encodeURIComponent(
            `"${company.name}"${locationSuffix} site:instagram.com`,
          );
          const igResponse = await fetch(
            `https://www.googleapis.com/customsearch/v1?key=${googleApiKey}&cx=${googleCx}&q=${igQuery}&num=3`,
          );
          if (igResponse.status === 429) {
            searchQuotaExhausted = true;
          } else if (igResponse.ok) {
            const igData = await igResponse.json();
            const igPage = igData.items?.find(
              (item: { link: string }) =>
                item.link.includes("instagram.com/") &&
                !item.link.includes("/p/") &&
                !item.link.includes("/reel/"),
            );
            if (igPage) {
              socialResults.instagram_url = igPage.link;
              socialResults.has_instagram = true;
            }
          }
        }
      } catch (err) {
        console.error("Social media discovery failed:", err);
      }
    }

    // Website quality scoring — uses direct HTTP check (no API key needed)
    let websiteScore = 0;
    let websiteQuality: "none" | "poor" | "ok" | "good" = "none";

    const websiteUrl = (company.website || "").trim();
    const websiteUrlLower = websiteUrl.toLowerCase();
    const hasRealWebsite =
      websiteUrl.length > 0 &&
      !NOT_A_REAL_WEBSITE.some((domain) => websiteUrlLower.includes(domain));

    if (hasRealWebsite) {
      try {
        const url = websiteUrl.startsWith("http")
          ? websiteUrl
          : `https://${websiteUrl}`;
        console.log(`Website check: ${url}`);

        const scored = await scoreWebsiteQuality(url);
        websiteScore = scored.website_score;
        websiteQuality = scored.website_quality;

        console.log(
          `Website result: ${url} → ${websiteScore} (${websiteQuality})`,
        );
      } catch (err) {
        // Site doesn't load at all
        console.error(`Website unreachable: ${websiteUrl} — ${err}`);
        websiteScore = 0;
        websiteQuality = "poor";
      }
    } else {
      websiteQuality = "none";
      console.log(`No website for ${company.name} — quality: none`);
    }

    // Step 3: Allabolag enrichment (org nr, revenue, employees, SNI)
    let allabolagData: Record<string, unknown> | null = null;
    let employeesEstimate = company.employees_estimate as number | null;
    let revenue = company.revenue as string | null;

    if (googleApiKey && googleCx && !searchQuotaExhausted) {
      try {
        await new Promise((r) => setTimeout(r, 300));
        const abQuery = encodeURIComponent(
          `"${company.name}"${company.city ? ` ${company.city}` : ""} site:allabolag.se`,
        );
        const abResponse = await fetch(
          `https://www.googleapis.com/customsearch/v1?key=${googleApiKey}&cx=${googleCx}&q=${abQuery}&num=3`,
        );

        if (abResponse.status === 429) {
          console.warn(
            "Google Custom Search quota exhausted during Allabolag lookup",
          );
          searchQuotaExhausted = true;
        } else if (abResponse.ok) {
          const abData = await abResponse.json();
          const abLink = abData.items?.find(
            (item: { link: string }) =>
              item.link.includes("allabolag.se/") &&
              !item.link.includes("/sok?"),
          );

          if (abLink) {
            allabolagData = { allabolag_url: abLink.link };

            // Parse snippet for key data
            const snippet = abLink.snippet || "";

            // Org number
            const orgMatch = snippet.match(/(\d{6}-?\d{4})/);
            if (orgMatch) {
              const orgNum = orgMatch[1].includes("-")
                ? orgMatch[1]
                : `${orgMatch[1].slice(0, 6)}-${orgMatch[1].slice(6)}`;
              allabolagData.org_number = orgNum;
            }

            // Employees
            const empMatch = snippet.match(/(\d+)\s*anst[aä]llda/i);
            if (empMatch) {
              employeesEstimate = parseInt(empMatch[1], 10);
              allabolagData.employees_estimate = employeesEstimate;
            }

            // Revenue
            const revMatch = snippet.match(
              /(?:omsättning|omsattning)[:\s]*([\d\s,.]+)\s*(tkr|mkr|kr)/i,
            );
            if (revMatch) {
              revenue = `${revMatch[1].trim()} ${revMatch[2]}`;
              allabolagData.revenue = revenue;
            }

            // SNI code
            const sniMatch = snippet.match(/SNI[:\s-]*(\d{2,5})/i);
            if (sniMatch) {
              allabolagData.sni_code = sniMatch[1];
            }

            console.log(
              `Allabolag data for ${company.name}:`,
              JSON.stringify(allabolagData),
            );
          }
        }

        await new Promise((r) => setTimeout(r, 300));
      } catch (err) {
        console.error("Allabolag search failed:", err);
      }
    }

    // Lead scoring (enhanced with Allabolag data)
    let score = 0;

    // Social media presence (max 40)
    if (socialResults.has_facebook) score += 15;
    if (socialResults.has_instagram) score += 15;
    if (socialResults.has_facebook && socialResults.has_instagram) score += 10;

    // Website quality (max 25)
    if (websiteQuality === "none" || !hasRealWebsite) {
      score += 25;
    } else if (websiteQuality === "poor") {
      score += 15;
    } else if (websiteQuality === "ok") {
      score += 5;
    } else if (websiteQuality === "good") {
      score -= 10;
    }

    // Company size from Allabolag (max 10)
    if (
      employeesEstimate &&
      employeesEstimate >= 1 &&
      employeesEstimate <= 50
    ) {
      score += 10;
    } else if (
      employeesEstimate &&
      employeesEstimate > 50 &&
      employeesEstimate <= 200
    ) {
      score += 5;
    }

    // Contact info (max 10)
    if (company.phone_number) score += 5;
    if (company.email) score += 5;

    score = Math.max(0, Math.min(100, score));

    const segment =
      score >= 60
        ? "hot_lead"
        : score >= 35
          ? "warm_lead"
          : score >= 15
            ? "cold_lead"
            : "nurture";

    // Build update data
    const updateData: Record<string, unknown> = {
      facebook_url: socialResults.facebook_url,
      instagram_url: socialResults.instagram_url,
      has_facebook: socialResults.has_facebook,
      has_instagram: socialResults.has_instagram,
      website_score: websiteScore,
      website_quality: websiteQuality,
      has_website: hasRealWebsite,
      lead_score: score,
      segment,
      enriched_at: new Date().toISOString(),
    };

    // Add Allabolag data if found
    if (allabolagData) {
      if (allabolagData.org_number && !company.org_number) {
        updateData.org_number = allabolagData.org_number;
      }
      if (allabolagData.revenue && !company.revenue) {
        updateData.revenue = allabolagData.revenue;
      }
      if (employeesEstimate && !company.employees_estimate) {
        updateData.employees_estimate = employeesEstimate;
      }
      if (allabolagData.sni_code) {
        updateData.sni_code = allabolagData.sni_code;
      }
      if (allabolagData.allabolag_url) {
        updateData.allabolag_url = allabolagData.allabolag_url;
      }
    }

    // Update company
    await supabaseAdmin
      .from("companies")
      .update(updateData)
      .eq("id", companyId);

    // Log enrichment
    await supabaseAdmin.from("enrichment_log").insert({
      company_id: companyId,
      source: "auto_scrape",
      status: "success",
      enrichment_data: {
        social: socialResults,
        website_score: websiteScore,
        website_quality: websiteQuality,
        allabolag: allabolagData,
        lead_score: score,
        segment,
        search_quota_exhausted: searchQuotaExhausted,
      },
    });

    return true;
  } catch (err) {
    console.error(`Enrichment failed for company ${companyId}:`, err);
    return false;
  }
}

// --- Process a single search profile ---

async function processProfile(
  profile: SearchProfile,
  apiKey: string,
): Promise<ScrapeRunResult> {
  const query = buildQuery(profile);
  const result: ScrapeRunResult = {
    profile_id: profile.id,
    profile_name: profile.name,
    total_found: 0,
    new_imported: 0,
    duplicates_skipped: 0,
    auto_enriched: 0,
  };

  // Create scrape run record
  const { data: scrapeRun } = await supabaseAdmin
    .from("scrape_runs")
    .insert({
      search_profile_id: profile.id,
      query,
      source: "google_maps",
      status: "running",
    })
    .select("id")
    .single();

  const scrapeRunId = scrapeRun?.id;

  try {
    // Use stored page token to continue where we left off
    const { places, nextPageToken } = await scrapeGoogleMaps(
      query,
      profile.max_results,
      apiKey,
      (profile as any).next_page_token || null,
    );
    result.total_found = places.length;

    if (places.length === 0) {
      // No more results — reset page token so next run starts fresh
      await supabaseAdmin
        .from("search_profiles")
        .update({
          next_page_token: null,
          pages_scraped: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", profile.id);

      await updateScrapeRun(scrapeRunId, {
        status: "completed",
        total_found: 0,
      });
      return result;
    }

    // Filter by min_rating
    const ratingFiltered = places.filter((p) => p.rating >= profile.min_rating);

    // Dedup check
    const placeIds = ratingFiltered.map((p) => p.place_id).filter(Boolean);
    const existingIds = await getExistingPlaceIds(placeIds);

    const newPlaces = ratingFiltered.filter(
      (p) => p.place_id && !existingIds.has(p.place_id),
    );
    result.duplicates_skipped = ratingFiltered.length - newPlaces.length;

    // Step 1: Import all new companies
    const importedIds: number[] = [];
    for (const place of newPlaces) {
      try {
        const { data: inserted, error } = await supabaseAdmin
          .from("companies")
          .insert({
            name: place.name,
            address: place.address || "",
            city: extractCity(place.address || ""),
            zipcode: extractZipcode(place.address || ""),
            phone_number: place.phone || "",
            website: place.website || "",
            source: "google_maps",
            lead_status: "new",
            google_place_id: place.place_id,
            has_website:
              !!place.website &&
              !place.website.includes("facebook.com") &&
              !place.website.includes("instagram.com"),
            industry: place.category || "",
          })
          .select("id")
          .single();

        if (!error && inserted) {
          result.new_imported++;
          importedIds.push(inserted.id);
        }
      } catch (err) {
        console.error(`Failed to import ${place.name}:`, err);
      }
    }

    // Step 2: Parallel enrichment (batches of 3)
    if (profile.auto_enrich && importedIds.length > 0) {
      const ENRICH_CONCURRENCY = 3;
      for (let i = 0; i < importedIds.length; i += ENRICH_CONCURRENCY) {
        const batch = importedIds.slice(i, i + ENRICH_CONCURRENCY);
        const batchResults = await Promise.allSettled(
          batch.map((id) => enrichCompany(id)),
        );
        for (const r of batchResults) {
          if (r.status === "fulfilled" && r.value) {
            result.auto_enriched++;
          }
        }
      }
    }

    // Save page token for next run + update stats
    const currentPages = ((profile as any).pages_scraped ?? 0) as number;
    await supabaseAdmin
      .from("search_profiles")
      .update({
        last_run_at: new Date().toISOString(),
        last_run_results: result.new_imported,
        total_leads_generated:
          ((profile as any).total_leads_generated ?? 0) + result.new_imported,
        next_page_token: nextPageToken,
        pages_scraped: currentPages + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id);

    // Update scrape run
    await updateScrapeRun(scrapeRunId, {
      status: "completed",
      total_found: result.total_found,
      new_imported: result.new_imported,
      duplicates_skipped: result.duplicates_skipped,
      auto_enriched: result.auto_enriched,
    });

    return result;
  } catch (err) {
    console.error(`Profile ${profile.name} failed:`, err);
    await updateScrapeRun(scrapeRunId, {
      status: "failed",
      error_message: String(err),
    });
    throw err;
  }
}

async function updateScrapeRun(
  id: number | undefined,
  updates: Record<string, unknown>,
) {
  if (!id) return;
  await supabaseAdmin
    .from("scrape_runs")
    .update({
      ...updates,
      completed_at: new Date().toISOString(),
    })
    .eq("id", id);
}

// --- Main Handler ---

async function handleReEnrich(_req: Request) {
  // Re-enrich all companies that lack enrichment data or have score 0
  const { data: companies, error } = await supabaseAdmin
    .from("companies")
    .select("id, name")
    .or(
      "enriched_at.is.null,lead_score.eq.0,website_quality.is.null,allabolag_url.is.null",
    )
    .not("name", "is", null)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error || !companies || companies.length === 0) {
    return new Response(
      JSON.stringify({
        success: true,
        message: "Inga företag behöver re-enrichas",
        re_enriched: 0,
      }),
      {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }

  console.log(`Re-enriching ${companies.length} companies...`);

  let enriched = 0;
  let failed = 0;
  const CONCURRENCY = 3;

  for (let i = 0; i < companies.length; i += CONCURRENCY) {
    const batch = companies.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map((c: { id: number }) => enrichCompany(c.id)),
    );
    for (const r of batchResults) {
      if (r.status === "fulfilled" && r.value) {
        enriched++;
      } else {
        failed++;
      }
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      total_candidates: companies.length,
      re_enriched: enriched,
      failed,
    }),
    {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    },
  );
}

async function handleAutoScrape(req: Request) {
  const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!apiKey) {
    return createErrorResponse(500, "GOOGLE_MAPS_API_KEY saknas");
  }

  // Parse request body
  let profileFilter: number | null = null;
  let action: string | null = null;
  try {
    const body = await req.json();
    profileFilter = body.profile_id ?? null;
    action = body.action ?? null;
  } catch {
    // No body = run all active profiles
  }

  // Handle re-enrich action
  if (action === "re_enrich") {
    return handleReEnrich(req);
  }

  // Fetch active search profiles
  let query = supabaseAdmin
    .from("search_profiles")
    .select("*")
    .eq("is_active", true);

  if (profileFilter) {
    query = query.eq("id", profileFilter);
  }

  const { data: profiles, error } = await query;

  if (error || !profiles || profiles.length === 0) {
    return new Response(
      JSON.stringify({
        success: true,
        message: "Inga aktiva sökprofiler hittades",
        results: [],
      }),
      {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }

  const results: ScrapeRunResult[] = [];
  const errors: Array<{ profile: string; error: string }> = [];

  for (const profile of profiles as SearchProfile[]) {
    try {
      const result = await processProfile(profile, apiKey);
      results.push(result);
    } catch (err) {
      errors.push({
        profile: profile.name,
        error: String(err),
      });
    }
  }

  const totalNew = results.reduce((sum, r) => sum + r.new_imported, 0);
  const totalEnriched = results.reduce((sum, r) => sum + r.auto_enriched, 0);
  const totalDuplicates = results.reduce(
    (sum, r) => sum + r.duplicates_skipped,
    0,
  );

  return new Response(
    JSON.stringify({
      success: true,
      summary: {
        profiles_processed: results.length,
        total_new_leads: totalNew,
        total_enriched: totalEnriched,
        total_duplicates_skipped: totalDuplicates,
        errors: errors.length,
      },
      results,
      errors: errors.length > 0 ? errors : undefined,
    }),
    {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    },
  );
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req, _user) => {
        if (req.method !== "POST") {
          return createErrorResponse(405, "Metod ej tillåten");
        }
        return handleAutoScrape(req);
      }),
    ),
  ),
);
