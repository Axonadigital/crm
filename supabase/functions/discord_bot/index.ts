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
 *   - get_sales_performance: Per-salesperson deal stats for the last 30 days
 *   - get_ai_sales_analysis: AI-generated sales analysis and recommendations (Swedish)
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
    .from("companies")
    .select(
      "id, name, next_followup_date, lead_status, next_action_type, next_action_note",
    )
    .not("next_followup_date", "is", null)
    .lte("next_followup_date", now)
    .order("next_followup_date", { ascending: true })
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

async function getSalesPerformance() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const periodStart = thirtyDaysAgo.toISOString();

  const [deals, calls, sales] = await Promise.all([
    supabaseAdmin
      .from("deals")
      .select("id, stage, amount, sales_id, created_at")
      .is("archived_at", null),
    supabaseAdmin
      .from("call_logs")
      .select("id, sales_id, created_at")
      .gte("created_at", periodStart),
    supabaseAdmin.from("sales").select("id, first_name, last_name"),
  ]);

  if (deals.error) throw deals.error;
  if (sales.error) throw sales.error;

  const salesMap: Record<
    string,
    {
      name: string;
      active_deals: number;
      won_deals: number;
      lost_deals: number;
      total_value: number;
      calls_last_30_days: number;
    }
  > = {};

  for (const s of sales.data || []) {
    salesMap[s.id] = {
      name: `${s.first_name} ${s.last_name}`.trim(),
      active_deals: 0,
      won_deals: 0,
      lost_deals: 0,
      total_value: 0,
      calls_last_30_days: 0,
    };
  }

  for (const deal of deals.data || []) {
    const sid = deal.sales_id;
    if (!sid || !salesMap[sid]) continue;
    if (deal.stage === "won") {
      salesMap[sid].won_deals += 1;
    } else if (deal.stage === "lost") {
      salesMap[sid].lost_deals += 1;
    } else {
      salesMap[sid].active_deals += 1;
    }
    salesMap[sid].total_value += deal.amount || 0;
  }

  for (const call of calls.data || []) {
    const sid = call.sales_id;
    if (!sid || !salesMap[sid]) continue;
    salesMap[sid].calls_last_30_days += 1;
  }

  return {
    period_start: periodStart,
    period_end: new Date().toISOString(),
    salespeople: Object.values(salesMap),
  };
}

async function getAiSalesAnalysis() {
  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const [pipeline, weekly, tasks, followups] = await Promise.all([
    getPipelineSummary(),
    getWeeklyReport(),
    listTasksDue(),
    listFollowups(),
  ]);

  const pipelineText = Object.entries(pipeline.stages)
    .map(
      ([stage, s]) =>
        `  ${stage}: ${s.count} deals, ${s.total_amount.toLocaleString("sv-SE")} kr`,
    )
    .join("\n");

  const prompt = `Du är en senior säljstrateg för Axona Digital, en AI- och webbutvecklingsbyrå.
Analysera följande CRM-data och ge konkreta rekommendationer på svenska.

## Pipeline (${pipeline.total_deals} aktiva deals, totalt ${pipeline.total_amount.toLocaleString("sv-SE")} kr)
${pipelineText}

## Aktivitet senaste 7 dagarna
- Nya företag: ${weekly.new_companies}
- Nya deals: ${weekly.new_deals} (${weekly.deals_total_amount.toLocaleString("sv-SE")} kr)
- Deals vunna: ${weekly.deals_won}
- Offerter skapade: ${weekly.quotes_created}, skickade: ${weekly.quotes_sent}, signerade: ${weekly.quotes_signed}
- Samtal gjorda: ${weekly.calls_made}

## Försenade tasks (${tasks.length} st)
${
  tasks
    .slice(0, 5)
    .map((t) => `  - ${t.type}: ${t.text}`)
    .join("\n") || "  Inga"
}

## Försenade followups (${followups.length} st)
${
  followups
    .slice(0, 5)
    .map(
      (f) =>
        `  - ${(f.companies as { name: string } | null)?.name || "okänt företag"}: ${f.outcome || "ingen notering"}`,
    )
    .join("\n") || "  Inga"
}

Returnera EXAKT denna JSON (inget annat):
{
  "status_summary": "2-3 meningar om hur pipelinen ser ut just nu",
  "top_risks": ["risk 1", "risk 2", "risk 3"],
  "next_steps": ["åtgärd 1", "åtgärd 2", "åtgärd 3", "åtgärd 4", "åtgärd 5"],
  "opportunities": ["möjlighet 1", "möjlighet 2"],
  "health_score": 0-100
}

Regler:
- Allt på svenska
- Var konkret, referera till verklig data ovan
- next_steps ska vara handlingsbara åtgärder man kan ta idag
- health_score: 0=kris, 50=okej, 100=utmärkt säljhälsa`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error: ${response.status} ${err}`);
  }

  const aiResult = await response.json();
  const text =
    aiResult.content?.[0]?.type === "text" ? aiResult.content[0].text : "";

  let analysis: unknown;
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: text };
  } catch {
    analysis = { raw: text };
  }

  return {
    analysis,
    generated_at: new Date().toISOString(),
    data_snapshot: {
      total_deals: pipeline.total_deals,
      total_pipeline_value: pipeline.total_amount,
      overdue_tasks: tasks.length,
      overdue_followups: followups.length,
    },
  };
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
    if (providedSecret !== botSecret) {
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
        case "get_sales_performance":
          result = await getSalesPerformance();
          break;
        case "get_ai_sales_analysis":
          result = await getAiSalesAnalysis();
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
