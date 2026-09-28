import {
  startOfMonth,
  subMonths,
  subDays,
  isAfter,
  isBefore,
  format,
} from "date-fns";
import { useGetList } from "ra-core";
import { useMemo } from "react";

import { totalDealValue } from "../deals/dealUtils";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Deal } from "../types";

const CLOSED_STAGES = ["won", "lost"];
const INACTIVE_STAGES = ["won", "lost", "delayed"];

interface MonthlyRevenue {
  month: string;
  won: number;
  pipeline: number;
}

interface StageBreakdown {
  stage: string;
  label: string;
  count: number;
  value: number;
}

export interface DashboardMetrics {
  closedRevenue: number;
  closedRevenuePrev: number;
  pipelineValue: number;
  pipelineValuePrev: number;
  winRate: number;
  winRatePrev: number;
  avgDealSize: number;
  avgDealSizePrev: number;
  monthlyRevenue: MonthlyRevenue[];
  dealsByStage: StageBreakdown[];
  isPending: boolean;
}

export const useDashboardDeals = (): DashboardMetrics => {
  const { dealStages } = useConfigurationContext();

  const { data, isPending } = useGetList<Deal>("deals", {
    pagination: { perPage: 1000, page: 1 },
    sort: { field: "expected_closing_date", order: "ASC" },
    filter: { "archived_at@is": null },
  });

  return useMemo(() => {
    if (!data) {
      return {
        closedRevenue: 0,
        closedRevenuePrev: 0,
        pipelineValue: 0,
        pipelineValuePrev: 0,
        winRate: 0,
        winRatePrev: 0,
        avgDealSize: 0,
        avgDealSizePrev: 0,
        monthlyRevenue: [],
        dealsByStage: [],
        isPending,
      };
    }

    const now = new Date();
    const thisMonthStart = startOfMonth(now);
    const prevMonthStart = startOfMonth(subMonths(now, 1));
    const days90ago = subDays(now, 90);
    const days180ago = subDays(now, 180);
    const months6ago = subMonths(now, 6);
    const months12ago = subMonths(now, 12);

    // Closed revenue (won deals) - current month vs previous
    const wonDeals = data.filter((d) => d.stage === "won");
    const closedRevenue = wonDeals
      .filter((d) => {
        const date = new Date(d.expected_closing_date);
        return !isBefore(date, thisMonthStart);
      })
      .reduce((sum, d) => sum + totalDealValue(d), 0);

    const closedRevenuePrev = wonDeals
      .filter((d) => {
        const date = new Date(d.expected_closing_date);
        return (
          !isBefore(date, prevMonthStart) && isBefore(date, thisMonthStart)
        );
      })
      .reduce((sum, d) => sum + totalDealValue(d), 0);

    // Pipeline value - active stages only
    const activePipelineDeals = data.filter(
      (d) => !INACTIVE_STAGES.includes(d.stage),
    );
    const pipelineValue = activePipelineDeals.reduce(
      (sum, d) => sum + totalDealValue(d),
      0,
    );

    // Pipeline previous month (deals created before this month that were active)
    const pipelineValuePrev = activePipelineDeals
      .filter((d) => {
        const date = new Date(d.created_at);
        return isBefore(date, thisMonthStart);
      })
      .reduce((sum, d) => sum + totalDealValue(d), 0);

    // Win rate - last 90 days vs previous 90 days
    const closedLast90 = data.filter((d) => {
      if (!CLOSED_STAGES.includes(d.stage)) return false;
      const date = new Date(d.updated_at);
      return isAfter(date, days90ago);
    });
    const wonLast90 = closedLast90.filter((d) => d.stage === "won").length;
    const totalClosed90 = closedLast90.length;
    const winRate = totalClosed90 > 0 ? (wonLast90 / totalClosed90) * 100 : 0;

    const closedPrev90 = data.filter((d) => {
      if (!CLOSED_STAGES.includes(d.stage)) return false;
      const date = new Date(d.updated_at);
      return isAfter(date, days180ago) && isBefore(date, days90ago);
    });
    const wonPrev90 = closedPrev90.filter((d) => d.stage === "won").length;
    const totalClosedPrev90 = closedPrev90.length;
    const winRatePrev =
      totalClosedPrev90 > 0 ? (wonPrev90 / totalClosedPrev90) * 100 : 0;

    // Average deal size - won deals last 6 months vs previous 6
    const wonRecent = wonDeals.filter((d) =>
      isAfter(new Date(d.expected_closing_date), months6ago),
    );
    const avgDealSize =
      wonRecent.length > 0
        ? wonRecent.reduce((sum, d) => sum + totalDealValue(d), 0) /
          wonRecent.length
        : 0;

    const wonOlder = wonDeals.filter((d) => {
      const date = new Date(d.expected_closing_date);
      return isAfter(date, months12ago) && isBefore(date, months6ago);
    });
    const avgDealSizePrev =
      wonOlder.length > 0
        ? wonOlder.reduce((sum, d) => sum + totalDealValue(d), 0) /
          wonOlder.length
        : 0;

    // Monthly revenue for line chart (12 months)
    const monthlyRevenue: MonthlyRevenue[] = [];
    for (let i = 11; i >= 0; i--) {
      const monthStart = startOfMonth(subMonths(now, i));
      const monthEnd = startOfMonth(subMonths(now, i - 1));
      const monthKey = format(monthStart, "MMM yyyy");

      const monthWon = data
        .filter((d) => {
          if (d.stage !== "won") return false;
          const date = new Date(d.expected_closing_date);
          return !isBefore(date, monthStart) && isBefore(date, monthEnd);
        })
        .reduce((sum, d) => sum + totalDealValue(d), 0);

      const monthPipeline = data
        .filter((d) => {
          if (INACTIVE_STAGES.includes(d.stage)) return false;
          const date = new Date(d.expected_closing_date);
          return !isBefore(date, monthStart) && isBefore(date, monthEnd);
        })
        .reduce((sum, d) => sum + totalDealValue(d), 0);

      monthlyRevenue.push({
        month: monthKey,
        won: monthWon,
        pipeline: monthPipeline,
      });
    }

    // Deals by stage (active pipeline stages only)
    const dealsByStage: StageBreakdown[] = dealStages
      .filter((s) => !CLOSED_STAGES.includes(s.value))
      .map((stage) => {
        const stageDeals = data.filter((d) => d.stage === stage.value);
        return {
          stage: stage.value,
          label: stage.label,
          count: stageDeals.length,
          value: stageDeals.reduce((sum, d) => sum + totalDealValue(d), 0),
        };
      })
      .filter((s) => s.count > 0);

    return {
      closedRevenue,
      closedRevenuePrev,
      pipelineValue,
      pipelineValuePrev,
      winRate,
      winRatePrev,
      avgDealSize,
      avgDealSizePrev,
      monthlyRevenue,
      dealsByStage,
      isPending,
    };
  }, [data, isPending, dealStages]);
};
