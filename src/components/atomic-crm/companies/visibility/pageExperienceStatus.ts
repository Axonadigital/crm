import type { WebsiteSnapshot } from "../../types";
import type { ReportStatus } from "../../types";

export function computePageExperienceStatus(
  snapshot: Pick<
    WebsiteSnapshot,
    "field_data" | "performance_score" | "pagespeed"
  >,
): ReportStatus {
  const field = snapshot.field_data;
  if (field) {
    const ratings = [field.lcp_rating, field.inp_rating, field.cls_rating];
    if (ratings.includes("POOR")) return "poor";
    if (ratings.includes("NEEDS_IMPROVEMENT")) return "needs_attention";
    if (ratings.some(Boolean)) return "good";
  }

  if (snapshot.performance_score == null) return "missing";
  if (snapshot.performance_score < 50) return "poor";

  const weakLabSignals = [
    snapshot.performance_score < 80,
    typeof snapshot.pagespeed?.cls === "number" && snapshot.pagespeed.cls > 0.1,
    typeof snapshot.pagespeed?.tbt_ms === "number" &&
      snapshot.pagespeed.tbt_ms > 300,
  ].filter(Boolean).length;

  return weakLabSignals > 1 ? "needs_attention" : "good";
}
