import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

/**
 * Discord Bot API Gateway
 *
 * Authenticated via X-Bot-Secret header (shared secret between CRM and Gideon).
 * Provides read/write access to CRM data for the Gideon Discord bot.
 *
 * Supported actions:
 *   - list_deals: List deals with optional stage filter
 *   - list_companies: List companies with optional lead_status filter
 *   - get_pipeline_summary: Aggregate deal counts and amounts by stage
 *   - get_weekly_report: Summary of CRM activity this week
 *   - create_contact: Create a new contact
 *   - create_company: Create a new company
 *   - list_followups: List overdue call log follow-ups
 *   - list_tasks_due: List overdue undone tasks
 */

interface ActionRequest {
  action: string;
  [key: string]: unknown;
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

// --- Action handlers ---

async function listDeals(filters: Record<string, unknown>) {
  let query = supabaseAdmin
    .from("deals")
    .select(
      "id, name, stage, amount, category, created_at, updated_at, company_id, sales_id, companies(name)",
    )
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (filters.stage) {
    query = query.eq("stage", filters.stage);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function listCompanies(filters: Record<string, unknown>) {
  let query = supabaseAdmin
    .from("companies")
    .select(
      "id, name, lead_status, source, industry, website, phone_number, city, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (filters.lead_status) {
    query = query.eq("lead_status", filters.lead_status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function getPipelineSummary() {
  const { data, error } = await supabaseAdmin
    .from("deals")
    .select("stage, amount")
    .is("archived_at", null);

  if (error) throw error;

  const summary: Record<string, { count: number; total_amount: number }> = {};
  let totalDeals = 0;
  let totalAmount = 0;

  for (const deal of data || []) {
    const stage = deal.stage || "unknown";
    if (!summary[stage]) {
      summary[stage] = { count: 0, total_amount: 0 };
    }
    summary[stage].count += 1;
    summary[stage].total_amount += deal.amount || 0;
    totalDeals += 1;
    totalAmount += deal.amount || 0;
  }

  return {
    stages: summary,
    total_deals: totalDeals,
    total_amount: totalAmount,
  };
}

async function getWeeklyReport() {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const weekStart = oneWeekAgo.toISOString();

  const [companies, deals, quotes, callLogs] = await Promise.all([
    supabaseAdmin
      .from("companies")
      .select("id", { count: "exact", head: true })
      .gte("created_at", weekStart),
    supabaseAdmin
      .from("deals")
      .select("id, stage, amount")
      .gte("created_at", weekStart),
    supabaseAdmin
      .from("quotes")
      .select("id, status, total_amount")
      .gte("created_at", weekStart),
    supabaseAdmin
      .from("call_logs")
      .select("id", { count: "exact", head: true })
      .gte("created_at", weekStart),
  ]);

  const dealsData = deals.data || [];
  const quotesData = quotes.data || [];

  return {
    new_companies: companies.count || 0,
    new_deals: dealsData.length,
    deals_total_amount: dealsData.reduce((sum, d) => sum + (d.amount || 0), 0),
    deals_won: dealsData.filter((d) => d.stage === "won").length,
    quotes_created: quotesData.length,
    quotes_sent: quotesData.filter((q) => q.status !== "draft").length,
    quotes_signed: quotesData.filter((q) => q.status === "signed").length,
    quotes_total_amount: quotesData.reduce(
      (sum, q) => sum + (Number(q.total_amount) || 0),
      0,
    ),
    calls_made: callLogs.count || 0,
    period_start: weekStart,
    period_end: new Date().toISOString(),
  };
}

async function createContact(params: Record<string, unknown>) {
  const { first_name, last_name, email, company_id, phone_1_number, title } =
    params;

  if (!first_name && !last_name) {
    throw new Error("first_name or last_name is required");
  }

  const insertData: Record<string, unknown> = {};
  if (first_name) insertData.first_name = first_name;
  if (last_name) insertData.last_name = last_name;
  if (email) insertData.email = email;
  if (company_id) insertData.company_id = company_id;
  if (phone_1_number) insertData.phone_1_number = phone_1_number;
  if (title) insertData.title = title;
  insertData.first_seen = new Date().toISOString();
  insertData.last_seen = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("contacts")
    .insert(insertData)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function createCompany(params: Record<string, unknown>) {
  const { name, website, lead_status, source, industry, phone_number, city } =
    params;

  if (!name) {
    throw new Error("name is required");
  }

  const insertData: Record<string, unknown> = { name };
  if (website) insertData.website = website;
  if (lead_status) insertData.lead_status = lead_status;
  if (source) insertData.source = source;
  if (industry) insertData.industry = industry;
  if (phone_number) insertData.phone_number = phone_number;
  if (city) insertData.city = city;

  const { data, error } = await supabaseAdmin
    .from("companies")
    .insert(insertData)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function listFollowups() {
  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("call_logs")
    .select(
      "id, company_id, outcome, notes, followup_date, created_at, companies(name)",
    )
    .not("followup_date", "is", null)
    .lte("followup_date", now)
    .order("followup_date", { ascending: true })
    .limit(25);

  if (error) throw error;
  return data;
}

async function listTasksDue() {
  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("tasks")
    .select(
      "id, contact_id, type, text, due_date, contacts(first_name, last_name)",
    )
    .is("done_date", null)
    .lte("due_date", now)
    .order("due_date", { ascending: true })
    .limit(25);

  if (error) throw error;
  return data;
}

// --- Main handler ---

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) => {
    if (req.method !== "POST") {
      return createErrorResponse(405, "Method Not Allowed");
    }

    // Authenticate via shared bot secret
    const botSecret = Deno.env.get("DISCORD_BOT_SECRET");
    if (!botSecret) {
      return createErrorResponse(500, "DISCORD_BOT_SECRET not configured");
    }

    const providedSecret = req.headers.get("x-bot-secret") || "";
    const encoder = new TextEncoder();
    const expectedBytes = encoder.encode(botSecret);
    const providedBytes = encoder.encode(providedSecret);

    if (
      expectedBytes.byteLength !== providedBytes.byteLength ||
      !crypto.subtle.timingSafeEqual(expectedBytes, providedBytes)
    ) {
      return createErrorResponse(401, "Invalid bot secret");
    }

    let body: ActionRequest;
    try {
      body = await req.json();
    } catch {
      return createErrorResponse(400, "Invalid JSON body");
    }

    const { action, ...params } = body;

    if (!action) {
      return createErrorResponse(400, "Missing 'action' field");
    }

    try {
      let result: unknown;

      switch (action) {
        case "list_deals":
          result = await listDeals(params);
          break;
        case "list_companies":
          result = await listCompanies(params);
          break;
        case "get_pipeline_summary":
          result = await getPipelineSummary();
          break;
        case "get_weekly_report":
          result = await getWeeklyReport();
          break;
        case "create_contact":
          result = await createContact(params);
          break;
        case "create_company":
          result = await createCompany(params);
          break;
        case "list_followups":
          result = await listFollowups();
          break;
        case "list_tasks_due":
          result = await listTasksDue();
          break;
        default:
          return createErrorResponse(400, `Unknown action: ${action}`);
      }

      return jsonResponse({ success: true, data: result });
    } catch (error) {
      console.error(`discord_bot action '${action}' error:`, error);
      return createErrorResponse(500, "Internal error processing action");
    }
  }),
);
