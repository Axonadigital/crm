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
import {
  choosePrimaryPhone,
  createPhoneEntries,
  extractPhoneNumbersFromText,
  mergePhoneNumbers,
  parseStoredPhoneNumbers,
  type PhoneNumberEntry,
} from "../_shared/phoneNumbers.ts";

// --- Types ---

interface SerperSearchResult {
  organic: Array<{
    title: string;
    link: string;
    snippet: string;
    position: number;
  }>;
  knowledgeGraph?: {
    website?: string;
    phoneNumber?: string;
    description?: string;
  };
}

interface EnrichmentResult {
  facebook_url: string | null;
  instagram_url: string | null;
  has_facebook: boolean;
  has_instagram: boolean;
  website_score: number | null;
  website_quality: "none" | "poor" | "ok" | "good";
  lead_score: number;
  segment: "hot_lead" | "warm_lead" | "cold_lead" | "nurture" | "disqualified";
  enrichment_data: Record<string, unknown>;
}

// --- Company Discovery via Serper.dev (Google Search) ---

interface SerperDiscoveryResult {
  website: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  linkedin_url: string | null;
  phone_numbers: PhoneNumberEntry[];
  email: string | null;
  context_links: Array<{ url: string; title: string; source: string }>;
}

function extractContactFromSnippet(
  snippet: string | undefined,
  result: SerperDiscoveryResult,
): void {
  if (!snippet) return;
  result.phone_numbers = mergePhoneNumbers(
    result.phone_numbers,
    createPhoneEntries(extractPhoneNumbersFromText(snippet), "serper_snippet"),
  );
  if (!result.email) {
    const emailMatch = snippet.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    if (emailMatch) {
      result.email = emailMatch[0].replace(/\.$/, ""); // Remove trailing dot
    }
  }
}

async function discoverViaSerper(
  companyName: string,
  city: string | null,
  apiKey: string,
): Promise<SerperDiscoveryResult> {
  const result: SerperDiscoveryResult = {
    website: null,
    facebook_url: null,
    instagram_url: null,
    linkedin_url: null,
    phone_numbers: [],
    email: null,
    context_links: [],
  };

  // Clean company name: remove legal suffixes and short words for better search
  const cleanName = companyName
    .replace(
      /\b(ab|hb|kb|ek\.?\s*för\.?|aktiebolag|handelsbolag|enskild firma|kommanditbolag|ekonomisk förening)\b/gi,
      "",
    )
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .join(" ");
  // Only append city if it's not already in the company name
  const cityAlreadyInName = city
    ? cleanName.toLowerCase().includes(city.toLowerCase())
    : true;
  const query = city && !cityAlreadyInName ? `${cleanName} ${city}` : cleanName;

  try {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: query,
        gl: "se",
        hl: "sv",
        num: 10,
      }),
    });

    if (!response.ok) return result;

    const data: SerperSearchResult = await response.json();

    // Extract from Knowledge Graph if available
    if (data.knowledgeGraph?.website) {
      result.website = data.knowledgeGraph.website;
    }
    if (data.knowledgeGraph?.phoneNumber) {
      result.phone_numbers = mergePhoneNumbers(
        result.phone_numbers,
        createPhoneEntries(
          [data.knowledgeGraph.phoneNumber],
          "serper_knowledge_graph",
        ),
      );
    }

    // Strip Swedish company suffixes for matching
    const nameLower = companyName
      .toLowerCase()
      .replace(
        /\b(ab|hb|kb|ek\.?\s*för\.?|aktiebolag|handelsbolag|enskild firma)\b/gi,
        "",
      )
      .trim();
    const nameWords = nameLower.split(/\s+/).filter((w) => w.length > 2);

    if (!data.organic) return result;

    // Directories that should NOT be treated as the company's own website,
    // but CAN contain useful context (saved as context_links)
    const CONTEXT_LINK_DOMAINS = [
      // Swedish company databases
      "allabolag.se",
      "hitta.se",
      "eniro.se",
      "ratsit.se",
      "merinfo.se",
      "bolagsfakta.se",
      "proff.se",
      "foretagsfakta.se",
      "solidinfo.se",
      "kreditkollen.se",
      "biznode.se",
      "largestcompanies.se",
      "cylex.se",
      "tic.io",
      "krafman.se",
      "bolag.io",
      "foretag.se",
      "upplysning.se",
      "bolagslista.se",
      "foretagsinfo.se",
      "leadsfinder.se",
      "mrkoll.se",
      "hitta-oppna.se",
      "objektvision.se",
      "syna.se",
      "rating.se",
      "infoo.se",
      "foretagsregistret.se",
      "118100.se",
      "gulasidorna.se",
      "startasida.se",
      // International company databases
      "kompass.com",
      "northdata.com",
      "northdata.de",
      "vainu.com",
      "leadfeeder.com",
      "dnb.com",
      "dun.se",
      "creditsafe.se",
      "opencorporates.com",
      // Trade & service directories
      "hantverkskollen.se",
      "badplatsen.se",
      "hemnet.se",
      "nearfinderse.com",
      "business.updatesystem.se",
      "alven-ingvarsson.se",
      "grip500.se",
      "lasingoo.se",
      "bilverkstad24.se",
      "kreditrapporten.se",
      "byggkatalogen.byggtjanst.se",
      "kulturhotell.se",
      "redovisningskonsulten.nu",
      "starofservice.se",
      "vainu.io",
      "byggbasen.com",
      "industritorget.se",
      "riksdelen.se",
      "yepstr.com",
      "svenskved.com",
      "starkabolag.se",
      "upplysningar.syna.se",
      "foretagsguiden.se",
      "branschkoll.se",
      "industriguiden.se",
      "foretagsupplysning.se",
      "foretagsbas.se",
      "woorank.com",
      "similarweb.com",
      "dnjournal.com",
      "maklarhuset.se",
      "byggportalen.se",
      "tradgardsservice.nu",
      "hembygd.se",
      "citypopulation.de",
      "krokom.se",
      "omnibuss.se",
      "creditsafe.com",
      "akeri.eu",
      "bygg.se",
      "billigflytt",
      "sumupstore.com",
      "nordicnet.se",
      "nordicnet.net",
      "trafikskola24.nu",
      "fbt.se",
      "skitrotter.com",
      "hittabrf.se",
      "frisorsok.se",
      "badlust.se",
      "reglei.se",
      "foodofjamtland.se",
      "grossist.se",
      "locale.online",
      "konst.se",
      // Maps
      "naviswmap.org",
      "google.com/maps",
      "google.se/maps",
      "maps.google",
      "apple.com/maps",
      // Review & job sites
      "yelp.com",
      "yelp.se",
      "trustpilot.com",
      "trustpilot.se",
      "glassdoor.com",
      "glassdoor.se",
      "indeed.com",
      "indeed.se",
      "jobylon.com",
      "arbetsformedlingen.se",
      // News & other
      "wikipedia.org",
      "youtube.com",
      "op.se",
      "ltz.se",
    ];

    // Domains that are never useful as website or context
    // (social media handled above, catalogs handled by CONTEXT_LINK_DOMAINS below)
    const SKIP_ENTIRELY = NOT_A_REAL_WEBSITE;

    for (const item of data.organic) {
      const link = item.link.toLowerCase();
      const titleLower = item.title.toLowerCase();

      // Extract Facebook URL
      if (!result.facebook_url && link.includes("facebook.com/")) {
        if (
          !link.includes("/posts/") &&
          !link.includes("/photos/") &&
          !link.includes("/events/")
        ) {
          result.facebook_url = item.link;
        }
        continue;
      }

      // Extract Instagram URL
      if (!result.instagram_url && link.includes("instagram.com/")) {
        if (!link.includes("/p/") && !link.includes("/reel/")) {
          result.instagram_url = item.link;
        }
        continue;
      }

      // Extract LinkedIn URL
      if (!result.linkedin_url && link.includes("linkedin.com/")) {
        if (link.includes("/company/") || link.includes("/in/")) {
          result.linkedin_url = item.link;
        }
        continue;
      }

      // Skip booking/social platforms entirely
      if (SKIP_ENTIRELY.some((domain) => link.includes(domain))) continue;

      // Context links: directories with useful info, saved but not as website
      const contextDomain = CONTEXT_LINK_DOMAINS.find((d) => link.includes(d));
      if (contextDomain) {
        if (result.context_links.length < 5) {
          result.context_links.push({
            url: item.link,
            title: item.title,
            source: contextDomain,
          });
        }
        // Still extract phone/email from directory snippets
        extractContactFromSnippet(item.snippet, result);
        continue;
      }

      // Match company website: at least one significant name word in title or URL
      if (!result.website) {
        const hasMatch = nameWords.some(
          (word) => titleLower.includes(word) || link.includes(word),
        );
        if (hasMatch) {
          // Extra check: reject blog posts, PDFs, news articles
          const isBlogOrArticle =
            link.includes("/blogg/") ||
            link.includes("/blog/") ||
            link.includes("/artikel/") ||
            link.includes("/article/") ||
            link.includes(".pdf") ||
            link.includes("/news/") ||
            link.includes("/nyheter/");
          if (!isBlogOrArticle) {
            result.website = item.link;
          }
        }
      }

      // Extract contact from any snippet
      extractContactFromSnippet(item.snippet, result);
    }

    return result;
  } catch (err) {
    console.error("Serper discovery error:", err);
    return result;
  }
}

// --- Website Quality Scoring ---
// Scores website quality based on real technical signals.
// A "good" site = modern, well-built (bad lead for a web agency).
// A "poor" site = outdated, needs work (good lead for a web agency).

// Booking platforms and profile pages that are NOT real websites.
// Booking platforms, social media, and link aggregators — never a real website
const NOT_A_REAL_WEBSITE = [
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "bokadirekt.se",
  "voady.com",
  "voady.se",
  "boka.se",
  "bokamera.se",
  "timecenter.se",
  "cliento.com",
  "wondr.se",
  "marketbooking.se",
  "booksy.com",
  "fresha.com",
  "treatwell.se",
  "treatwell.com",
  "mindbodyonline.com",
  "mindbody.io",
  "calendly.com",
  "acuityscheduling.com",
  "yelp.com",
  "tripadvisor.com",
  "tripadvisor.se",
  "linktr.ee",
  "linktree.com",
  "bio.link",
  "beacons.ai",
  "carrd.co",
];

async function scoreWebsite(websiteUrl: string): Promise<{
  website_score: number;
  website_quality: "none" | "poor" | "ok" | "good";
  pagespeed_data: Record<string, unknown>;
}> {
  const urlLower = websiteUrl.toLowerCase();
  const matchedPlatform = NOT_A_REAL_WEBSITE.find((domain) =>
    urlLower.includes(domain),
  );
  if (matchedPlatform) {
    return {
      website_score: 0,
      website_quality: "none",
      pagespeed_data: {
        skipped: true,
        reason: "profile_or_booking_site",
        platform: matchedPlatform,
      },
    };
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
    const details: Record<string, unknown> = { response_time_ms: responseTime };

    // 1. Site doesn't load
    if (!siteResponse.ok) {
      return {
        website_score: 0,
        website_quality: "poor",
        pagespeed_data: { error: true, status: siteResponse.status },
      };
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
    } else if (responseTime > 3000) {
      deductions += 10;
    } else if (responseTime > 2000) {
      deductions += 5;
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

    // 6. Outdated tech signals (-10 to -30)
    const outdatedSignals: string[] = [];

    // Table-based layout
    const tableCount = (htmlLower.match(/<table/g) || []).length;
    const divCount = (htmlLower.match(/<div/g) || []).length;
    if (tableCount > 3 && tableCount > divCount * 0.5) {
      outdatedSignals.push("table_layout");
    }

    // Excessive inline styles
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

    // Old jQuery
    const jqueryMatch = html.match(/jquery[.-]?([\d]+)\.([\d]+)/i);
    if (jqueryMatch) {
      const majorVer = parseInt(jqueryMatch[1], 10);
      if (majorVer < 3) {
        outdatedSignals.push("old_jquery");
      }
    }

    // No CSS at all
    const hasExternalCSS = /<link[^>]+\.css/i.test(html);
    if (!hasExternalCSS && !htmlLower.includes("<style")) {
      outdatedSignals.push("no_css");
    }

    // Old doctype
    if (
      !html.trim().toLowerCase().startsWith("<!doctype html>") &&
      !html.trim().toLowerCase().startsWith("<!doctype html ")
    ) {
      if (htmlLower.includes("xhtml") || htmlLower.includes("transitional")) {
        outdatedSignals.push("xhtml_doctype");
      } else if (!htmlLower.includes("<!doctype")) {
        outdatedSignals.push("no_doctype");
      }
    }

    // Frames
    if (
      htmlLower.includes("<frameset") ||
      (htmlLower.includes("<iframe") &&
        (htmlLower.match(/<iframe/g) || []).length > 3)
    ) {
      outdatedSignals.push("frames");
    }

    // Generator meta tag (old CMS versions)
    const generatorMatch = html.match(
      /meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i,
    );
    if (generatorMatch) {
      const gen = generatorMatch[1].toLowerCase();
      details.generator = generatorMatch[1];

      const wpMatch = gen.match(/wordpress\s*([\d.]+)/);
      if (wpMatch && parseFloat(wpMatch[1]) < 5.0) {
        outdatedSignals.push("old_wordpress");
      }
      if (
        gen.includes("joomla") &&
        !gen.includes("4.") &&
        !gen.includes("5.")
      ) {
        outdatedSignals.push("old_joomla");
      }
      if (gen.includes("drupal") && !gen.includes("9") && !gen.includes("10")) {
        outdatedSignals.push("old_drupal");
      }
    }

    // Font tags
    if (htmlLower.includes("<font")) {
      outdatedSignals.push("font_tags");
    }

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

    // 7. Modern framework detection (bonus, max +15)
    let modernBonus = 0;
    const modernFrameworks: string[] = [];

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

    if (
      htmlLower.includes("tailwind") ||
      /class="[^"]*(?:flex|grid|gap-|text-|bg-|p-|m-)\w/i.test(html)
    ) {
      modernFrameworks.push("tailwind");
      modernBonus += 5;
    }
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
    if (
      htmlLower.includes("wp-block-") ||
      htmlLower.includes("wp-element") ||
      htmlLower.includes("wp-json")
    ) {
      modernFrameworks.push("modern_wordpress");
      modernBonus += 5;
    }
    if (htmlLower.includes('loading="lazy"') || htmlLower.includes("lazyload"))
      modernBonus += 3;
    if (htmlLower.includes("preconnect") || htmlLower.includes("prefetch"))
      modernBonus += 2;

    if (modernFrameworks.length > 0)
      details.modern_frameworks = modernFrameworks;

    const finalScore = Math.max(
      0,
      Math.min(100, 100 - deductions + Math.min(15, modernBonus)),
    );
    const website_quality: "none" | "poor" | "ok" | "good" =
      finalScore >= 70 ? "good" : finalScore >= 40 ? "ok" : "poor";

    details.method = "advanced_http_check";
    details.html_size = html.length;
    details.has_ssl = finalUrl.startsWith("https://");
    details.has_viewport = hasViewport;
    details.is_parked = isParked;

    return {
      website_score: finalScore,
      website_quality,
      pagespeed_data: details,
    };
  } catch (err) {
    console.error("Website check error:", err);
    return {
      website_score: 0,
      website_quality: "poor",
      pagespeed_data: { error: true, message: String(err) },
    };
  }
}

// --- Lead Scoring ---

function calculateLeadScore(company: Record<string, unknown>): {
  score: number;
  segment: "hot_lead" | "warm_lead" | "cold_lead" | "nurture" | "disqualified";
  breakdown: Record<string, number>;
} {
  const breakdown: Record<string, number> = {};
  let score = 0;

  // Social media presence (max 40)
  if (company.has_facebook) {
    breakdown.has_facebook = 15;
    score += 15;
  }
  if (company.has_instagram) {
    breakdown.has_instagram = 15;
    score += 15;
  }
  if (company.has_facebook && company.has_instagram) {
    breakdown.both_social = 10;
    score += 10;
  }

  // Website quality (max 25 — no website = best lead for web agency)
  const wq = company.website_quality as string;
  if (wq === "none" || !company.website) {
    breakdown.website_none = 25;
    score += 25;
  } else if (wq === "poor") {
    breakdown.website_poor = 15;
    score += 15;
  } else if (wq === "ok") {
    breakdown.website_ok = 5;
    score += 5;
  } else if (wq === "good") {
    breakdown.website_good = -10;
    score -= 10;
  }

  // Company size / employees (max 10)
  const employees = company.employees_estimate as number | null;
  if (employees && employees >= 1 && employees <= 50) {
    breakdown.sme_target = 10;
    score += 10;
  } else if (employees && employees > 50 && employees <= 200) {
    breakdown.mid_size = 5;
    score += 5;
  }

  // Contact info available (max 10)
  if (company.phone_number) {
    breakdown.has_phone = 5;
    score += 5;
  }
  if (company.email) {
    breakdown.has_email = 5;
    score += 5;
  }

  // Negative signals
  const leadStatus = company.lead_status as string | null;
  if (leadStatus === "not_interested" || leadStatus === "bad_fit") {
    breakdown.disqualified = -50;
    score -= 50;
  }
  if (leadStatus === "closed_lost") {
    breakdown.closed_lost = -20;
    score -= 20;
  }

  // Clamp to 0-100
  score = Math.max(0, Math.min(100, score));

  // Determine segment
  let segment:
    | "hot_lead"
    | "warm_lead"
    | "cold_lead"
    | "nurture"
    | "disqualified";
  if (leadStatus === "not_interested" || leadStatus === "bad_fit") {
    segment = "disqualified";
  } else if (score >= 60) {
    segment = "hot_lead";
  } else if (score >= 35) {
    segment = "warm_lead";
  } else if (score >= 15) {
    segment = "cold_lead";
  } else {
    segment = "nurture";
  }

  return { score, segment, breakdown };
}

// --- Main Handler ---

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req, _user) => {
        if (req.method !== "POST") {
          return createErrorResponse(405, "Method Not Allowed");
        }

        try {
          const body = await parseRequiredJsonBody(req);
          const company_id = getPositiveIntegerField(body, "company_id", {
            required: true,
          });

          // Fetch company
          const { data: company, error: companyError } = await supabaseAdmin
            .from("companies")
            .select("*")
            .eq("id", company_id)
            .single();

          if (companyError || !company) {
            return createErrorResponse(404, "Company not found");
          }

          const enrichmentData: Record<string, unknown> = {};
          const socialResults = {
            facebook_url: company.facebook_url as string | null,
            instagram_url: company.instagram_url as string | null,
            has_facebook: company.has_facebook as boolean,
            has_instagram: company.has_instagram as boolean,
          };

          // Step 1: Serper.dev Discovery (website, social media, phone, email)
          const serperApiKey = Deno.env.get("SERPER_API_KEY");

          let discoveredWebsite: string | null = null;
          let discoveredPhoneNumbers: PhoneNumberEntry[] = [];
          let discoveredEmail: string | null = null;
          let currentWebsite = (company.website || "").trim();

          if (serperApiKey && company.name) {
            try {
              const serperResult = await discoverViaSerper(
                company.name,
                company.city,
                serperApiKey,
              );
              enrichmentData.serper_discovery = serperResult;

              // Website
              if (serperResult.website && !currentWebsite) {
                discoveredWebsite = serperResult.website;
                currentWebsite = discoveredWebsite;
                enrichmentData.discovered_website = discoveredWebsite;
              }

              // Phone
              discoveredPhoneNumbers = mergePhoneNumbers(
                discoveredPhoneNumbers,
                serperResult.phone_numbers,
              );

              // Email
              if (serperResult.email && !company.email) {
                discoveredEmail = serperResult.email;
              }

              // Social media (override if not already set)
              if (serperResult.facebook_url && !socialResults.facebook_url) {
                socialResults.facebook_url = serperResult.facebook_url;
                socialResults.has_facebook = true;
              }
              if (serperResult.instagram_url && !socialResults.instagram_url) {
                socialResults.instagram_url = serperResult.instagram_url;
                socialResults.has_instagram = true;
              }

              await supabaseAdmin.from("enrichment_log").insert({
                company_id,
                source: "serper",
                status: "success",
                enrichment_data: serperResult,
              });
            } catch (err) {
              console.error("Serper discovery failed:", err);
              await supabaseAdmin.from("enrichment_log").insert({
                company_id,
                source: "serper",
                status: "failed",
                error_message: String(err),
              });
            }
          }

          // Step 3: Website Quality Scoring
          let websiteResult = {
            website_score: company.website_score as number | null,
            website_quality: (company.website_quality || "none") as
              | "none"
              | "poor"
              | "ok"
              | "good",
            pagespeed_data: {} as Record<string, unknown>,
          };

          const websiteUrl = currentWebsite;
          const websiteUrlLower = websiteUrl.toLowerCase();
          const hasRealWebsite =
            websiteUrl.length > 0 &&
            !NOT_A_REAL_WEBSITE.some((domain) =>
              websiteUrlLower.includes(domain),
            );

          if (hasRealWebsite) {
            try {
              websiteResult = await scoreWebsite(websiteUrl);
              enrichmentData.pagespeed = websiteResult.pagespeed_data;

              await supabaseAdmin.from("enrichment_log").insert({
                company_id,
                source: "pagespeed",
                status: "success",
                enrichment_data: websiteResult.pagespeed_data,
              });
            } catch (err) {
              console.error("PageSpeed scoring failed:", err);
              await supabaseAdmin.from("enrichment_log").insert({
                company_id,
                source: "pagespeed",
                status: "failed",
                error_message: String(err),
              });
            }
          } else {
            websiteResult.website_quality = "none";
            websiteResult.website_score = 0;
          }

          // Step 4: Calculate Lead Score
          const finalWebsiteForScore = discoveredWebsite || company.website;
          const finalPhoneNumbers = mergePhoneNumbers(
            parseStoredPhoneNumbers(company.phone_numbers),
            company.phone_number
              ? createPhoneEntries([company.phone_number], "existing_primary")
              : [],
            discoveredPhoneNumbers,
          );
          const primaryPhone = choosePrimaryPhone(
            company.phone_number,
            finalPhoneNumbers,
          );
          const scoringInput = {
            ...company,
            ...socialResults,
            website_quality: websiteResult.website_quality,
            website: finalWebsiteForScore,
            phone_number: primaryPhone,
          };

          const { score, segment, breakdown } =
            calculateLeadScore(scoringInput);
          enrichmentData.scoring_breakdown = breakdown;

          // Update company
          const finalWebsite = discoveredWebsite || company.website;
          const updateData: Record<string, unknown> = {
            facebook_url: socialResults.facebook_url,
            instagram_url: socialResults.instagram_url,
            has_facebook: socialResults.has_facebook,
            has_instagram: socialResults.has_instagram,
            website_score: websiteResult.website_score,
            website_quality: websiteResult.website_quality,
            has_website:
              !!finalWebsite &&
              !NOT_A_REAL_WEBSITE.some((d) =>
                (finalWebsite as string).toLowerCase().includes(d),
              ),
            lead_score: score,
            segment,
            enrichment_data: enrichmentData,
            enriched_at: new Date().toISOString(),
          };

          // Save discovered data from Serper
          if (discoveredWebsite) {
            updateData.website = discoveredWebsite;
          }
          if (finalPhoneNumbers.length > 0) {
            updateData.phone_numbers = finalPhoneNumbers;
          }
          if (primaryPhone) {
            updateData.phone_number = primaryPhone;
          }
          if (discoveredEmail) {
            updateData.email = discoveredEmail;
          }

          // Save LinkedIn URL from Serper
          if (serperApiKey && enrichmentData.serper_discovery) {
            const serper =
              enrichmentData.serper_discovery as SerperDiscoveryResult;
            if (serper.linkedin_url && !company.linkedin_url) {
              updateData.linkedin_url = serper.linkedin_url;
            }
            if (serper.context_links && serper.context_links.length > 0) {
              updateData.context_links = serper.context_links;
            }
          }

          const { error: updateError } = await supabaseAdmin
            .from("companies")
            .update(updateData)
            .eq("id", company_id);

          if (updateError) {
            console.error("Company update error:", updateError);
            return createErrorResponse(500, "Failed to update company");
          }

          const result: EnrichmentResult = {
            facebook_url: socialResults.facebook_url,
            instagram_url: socialResults.instagram_url,
            has_facebook: socialResults.has_facebook,
            has_instagram: socialResults.has_instagram,
            website_score: websiteResult.website_score,
            website_quality: websiteResult.website_quality,
            lead_score: score,
            segment,
            enrichment_data: enrichmentData,
          };

          return createJsonResponse(result);
        } catch (error) {
          console.error("enrich_company error:", error);
          return errorResponseFromUnknown(error);
        }
      }),
    ),
  ),
);
