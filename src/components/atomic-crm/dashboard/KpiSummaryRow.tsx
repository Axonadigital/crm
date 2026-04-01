import { BarChart3, DollarSign, Target, TrendingUp } from "lucide-react";
import { useTranslate } from "ra-core";
import { memo } from "react";

import { Skeleton } from "@/components/ui/skeleton";

import { useConfigurationContext } from "../root/ConfigurationContext";
import { KpiCard } from "./KpiCard";
import { useDashboardDeals } from "./useDashboardDeals";

const DEFAULT_LOCALE = "en-US";

function getTrend(current: number, previous: number) {
  if (previous === 0) {
    return current > 0
      ? { value: 100, direction: "up" as const }
      : { value: 0, direction: "flat" as const };
  }
  const change = ((current - previous) / previous) * 100;
  if (Math.abs(change) < 1) return { value: 0, direction: "flat" as const };
  return {
    value: Math.abs(change),
    direction: change > 0 ? ("up" as const) : ("down" as const),
  };
}

function formatCurrency(
  value: number,
  currency: string,
  locale: string,
): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 1,
    })}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toLocaleString(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    })}k`;
  }
  return value.toLocaleString(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
}

export const KpiSummaryRow = memo(() => {
  const translate = useTranslate();
  const { currency } = useConfigurationContext();
  const metrics = useDashboardDeals();
  const locale =
    navigator?.languages?.[0] ?? navigator?.language ?? DEFAULT_LOCALE;

  if (metrics.isPending) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <KpiCard
        title={translate("crm.dashboard.kpi.closed_revenue", {
          _: "Closed Revenue",
        })}
        value={formatCurrency(metrics.closedRevenue, currency, locale)}
        icon={DollarSign}
        color="#22c55e"
        trend={getTrend(metrics.closedRevenue, metrics.closedRevenuePrev)}
      />
      <KpiCard
        title={translate("crm.dashboard.kpi.pipeline_value", {
          _: "Pipeline Value",
        })}
        value={formatCurrency(metrics.pipelineValue, currency, locale)}
        icon={TrendingUp}
        color="#f59e0b"
        trend={getTrend(metrics.pipelineValue, metrics.pipelineValuePrev)}
      />
      <KpiCard
        title={translate("crm.dashboard.kpi.win_rate", {
          _: "Win Rate (90d)",
        })}
        value={`${metrics.winRate.toFixed(0)}%`}
        icon={Target}
        color="#3b82f6"
        trend={getTrend(metrics.winRate, metrics.winRatePrev)}
      />
      <KpiCard
        title={translate("crm.dashboard.kpi.avg_deal_size", {
          _: "Avg Deal Size",
        })}
        value={formatCurrency(metrics.avgDealSize, currency, locale)}
        icon={BarChart3}
        color="#8b5cf6"
        trend={getTrend(metrics.avgDealSize, metrics.avgDealSizePrev)}
      />
    </div>
  );
});
