/**
 * Re-enrich ALL imported companies to get updated results with fixed blocklist.
 *
 * Usage: npx tsx scripts/re-enrich-all-imported.ts
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SERVICE_KEY = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "password";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  // Find all imported companies that don't have a website
  const { data: companies, error: fetchErr } = await supabase
    .from("companies")
    .select("id, name, city")
    .eq("source", "import")
    .is("website", null)
    .order("id", { ascending: true })
    .limit(200);

  if (fetchErr) {
    console.error("Fetch error:", fetchErr.message);
    return;
  }

  console.log(
    `Found ${companies?.length ?? 0} companies without website to re-enrich.\n`,
  );
  if (!companies || companies.length === 0) return;

  // Auth
  const { data: authData, error: authError } =
    await supabase.auth.signInWithPassword({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });

  if (authError || !authData.session) {
    console.error("Auth failed:", authError?.message);
    return;
  }

  const authClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${authData.session.access_token}`,
      },
    },
  });

  let enriched = 0;
  let failed = 0;
  let foundWebsite = 0;

  for (let i = 0; i < companies.length; i++) {
    const company = companies[i];
    const progress = `[${i + 1}/${companies.length}]`;

    try {
      const { data, error } = await authClient.functions.invoke(
        "enrich_company",
        { body: { company_id: company.id } },
      );

      if (error) {
        console.error(`${progress} ERROR ${company.name}:`, error.message);
        failed++;
        continue;
      }

      const website = data?.enrichment_data?.discovered_website || "—";
      const fb = data?.facebook_url ? "FB" : "—";
      const ig = data?.instagram_url ? "IG" : "—";
      const li = data?.enrichment_data?.serper_discovery?.linkedin_url
        ? "LI"
        : "—";
      const phone = data?.enrichment_data?.serper_discovery?.phone || "—";
      const email = data?.enrichment_data?.serper_discovery?.email || "—";
      const score = data?.lead_score ?? "—";
      const ctx =
        data?.enrichment_data?.serper_discovery?.context_links?.length ?? 0;

      if (website !== "—") foundWebsite++;

      console.log(
        `${progress} ${company.name}: web=${website} | ${fb}/${ig}/${li} | tel=${phone} | email=${email} | score=${score} | ctx=${ctx}`,
      );
      enriched++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${progress} EXCEPTION ${company.name}:`, msg);
      failed++;
    }

    // Rate limit
    if (i < companies.length - 1) {
      await sleep(1500);
    }
  }

  console.log(`\n=== DONE ===`);
  console.log(`Re-enriched: ${enriched}`);
  console.log(`Found website: ${foundWebsite}`);
  console.log(`Failed: ${failed}`);
}

main().catch(console.error);
