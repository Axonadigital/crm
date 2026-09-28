import { ResponsiveBar } from "@nivo/bar";
import { format, startOfMonth } from "date-fns";
import { TrendingUp } from "lucide-react";
import { useGetList, useTranslate } from "ra-core";
import { memo, useMemo } from "react";

import { findDealLabel, totalDealValue } from "../deals/dealUtils";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Deal } from "../types";

const sixMonthsAgo = new Date(
  new Date().setMonth(new Date().getMonth() - 6),
).toISOString();

const DEFAULT_LOCALE = "en-US";

const getMonthKey = (date: string | undefined) => {
  if (!date) {
    return null;
  }
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return startOfMonth(parsed).toISOString();
};

export const DealsChart = memo(() => {
  const translate = useTranslate();
  const { dealStages, currency } = useConfigurationContext();
  const acceptedLanguages = navigator
    ? navigator.languages || [navigator.language]
    : [DEFAULT_LOCALE];
  const wonLabel = findDealLabel(dealStages, "won") ?? "Won";
  const pendingLabel = translate("crm.dashboard.deals_pending", {
    _: "In Progress",
  });
  const lostLabel = findDealLabel(dealStages, "lost") ?? "Lost";

  const { data, isPending } = useGetList<Deal>("deals", {
    pagination: { perPage: 1000, page: 1 },
    sort: {
      field: "expected_closing_date",
      order: "ASC",
    },
    filter: {
      "expected_closing_date@gte": sixMonthsAgo,
      "archived_at@is": null,
    },
  });

  const months = useMemo(() => {
    if (!data) return [];

    const dealsByMonth = data.reduce(
      (acc, deal) => {
        const month = getMonthKey(deal.expected_closing_date);
        if (!month) {
          return acc;
        }

        if (!acc[month]) {
          acc[month] = [];
        }
        acc[month].push(deal);
        return acc;
      },
      {} as Record<string, Deal[]>,
    );

    return Object.keys(dealsByMonth)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
      .map((month) => {
        const monthDeals = dealsByMonth[month];
        return {
          date: format(new Date(month), "MMM"),
          won: monthDeals
            .filter((deal) => deal.stage === "won")
            .reduce((acc, deal) => acc + totalDealValue(deal), 0),
          pending: monthDeals
            .filter((deal) => !["won", "lost"].includes(deal.stage))
            .reduce((acc, deal) => acc + totalDealValue(deal), 0),
          lost: monthDeals
            .filter((deal) => deal.stage === "lost")
            .reduce((acc, deal) => acc - deal.amount, 0),
        };
      });
  }, [data]);

  if (isPending)
    return (
      <div className="flex flex-col">
        <div className="flex items-center mb-4">
          <div className="mr-3 flex">
            <TrendingUp className="text-muted-foreground w-6 h-6" />
          </div>
          <h2 className="text-xl font-semibold text-muted-foreground">
            {translate("crm.dashboard.deals_chart")}
          </h2>
        </div>
        <div className="h-[400px] flex items-center justify-center">
          <div className="w-full h-full animate-pulse bg-muted rounded-md" />
        </div>
      </div>
    );
  const range = months.reduce(
    (acc, month) => {
      acc.min = Math.min(acc.min, month.lost);
      acc.max = Math.max(acc.max, month.won + month.pending);
      return acc;
    },
    { min: 0, max: 0 },
  );
  return (
    <div className="flex flex-col">
      <div className="flex items-center mb-4">
        <div className="mr-3 flex">
          <TrendingUp className="text-muted-foreground w-6 h-6" />
        </div>
        <h2 className="text-xl font-semibold text-muted-foreground">
          {translate("crm.dashboard.deals_chart")}
        </h2>
      </div>
      <div className="h-[400px]">
        <ResponsiveBar
          data={months}
          indexBy="date"
          keys={["won", "pending", "lost"]}
          colors={["#61cdbb", "#f4a261", "#e25c3b"]}
          margin={{ top: 30, right: 50, bottom: 30, left: 0 }}
          padding={0.3}
          valueScale={{
            type: "linear",
            min: range.min * 1.2,
            max: range.max * 1.2,
          }}
          indexScale={{ type: "band", round: true }}
          enableGridX={true}
          enableGridY={false}
          enableLabel={false}
          tooltip={({ id, value, indexValue, color }) => {
            const label =
              id === "won"
                ? wonLabel
                : id === "pending"
                  ? pendingLabel
                  : lostLabel;
            return (
              <div className="p-2 bg-secondary rounded shadow inline-flex items-center gap-1 text-secondary-foreground">
                <span
                  className="inline-block w-3 h-3 rounded-sm mr-1"
                  style={{ backgroundColor: color }}
                />
                <strong>
                  {indexValue} – {label}:
                </strong>
                &nbsp;{value > 0 ? "+" : ""}
                {Math.abs(value).toLocaleString(
                  acceptedLanguages.at(0) ?? DEFAULT_LOCALE,
                  {
                    style: "currency",
                    currency,
                  },
                )}
              </div>
            );
          }}
          axisTop={{
            tickSize: 0,
            tickPadding: 12,
            style: {
              ticks: {
                text: {
                  fill: "var(--color-muted-foreground)",
                },
              },
              legend: {
                text: {
                  fill: "var(--color-muted-foreground)",
                },
              },
            },
          }}
          axisBottom={{
            legendPosition: "middle",
            legendOffset: 50,
            tickSize: 0,
            tickPadding: 12,
            style: {
              ticks: {
                text: {
                  fill: "var(--color-muted-foreground)",
                },
              },
              legend: {
                text: {
                  fill: "var(--color-muted-foreground)",
                },
              },
            },
          }}
          axisLeft={null}
          axisRight={{
            format: (v: any) => `${Math.abs(v / 1000)}k`,
            tickValues: 8,
            style: {
              ticks: {
                text: {
                  fill: "var(--color-muted-foreground)",
                },
              },
              legend: {
                text: {
                  fill: "var(--color-muted-foreground)",
                },
              },
            },
          }}
          legends={[
            {
              dataFrom: "keys",
              anchor: "top-right",
              direction: "row",
              translateY: -25,
              itemWidth: 100,
              itemHeight: 20,
              itemDirection: "left-to-right",
              symbolSize: 12,
              symbolShape: "square",
              itemTextColor: "var(--color-muted-foreground)",
              data: [
                {
                  id: "won",
                  label: wonLabel,
                  color: "#61cdbb",
                },
                {
                  id: "pending",
                  label: pendingLabel,
                  color: "#f4a261",
                },
                {
                  id: "lost",
                  label: lostLabel,
                  color: "#e25c3b",
                },
              ],
            },
          ]}
          markers={
            [
              {
                axis: "y",
                value: 0,
                lineStyle: {
                  stroke: "#f47560",
                  strokeWidth: 1,
                },
              },
            ] as any
          }
        />
      </div>
    </div>
  );
});
