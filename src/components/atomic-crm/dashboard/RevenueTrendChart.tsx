import { ResponsiveLine } from "@nivo/line";
import { TrendingUp } from "lucide-react";
import { useTranslate } from "ra-core";
import { memo, useMemo } from "react";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { RevenueGoal } from "../root/ConfigurationContext";
import { useDashboardDeals } from "./useDashboardDeals";

const DEFAULT_LOCALE = "en-US";

export const RevenueTrendChart = memo(() => {
  const translate = useTranslate();
  const { currency, revenueGoals } = useConfigurationContext();
  const { monthlyRevenue, isPending } = useDashboardDeals();
  const locale =
    navigator?.languages?.[0] ?? navigator?.language ?? DEFAULT_LOCALE;

  const chartData = useMemo(() => {
    if (!monthlyRevenue.length) return [];

    return [
      {
        id: translate("crm.dashboard.revenue_won", { _: "Won Revenue" }),
        color: "#22c55e",
        data: monthlyRevenue.map((m) => ({
          x: m.month,
          y: m.won,
        })),
      },
      {
        id: translate("crm.dashboard.revenue_pipeline", {
          _: "Pipeline Value",
        }),
        color: "#f59e0b",
        data: monthlyRevenue.map((m) => ({
          x: m.month,
          y: m.pipeline,
        })),
      },
    ];
  }, [monthlyRevenue, translate]);

  const monthlyGoals = useMemo(
    () =>
      (revenueGoals ?? []).filter(
        (g: RevenueGoal) => g.period === "monthly" && g.amount > 0,
      ),
    [revenueGoals],
  );

  if (isPending) {
    return (
      <div className="flex flex-col">
        <div className="flex items-center mb-4">
          <div className="mr-3 flex">
            <TrendingUp className="text-muted-foreground w-6 h-6" />
          </div>
          <h2 className="text-xl font-semibold text-muted-foreground">
            {translate("crm.dashboard.revenue_trend", {
              _: "Revenue Trend",
            })}
          </h2>
        </div>
        <div className="h-[300px] flex items-center justify-center">
          <div className="w-full h-full animate-pulse bg-muted rounded-md" />
        </div>
      </div>
    );
  }

  const hasData = monthlyRevenue.some((m) => m.won > 0 || m.pipeline > 0);
  if (!hasData) return null;

  return (
    <div className="flex flex-col">
      <div className="flex items-center mb-4">
        <div className="mr-3 flex">
          <TrendingUp className="text-muted-foreground w-6 h-6" />
        </div>
        <h2 className="text-xl font-semibold text-muted-foreground">
          {translate("crm.dashboard.revenue_trend", {
            _: "Revenue Trend",
          })}
        </h2>
      </div>
      <div className="h-[300px]">
        <ResponsiveLine
          data={chartData}
          margin={{ top: 20, right: 30, bottom: 50, left: 60 }}
          xScale={{ type: "point" }}
          yScale={{
            type: "linear",
            min: 0,
            max: "auto",
            stacked: false,
          }}
          curve="monotoneX"
          axisBottom={{
            tickSize: 0,
            tickPadding: 10,
            tickRotation: -45,
            legendOffset: 40,
            legendPosition: "middle",
            truncateTickAt: 0,
          }}
          axisLeft={{
            tickSize: 0,
            tickPadding: 10,
            format: (v: number) =>
              v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`,
          }}
          colors={["#22c55e", "#f59e0b"]}
          lineWidth={2}
          pointSize={6}
          pointColor={{ theme: "background" }}
          pointBorderWidth={2}
          pointBorderColor={{ from: "serieColor" }}
          enableArea={true}
          areaOpacity={0.08}
          useMesh={true}
          enableSlices="x"
          sliceTooltip={({ slice }) => (
            <div className="p-3 bg-secondary rounded-lg shadow-lg text-secondary-foreground">
              <p className="font-semibold mb-1 text-sm">
                {slice.points[0]?.data.xFormatted}
              </p>
              {slice.points.map((point) => (
                <div key={point.id} className="flex items-center gap-2 text-sm">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: point.serieColor }}
                  />
                  <span>{point.serieId}:</span>
                  <span className="font-medium">
                    {(point.data.y as number).toLocaleString(locale, {
                      style: "currency",
                      currency,
                      maximumFractionDigits: 0,
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
          markers={monthlyGoals.map((goal: RevenueGoal, i: number) => ({
            axis: "y" as const,
            value: goal.amount,
            lineStyle: {
              stroke: "#ef4444",
              strokeWidth: 2,
              strokeDasharray: "6 4",
            },
            legend: `${goal.label}`,
            textStyle: {
              fill: "#ef4444",
              fontSize: 11,
              fontWeight: 600,
            },
            legendPosition:
              i % 2 === 0 ? ("top-right" as const) : ("top-left" as const),
          }))}
          legends={[
            {
              anchor: "top-right",
              direction: "row",
              translateY: -20,
              itemWidth: 120,
              itemHeight: 20,
              symbolSize: 10,
              symbolShape: "circle",
              itemTextColor: "var(--color-muted-foreground)",
            },
          ]}
          theme={{
            axis: {
              ticks: {
                text: { fill: "var(--color-muted-foreground)" },
              },
            },
            grid: {
              line: { stroke: "var(--color-border)", strokeWidth: 1 },
            },
          }}
        />
      </div>
    </div>
  );
});
