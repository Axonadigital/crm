/**
 * Test enrichment on an imported company.
 * Logs in via Supabase Auth, then calls enrich_company edge function.
 *
 * Usage: npx tsx scripts/test-enrich.ts [company_id]
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "http://127.0.0.1:54321";
const ANON_KEY = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

const supabase = createClient(SUPABASE_URL, ANON_KEY);

async function main() {
  const companyId = parseInt(process.argv[2] || "115", 10);

  // Sign in with a test user — check if one exists or create one
  console.log("Signing in...");
  const { data: authData, error: authError } =
    await supabase.auth.signInWithPassword({
      email: "admin@example.com",
      password: "password",
    });

  if (authError) {
    // Try signing up
    console.log("No existing user, signing up...");
    const { data: signUp, error: signUpError } = await supabase.auth.signUp({
      email: "admin@example.com",
      password: "password",
    });
    if (signUpError) {
      console.error("Auth failed:", signUpError);
      return;
    }
    console.log("Signed up:", signUp.user?.id);
  } else {
    console.log("Signed in:", authData.user?.id);
  }

  // Get the session token
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    console.error("No session");
    return;
  }

  // First show the company before enrichment
  const { data: before } = await supabase
    .from("companies")
    .select(
      "id, name, website, website_quality, website_score, lead_score, segment, has_facebook, has_instagram, facebook_url, instagram_url, enriched_at",
    )
    .eq("id", companyId)
    .single();

  console.log("\n=== BEFORE ENRICHMENT ===");
  console.log(JSON.stringify(before, null, 2));

  // Call enrichment
  console.log(`\nEnriching company ${companyId}...`);
  const { data, error } = await supabase.functions.invoke("enrich_company", {
    body: { company_id: companyId },
  });

  if (error) {
    console.error("ENRICHMENT ERROR:", error);
    return;
  }

  console.log("\n=== ENRICHMENT RESULT ===");
  console.log(JSON.stringify(data, null, 2));

  // Read back the company to verify
  const { data: after } = await supabase
    .from("companies")
    .select(
      "id, name, website, website_quality, website_score, lead_score, segment, has_facebook, has_instagram, has_website, facebook_url, instagram_url, enriched_at, enrichment_data",
    )
    .eq("id", companyId)
    .single();

  console.log("\n=== AFTER ENRICHMENT ===");
  console.log(JSON.stringify(after, null, 2));
}

main().catch(console.error);
