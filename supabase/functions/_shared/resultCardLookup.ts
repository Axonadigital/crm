// Uppslag av resultatkortet i databasen: referenskundens senaste
// månadsrapport med Search Console-siffror. Delas av sekvensmotorn (steg 3)
// och svarsläsaren (paketmejlet). Ren logik ligger i resultCard.ts.
import { supabaseAdmin } from "./supabaseAdmin.ts";
import { resultCardText, type ReportMetricsLike } from "./resultCard.ts";

export async function resultCardFor(customer: string | null): Promise<string | null> {
  if (!customer) return null;
  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("id, name")
    .ilike("name", `%${customer.split(" ")[0]}%`)
    .eq("lead_status", "closed_won")
    .limit(1)
    .maybeSingle();
  if (!company) return null;
  const { data: report } = await supabaseAdmin
    .from("monthly_reports")
    .select("period, metrics")
    .eq("company_id", company.id)
    .not("metrics", "is", null)
    .order("period", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!report) return null;
  return resultCardText({
    customer,
    period: String(report.period),
    metrics: report.metrics as ReportMetricsLike | null,
  });
}
