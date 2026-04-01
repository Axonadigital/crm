/**
 * Import rows 41–140 from Bolagsverket bulk file and enrich them.
 *
 * Uses upsert with onConflict to handle duplicates gracefully.
 * Then calls enrich_company edge function for each new company.
 *
 * Usage: npx tsx scripts/import-and-enrich-100.ts
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SERVICE_KEY = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const CSV_PATH =
  "/mnt/c/Users/rasmu/Downloads/bolagsverket_bulkfil/jamtland_aktiva_bolag.csv";

// Rows 41–140 (0-indexed: skip first 40 already imported, take next 100)
const SKIP = 40;
const LIMIT = 100;

// Auth credentials for edge function calls
const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "password";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

interface BolagsverketRow {
  orgnr: string;
  namn: string;
  organisationsform: string;
  kommun: string;
  registreringsdatum: string;
  gatuadress: string;
  co_adress: string;
  ort: string;
  postnummer: string;
  verksamhetsbeskrivning: string;
}

function parseCsv(raw: string): BolagsverketRow[] {
  const lines = raw.split("\n").filter((l) => l.trim());
  const headers = lines[0].split(";");
  return lines.slice(1).map((line) => {
    const values = line.split(";");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h.trim()] = (values[i] ?? "").trim();
    });
    return row as unknown as BolagsverketRow;
  });
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function mapToCompany(row: BolagsverketRow) {
  return {
    name: row.namn,
    org_number: row.orgnr,
    address: row.gatuadress || null,
    zipcode: row.postnummer || null,
    city: capitalize(row.ort) || null,
    state_abbr: "Z",
    country: "Sweden",
    description: row.verksamhetsbeskrivning || null,
    source: "import" as const,
    lead_status: "new" as const,
    pipeline_state: "new" as const,
    data_quality_status: "missing_contact" as const,
    enrichment_data: {
      organisationsform: row.organisationsform,
      kommun: row.kommun,
      registreringsdatum: row.registreringsdatum,
      co_adress: row.co_adress || null,
      import_source: "bolagsverket_bulkfil",
      imported_at: new Date().toISOString(),
    },
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  // --- STEP 1: Import ---
  console.log("=== IMPORT ===\n");
  console.log("Reading CSV...");
  const raw = readFileSync(CSV_PATH, "utf-8");
  const rows = parseCsv(raw);
  console.log(
    `Parsed ${rows.length} rows total. Taking rows ${SKIP + 1}–${SKIP + LIMIT}.`,
  );

  const batch = rows.slice(SKIP, SKIP + LIMIT);
  if (batch.length === 0) {
    console.log("No rows in range.");
    return;
  }

  // Insert one by one with upsert to handle duplicates gracefully
  const inserted: Array<{ id: number; name: string; org_number: string }> = [];
  const skipped: string[] = [];

  for (const row of batch) {
    const company = mapToCompany(row);

    // Check if already exists
    const { data: existing } = await supabase
      .from("companies")
      .select("id, org_number")
      .eq("org_number", row.orgnr)
      .maybeSingle();

    if (existing) {
      skipped.push(row.orgnr);
      continue;
    }

    const { data, error } = await supabase
      .from("companies")
      .insert(company)
      .select("id, name, org_number")
      .single();

    if (error) {
      if (error.code === "23505") {
        // Duplicate — race condition, skip
        skipped.push(row.orgnr);
        continue;
      }
      console.error(
        `ERROR inserting ${row.namn} (${row.orgnr}):`,
        error.message,
      );
      continue;
    }

    inserted.push(data);
  }

  console.log(`\nInserted: ${inserted.length}`);
  console.log(`Skipped (already exist): ${skipped.length}`);

  if (inserted.length === 0) {
    console.log("Nothing new to enrich.");
    return;
  }

  // --- STEP 2: Enrich ---
  console.log("\n=== ENRICH ===\n");

  // Sign in to get auth token for edge function
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
  let enrichFailed = 0;

  for (let i = 0; i < inserted.length; i++) {
    const company = inserted[i];
    const progress = `[${i + 1}/${inserted.length}]`;

    try {
      const { data, error } = await authClient.functions.invoke(
        "enrich_company",
        {
          body: { company_id: company.id },
        },
      );

      if (error) {
        console.error(
          `${progress} ENRICH ERROR ${company.name}:`,
          error.message,
        );
        enrichFailed++;
        continue;
      }

      const website = data?.website || "—";
      const phone = data?.phone_number || "—";
      const email = data?.email || "—";
      const score = data?.lead_score ?? "—";
      const links = data?.context_links?.length ?? 0;

      console.log(
        `${progress} ${company.name}: web=${website} | tel=${phone} | email=${email} | score=${score} | links=${links}`,
      );
      enriched++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${progress} EXCEPTION ${company.name}:`, msg);
      enrichFailed++;
    }

    // Small delay to avoid hammering Serper API rate limits
    if (i < inserted.length - 1) {
      await sleep(1500);
    }
  }

  console.log(`\n=== DONE ===`);
  console.log(`Imported: ${inserted.length}`);
  console.log(`Enriched: ${enriched}`);
  console.log(`Enrich failed: ${enrichFailed}`);
}

main().catch(console.error);
