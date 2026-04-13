import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { OptionsMiddleware } from "../_shared/cors.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import {
  errorResponseFromUnknown,
  getEnumField,
  getPositiveIntegerField,
  parseOptionalJsonBody,
} from "../_shared/http.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse, createJsonResponse } from "../_shared/utils.ts";

const RUNNING_STALE_MINUTES = 30;
const ENRICH_DELAY_MS = 300;

type TriggeredBy = "manual" | "scheduled";

type LeadImportSource = {
  id: number;
  name: string;
  source_type: "google_sheet_csv";
  sheet_url: string;
  sheet_gid: string | null;
  is_active: boolean;
  batch_size_default: number;
  last_imported_row: number;
  last_successful_run_at: string | null;
  last_run_status: "idle" | "running" | "success" | "partial" | "failed";
  last_run_message: string | null;
};

type LeadImportRun = {
  id: number;
  source_id: number;
  triggered_by: TriggeredBy;
  requested_batch_size: number;
  started_at: string;
  finished_at: string | null;
  rows_scanned: number;
  rows_inserted: number;
  rows_skipped_duplicates: number;
  rows_failed: number;
  status: "running" | "success" | "partial" | "failed";
  error_summary: string | null;
  imported_company_ids: number[];
};

type ParsedSheetRow = {
  sourceRowNumber: number;
  company: {
    name: string;
    org_number: string;
    address: string | null;
    zipcode: string | null;
    city: string | null;
    state_abbr: string;
    country: string;
    description: string | null;
    source: "import";
    lead_status: "new";
    pipeline_state: "new";
    data_quality_status: "missing_contact";
    email?: string | null;
    prospecting_status: "imported";
    source_row_number: number;
    processing_order: number;
    import_source_id: number;
    import_run_id: number;
    enrichment_data: Record<string, unknown>;
  };
};

const SWEDISH_COUNTY_CODES: Record<string, string> = {
  stockholm: "AB",
  stockholms_lan: "AB",
  uppsala: "C",
  uppsala_lan: "C",
  sodermanland: "D",
  sodermanlands_lan: "D",
  ostergotland: "E",
  ostergotlands_lan: "E",
  jonkoping: "F",
  jonkopings_lan: "F",
  kronoberg: "G",
  kronobergs_lan: "G",
  kalmar: "H",
  kalmar_lan: "H",
  gotland: "I",
  gotlands_lan: "I",
  blekinge: "K",
  blekinge_lan: "K",
  skane: "M",
  skane_lan: "M",
  halland: "N",
  hallands_lan: "N",
  vastra_gotaland: "O",
  vastra_gotalands_lan: "O",
  varmland: "S",
  varmlands_lan: "S",
  orebro: "T",
  orebro_lan: "T",
  vastmanland: "U",
  vastmanlands_lan: "U",
  dalarna: "W",
  dalarnas_lan: "W",
  gavleborg: "X",
  gavleborgs_lan: "X",
  vasternorrland: "Y",
  vasternorrlands_lan: "Y",
  jamtland: "Z",
  jamtlands_lan: "Z",
  vasterbotten: "AC",
  vasterbottens_lan: "AC",
  norrbotten: "BD",
  norrbottens_lan: "BD",
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isCronAuthorized(req: Request): boolean {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const providedSecret =
    req.headers.get("x-cron-secret") ||
    new URL(req.url).searchParams.get("secret");

  return !!cronSecret && providedSecret === cronSecret;
}

function normalizeHeader(header: string) {
  return header
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function capitalizeCity(value: string | undefined) {
  if (!value) return null;
  return value
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function deriveStateAbbr(row: Record<string, string>) {
  const rawValue =
    row.state_abbr ||
    row.lan_kod ||
    row.lan ||
    row.lan_namn ||
    row.county ||
    row.region ||
    "";
  const cleaned = normalizeHeader(rawValue);

  if (!cleaned) return "Z";
  if (cleaned.length <= 3 && /^[a-z]+$/i.test(cleaned)) {
    return cleaned.toUpperCase();
  }

  return SWEDISH_COUNTY_CODES[cleaned] || "Z";
}

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = "";
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    const nextChar = csv[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentValue += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentValue);
      currentValue = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        i++;
      }
      currentRow.push(currentValue);
      rows.push(currentRow);
      currentRow = [];
      currentValue = "";
      continue;
    }

    currentValue += char;
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    currentRow.push(currentValue);
    rows.push(currentRow);
  }

  return rows.filter((row) => row.some((cell) => cell.trim().length > 0));
}

function buildGoogleSheetCsvUrl(source: LeadImportSource) {
  try {
    const url = new URL(source.sheet_url);
    const match = url.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
    const sheetId = match?.[1];
    const gid = source.sheet_gid || url.searchParams.get("gid") || "0";
    if (!sheetId) return source.sheet_url;
    return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  } catch {
    return source.sheet_url;
  }
}

function mapRowToCompany(
  row: Record<string, string>,
  sourceRowNumber: number,
  sourceId: number,
  runId: number,
): ParsedSheetRow | null {
  const orgNumber = (
    row.orgnr ||
    row.org_number ||
    row.organisationsnummer ||
    row.organizationsnummer ||
    ""
  )
    .replace(/\s+/g, "")
    .trim();
  const name = (row.namn || row.name || row.foretagsnamn || "").trim();

  if (!orgNumber || !name) {
    return null;
  }

  const address = (
    row.gatuadress ||
    row.address ||
    row.adress ||
    ""
  ).trim();
  const zipcode = (
    row.postnummer ||
    row.zipcode ||
    row.postnr ||
    ""
  )
    .replace(/\s+/g, "")
    .trim();
  const city = capitalizeCity(row.ort || row.city || row.postort || row.kommun);
  const email = (row.email || row.epost || row.e_post || "").trim().toLowerCase();
  const description = (
    row.verksamhetsbeskrivning ||
    row.description ||
    row.beskrivning ||
    ""
  ).trim();

  return {
    sourceRowNumber,
    company: {
      name,
      org_number: orgNumber,
      address: address || null,
      zipcode: zipcode || null,
      city,
      state_abbr: deriveStateAbbr(row),
      country: "Sweden",
      description: description || null,
      source: "import",
      lead_status: "new",
      pipeline_state: "new",
      data_quality_status: "missing_contact",
      email: email || null,
      prospecting_status: "imported",
      source_row_number: sourceRowNumber,
      processing_order: sourceRowNumber,
      import_source_id: sourceId,
      import_run_id: runId,
      enrichment_data: {
        import_source: "google_sheet_csv",
        imported_at: new Date().toISOString(),
        source_row_number: sourceRowNumber,
        raw_import: {
          email: email || null,
          organisationsform:
            row.organisationsform || row.organisations_form || null,
          kommun: row.kommun || null,
          registreringsdatum: row.registreringsdatum || null,
          co_adress: row.co_adress || row.coaddress || null,
        },
      },
    },
  };
}

async function fetchSourceById(sourceId?: number) {
  let query = supabaseAdmin
    .from("lead_import_sources")
    .select("*")
    .limit(1);

  query = sourceId ? query.eq("id", sourceId) : query.eq("is_active", true);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data as LeadImportSource | null;
}

async function claimSource(sourceId: number) {
  const staleBefore = new Date(
    Date.now() - RUNNING_STALE_MINUTES * 60_000,
  ).toISOString();

  const { data, error } = await supabaseAdmin.rpc("claim_lead_import_source", {
    p_source_id: sourceId,
    p_stale_before: staleBefore,
  });

  if (error) throw error;

  const claimed = Array.isArray(data) ? data[0] : null;
  return (claimed as LeadImportSource | null) ?? null;
}

async function updateSourceStatus(
  sourceId: number,
  update: Partial<LeadImportSource>,
) {
  const { error } = await supabaseAdmin
    .from("lead_import_sources")
    .update(update)
    .eq("id", sourceId);

  if (error) throw error;
}

async function createRun(
  source: LeadImportSource,
  triggeredBy: TriggeredBy,
  batchSize: number,
) {
  const { data, error } = await supabaseAdmin
    .from("lead_import_runs")
    .insert({
      source_id: source.id,
      triggered_by: triggeredBy,
      requested_batch_size: batchSize,
      status: "running",
    })
    .select("*")
    .single();

  if (error) throw error;
  return {
    ...(data as Omit<LeadImportRun, "imported_company_ids">),
    imported_company_ids: ((data?.imported_company_ids as number[]) || []).map(
      Number,
    ),
  } as LeadImportRun;
}

async function finalizeRun(
  source: LeadImportSource,
  runId: number,
  payload: {
    status: LeadImportRun["status"];
    rows_scanned: number;
    rows_inserted: number;
    rows_skipped_duplicates: number;
    rows_failed: number;
    imported_company_ids: number[];
    error_summary?: string | null;
    last_imported_row?: number;
  },
) {
  const finishedAt = new Date().toISOString();
  const sourceUpdate: Record<string, unknown> = {
    last_run_status: payload.status,
    last_run_message:
      payload.error_summary ||
      `Scanned ${payload.rows_scanned}, inserted ${payload.rows_inserted}`,
  };

  if (payload.status === "success" || payload.status === "partial") {
    sourceUpdate.last_successful_run_at = finishedAt;
  }
  if (typeof payload.last_imported_row === "number") {
    sourceUpdate.last_imported_row = payload.last_imported_row;
  }

  const { error: runError } = await supabaseAdmin
    .from("lead_import_runs")
    .update({
      finished_at: finishedAt,
      status: payload.status,
      rows_scanned: payload.rows_scanned,
      rows_inserted: payload.rows_inserted,
      rows_skipped_duplicates: payload.rows_skipped_duplicates,
      rows_failed: payload.rows_failed,
      imported_company_ids: payload.imported_company_ids,
      error_summary: payload.error_summary ?? null,
    })
    .eq("id", runId);

  if (runError) throw runError;
  await updateSourceStatus(source.id, sourceUpdate);
}

async function fetchParsedRows(source: LeadImportSource) {
  const csvUrl = buildGoogleSheetCsvUrl(source);
  const response = await fetch(csvUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch Google Sheet CSV (${response.status})`);
  }

  const csv = await response.text();
  const rows = parseCsv(csv);
  if (rows.length < 2) return [];

  const headers = rows[0].map(normalizeHeader);
  return rows.slice(1).map((values, index) => {
    const rowRecord: Record<string, string> = {};
    headers.forEach((header, valueIndex) => {
      rowRecord[header] = (values[valueIndex] ?? "").trim();
    });

    return {
      sourceRowNumber: index + 2,
      rowRecord,
    };
  });
}

async function enrichImportedCompanies(
  companyIds: number[],
  req: Request,
) {
  const functionUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/enrich_company`;
  const results: Array<{ company_id: number; success: boolean; error?: string }> =
    [];

  for (const companyId of companyIds) {
    const { error: markError } = await supabaseAdmin
      .from("companies")
      .update({ prospecting_status: "enriching" })
      .eq("id", companyId);
    if (markError) {
      results.push({
        company_id: companyId,
        success: false,
        error: markError.message,
      });
      continue;
    }

    const headers = new Headers({ "Content-Type": "application/json" });
    if (isCronAuthorized(req)) {
      const cronSecret = Deno.env.get("CRON_SECRET");
      if (cronSecret) headers.set("x-cron-secret", cronSecret);
    } else {
      const authHeader = req.headers.get("authorization");
      if (authHeader) headers.set("authorization", authHeader);
    }

    try {
      const response = await fetch(functionUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ company_id: companyId }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message =
          typeof result?.message === "string"
            ? result.message
            : `Enrichment failed (${response.status})`;
        await supabaseAdmin
          .from("companies")
          .update({ prospecting_status: "needs_review" })
          .eq("id", companyId);
        results.push({ company_id: companyId, success: false, error: message });
      } else {
        const { data: company } = await supabaseAdmin
          .from("companies")
          .select("phone_number")
          .eq("id", companyId)
          .single();
        const nextStatus = company?.phone_number ? "call_ready" : "needs_review";
        await supabaseAdmin
          .from("companies")
          .update({ prospecting_status: nextStatus })
          .eq("id", companyId);
        results.push({ company_id: companyId, success: true });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await supabaseAdmin
        .from("companies")
        .update({ prospecting_status: "needs_review" })
        .eq("id", companyId);
      results.push({ company_id: companyId, success: false, error: message });
    }

    await sleep(ENRICH_DELAY_MS);
  }

  return results;
}

async function handleRetryEnrichment(runId: number, req: Request) {
  const { data: run, error } = await supabaseAdmin
    .from("lead_import_runs")
    .select("id, imported_company_ids")
    .eq("id", runId)
    .single();
  if (error || !run) {
    return createErrorResponse(404, "Import run not found");
  }

  const companyIds = Array.isArray(run.imported_company_ids)
    ? run.imported_company_ids.map((value) => Number(value)).filter(Boolean)
    : [];

  const enrichmentResults = await enrichImportedCompanies(companyIds, req);
  const failed = enrichmentResults.filter((item) => !item.success);

  return createJsonResponse({
    run_id: runId,
    retried_companies: companyIds.length,
    enrichment_results: enrichmentResults,
    failed_count: failed.length,
  });
}

async function handleImportNext(
  source: LeadImportSource,
  batchSize: number,
  triggeredBy: TriggeredBy,
  req: Request,
) {
  const claimedSource = await claimSource(source.id);
  if (!claimedSource) {
    return createErrorResponse(
      409,
      "An import is already running for the active lead source",
    );
  }

  const run = await createRun(claimedSource, triggeredBy, batchSize);

  try {
    const parsedRows = await fetchParsedRows(claimedSource);
    const pendingRows = parsedRows
      .filter((row) => row.sourceRowNumber > claimedSource.last_imported_row)
      .slice(0, batchSize);

    if (pendingRows.length === 0) {
      await finalizeRun(claimedSource, run.id, {
        status: "success",
        rows_scanned: 0,
        rows_inserted: 0,
        rows_skipped_duplicates: 0,
        rows_failed: 0,
        imported_company_ids: [],
        error_summary: "No rows left to import",
      });

      return createJsonResponse({
        source_id: claimedSource.id,
        run_id: run.id,
        rows_scanned: 0,
        rows_inserted: 0,
        rows_skipped_duplicates: 0,
        rows_failed: 0,
        imported_company_ids: [],
        enrichment_results: [],
        last_imported_row: claimedSource.last_imported_row,
        message: "No rows left to import",
      });
    }

    const importedCompanyIds: number[] = [];
    const errors: string[] = [];
    let rowsInserted = 0;
    let rowsSkippedDuplicates = 0;
    let rowsFailed = 0;
    let lastProcessedRow = claimedSource.last_imported_row;

    for (const pendingRow of pendingRows) {
      lastProcessedRow = pendingRow.sourceRowNumber;
      const mapped = mapRowToCompany(
        pendingRow.rowRecord,
        pendingRow.sourceRowNumber,
        claimedSource.id,
        run.id,
      );

      if (!mapped) {
        rowsFailed++;
        errors.push(`Row ${pendingRow.sourceRowNumber}: missing company name or org number`);
        continue;
      }

      const { data: existing, error: existingError } = await supabaseAdmin
        .from("companies")
        .select("id")
        .eq("org_number", mapped.company.org_number)
        .maybeSingle();

      if (existingError) {
        rowsFailed++;
        errors.push(`Row ${pendingRow.sourceRowNumber}: ${existingError.message}`);
        continue;
      }

      if (existing) {
        rowsSkippedDuplicates++;
        continue;
      }

      const { data: inserted, error: insertError } = await supabaseAdmin
        .from("companies")
        .insert(mapped.company)
        .select("id")
        .single();

      if (insertError || !inserted) {
        rowsFailed++;
        errors.push(`Row ${pendingRow.sourceRowNumber}: ${insertError?.message || "insert failed"}`);
        continue;
      }

      rowsInserted++;
      importedCompanyIds.push(Number(inserted.id));
    }

    const enrichmentResults = await enrichImportedCompanies(importedCompanyIds, req);
    const enrichmentFailures = enrichmentResults.filter((item) => !item.success);

    const status: LeadImportRun["status"] =
      rowsFailed > 0 || enrichmentFailures.length > 0
        ? rowsInserted > 0
          ? "partial"
          : "failed"
        : "success";

    const errorSummary =
      errors.length > 0 || enrichmentFailures.length > 0
        ? [
            ...errors,
            ...enrichmentFailures.map(
              (failure) =>
                `Company ${failure.company_id}: ${failure.error || "enrichment failed"}`,
            ),
          ]
            .slice(0, 20)
            .join(" | ")
        : null;

    await finalizeRun(claimedSource, run.id, {
      status,
      rows_scanned: pendingRows.length,
      rows_inserted: rowsInserted,
      rows_skipped_duplicates: rowsSkippedDuplicates,
      rows_failed: rowsFailed,
      imported_company_ids: importedCompanyIds,
      error_summary: errorSummary,
      last_imported_row: lastProcessedRow,
    });

    return createJsonResponse({
      source_id: claimedSource.id,
      run_id: run.id,
      rows_scanned: pendingRows.length,
      rows_inserted: rowsInserted,
      rows_skipped_duplicates: rowsSkippedDuplicates,
      rows_failed: rowsFailed,
      imported_company_ids: importedCompanyIds,
      enrichment_results: enrichmentResults,
      last_imported_row: lastProcessedRow,
      status,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown import error";

    await finalizeRun(claimedSource, run.id, {
      status: "failed",
      rows_scanned: 0,
      rows_inserted: 0,
      rows_skipped_duplicates: 0,
      rows_failed: 1,
      imported_company_ids: [],
      error_summary: errorMessage,
    });

    throw error;
  }
}

async function handleRequest(req: Request, triggeredBy: TriggeredBy) {
  const body = (await parseOptionalJsonBody(req)) ?? {};
  const action =
    getEnumField(body, "action", ["import_next", "retry_enrichment"] as const) ||
    "import_next";

  if (action === "retry_enrichment") {
    const runId = getPositiveIntegerField(body, "run_id", {
      required: true,
    });
    return handleRetryEnrichment(runId as number, req);
  }

  const sourceId = getPositiveIntegerField(body, "source_id");
  const source = await fetchSourceById(sourceId);
  if (!source) {
    return createErrorResponse(404, "Active Google Sheet source not found");
  }

  const batchSize =
    getPositiveIntegerField(body, "batch_size") || source.batch_size_default;

  return handleImportNext(source, batchSize, triggeredBy, req);
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) => {
    if (req.method !== "POST") {
      return createErrorResponse(405, "Method Not Allowed");
    }

    try {
      if (isCronAuthorized(req)) {
        return await handleRequest(req, "scheduled");
      }

      return await AuthMiddleware(req, async (req) =>
        UserMiddleware(req, async (req) => handleRequest(req, "manual")),
      );
    } catch (error) {
      console.error("import_google_sheet_leads error:", error);
      return errorResponseFromUnknown(error);
    }
  }),
);
