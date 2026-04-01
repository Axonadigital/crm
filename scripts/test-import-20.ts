/**
 * Test import: 20 companies from Bolagsverket bulk file → CRM companies table
 *
 * Usage: npx tsx scripts/test-import-20.ts
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SERVICE_KEY = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const CSV_PATH =
  "/mnt/c/Users/rasmu/Downloads/bolagsverket_bulkfil/jamtland_aktiva_bolag.csv";
const LIMIT = 20;

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
    state_abbr: "Z", // Jämtlands län
    country: "Sweden",
    description: row.verksamhetsbeskrivning || null,
    source: "import",
    lead_status: "new",
    pipeline_state: "new",
    data_quality_status: "missing_contact",
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

async function main() {
  console.log("Reading CSV...");
  const raw = readFileSync(CSV_PATH, "utf-8");
  const rows = parseCsv(raw);
  console.log(`Parsed ${rows.length} rows total. Taking first ${LIMIT}.`);

  const batch = rows.slice(0, LIMIT);

  // Check for existing org_numbers to avoid duplicates
  const orgNumbers = batch.map((r) => r.orgnr);
  const { data: existing } = await supabase
    .from("companies")
    .select("org_number")
    .in("org_number", orgNumbers);

  const existingSet = new Set((existing ?? []).map((e) => e.org_number));
  const toInsert = batch.filter((r) => !existingSet.has(r.orgnr));

  if (existingSet.size > 0) {
    console.log(
      `Skipping ${existingSet.size} duplicates: ${[...existingSet].join(", ")}`,
    );
  }

  if (toInsert.length === 0) {
    console.log("Nothing to insert — all 20 already exist.");
    return;
  }

  const companies = toInsert.map(mapToCompany);
  console.log(`\nInserting ${companies.length} companies...`);

  const { data, error } = await supabase
    .from("companies")
    .insert(companies)
    .select();

  if (error) {
    console.error("INSERT ERROR:", error);
    return;
  }

  console.log(`\n✓ Successfully inserted ${data.length} companies!\n`);

  // Verify by reading back from companies_summary view
  const insertedIds = data.map((d) => d.id);
  const { data: verify, error: verifyErr } = await supabase
    .from("companies_summary")
    .select(
      "id, name, org_number, city, zipcode, address, description, source, lead_status, pipeline_state, data_quality_status, enrichment_data",
    )
    .in("id", insertedIds);

  if (verifyErr) {
    console.error("VERIFY ERROR:", verifyErr);
    return;
  }

  console.log("=== VERIFICATION ===\n");
  for (const c of verify ?? []) {
    console.log(`[${c.id}] ${c.name}`);
    console.log(`  org_number: ${c.org_number}`);
    console.log(`  address: ${c.address}`);
    console.log(`  zipcode: ${c.zipcode}, city: ${c.city}`);
    console.log(`  description: ${c.description?.substring(0, 80)}...`);
    console.log(`  source: ${c.source}, lead_status: ${c.lead_status}`);
    console.log(`  pipeline_state: ${c.pipeline_state}`);
    console.log(`  data_quality: ${c.data_quality_status}`);
    console.log(
      `  enrichment_data.organisationsform: ${c.enrichment_data?.organisationsform}`,
    );
    console.log(`  enrichment_data.kommun: ${c.enrichment_data?.kommun}`);
    console.log("");
  }

  console.log(`Total inserted: ${data.length}/${batch.length}`);
  console.log(`Duplicates skipped: ${existingSet.size}`);
}

main().catch(console.error);
