import {
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
  isBefore,
} from "date-fns";
import { useGetList } from "ra-core";
import { useMemo } from "react";

import type { Deal, SalesEntry } from "../types";

export type PeriodType = "day" | "week" | "month";

export interface SalesTrackingPeriod {
  periodLabel: string;
  periodStart: string;
  manualSales: number;
  dealRevenue: number;
}

export interface SalesTrackingData {
  periods: SalesTrackingPeriod[];
  totalManual: number;
  totalDeals: number;
  isPending: boolean;
}

function getPeriodStart(date: Date, periodType: PeriodType): Date {
  switch (periodType) {
    case "day":
      return startOfDay(date);
    case "week":
      return startOfWeek(date, { weekStartsOn: 1 });
    case "month":
      return startOfMonth(date);
  }
}

function getPeriodLabel(date: Date, periodType: PeriodType): string {
  switch (periodType) {
    case "day":
      return format(date, "d MMM");
    case "week":
      return `v${format(date, "w")}`;
    case "month":
      return format(date, "MMM yyyy");
  }
}

// Use period-aligned cutoffs so boundary inclusion is predictable
function getCutoffDate(periodType: PeriodType): Date {
  const now = new Date();
  switch (periodType) {
    case "day":
      return startOfDay(subDays(now, 30));
    case "week":
      return startOfWeek(subWeeks(now, 12), { weekStartsOn: 1 });
    case "month":
      return startOfMonth(subMonths(now, 12));
  }
}

// Use format() instead of toISOString() to avoid UTC timezone shifts
function toDateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

// Parse a date-only string (YYYY-MM-DD) safely in local time
function parseDateString(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function aggregatePeriods(
  entries: SalesEntry[],
  deals: Deal[],
  periodType: PeriodType,
): SalesTrackingPeriod[] {
  const cutoff = getCutoffDate(periodType);
  const now = new Date();
  const periodMap = new Map<
    string,
    { label: string; start: string; manual: number; deals: number }
  >();

  // Build all period buckets
  let cursor = getPeriodStart(now, periodType);
  while (!isBefore(cursor, cutoff)) {
    const key = toDateKey(cursor);
    periodMap.set(key, {
      label: getPeriodLabel(cursor, periodType),
      start: key,
      manual: 0,
      deals: 0,
    });
    switch (periodType) {
      case "day":
        cursor = subDays(cursor, 1);
        break;
      case "week":
        cursor = subWeeks(cursor, 1);
        break;
      case "month":
        cursor = subMonths(cursor, 1);
        break;
    }
  }

  // Aggregate manual sales entries
  for (const entry of entries) {
    const entryDate = parseDateString(entry.period_date);
    const periodStart = getPeriodStart(entryDate, periodType);
    const key = toDateKey(periodStart);
    const bucket = periodMap.get(key);
    if (bucket) {
      bucket.manual += entry.amount;
    }
  }

  // Aggregate deal revenue (won deals)
  for (const deal of deals) {
    const dealDate = new Date(deal.expected_closing_date);
    const periodStart = getPeriodStart(dealDate, periodType);
    const key = toDateKey(periodStart);
    const bucket = periodMap.get(key);
    if (bucket) {
      bucket.deals += deal.amount;
    }
  }

  // Sort chronologically (oldest first)
  return Array.from(periodMap.values())
    .sort((a, b) => a.start.localeCompare(b.start))
    .map(({ label, start, manual, deals }) => ({
      periodLabel: label,
      periodStart: start,
      manualSales: manual,
      dealRevenue: deals,
    }));
}

export const useSalesTracking = (periodType: PeriodType): SalesTrackingData => {
  const cutoff = getCutoffDate(periodType);
  const cutoffISO = cutoff.toISOString();

  const { data: entries, isPending: isPendingEntries } = useGetList<SalesEntry>(
    "sales_entries",
    {
      pagination: { perPage: 1000, page: 1 },
      sort: { field: "period_date", order: "ASC" },
      filter: {
        "period_date@gte": cutoffISO,
      },
    },
  );

  const { data: deals, isPending: isPendingDeals } = useGetList<Deal>("deals", {
    pagination: { perPage: 1000, page: 1 },
    sort: { field: "expected_closing_date", order: "ASC" },
    filter: {
      "archived_at@is": null,
      "stage@eq": "won",
      "expected_closing_date@gte": cutoffISO,
    },
  });

  return useMemo(() => {
    const safeEntries = entries ?? [];
    const safeDeals = deals ?? [];

    const periods = aggregatePeriods(safeEntries, safeDeals, periodType);
    const totalManual = periods.reduce((sum, p) => sum + p.manualSales, 0);
    const totalDeals = periods.reduce((sum, p) => sum + p.dealRevenue, 0);

    return {
      periods,
      totalManual,
      totalDeals,
      isPending: isPendingEntries || isPendingDeals,
    };
  }, [entries, deals, periodType, isPendingEntries, isPendingDeals]);
};
