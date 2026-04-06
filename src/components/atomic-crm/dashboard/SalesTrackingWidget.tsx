import { ResponsiveBar } from "@nivo/bar";
import { format } from "date-fns";
import { Plus, Trash2, TrendingUp } from "lucide-react";
import { useDelete, useGetList, useTranslate } from "ra-core";
import { memo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useConfigurationContext } from "../root/ConfigurationContext";
import type { SalesEntry } from "../types";
import { SalesEntryDialog } from "./SalesEntryDialog";
import { type PeriodType, useSalesTracking } from "./useSalesTracking";

const DEFAULT_LOCALE = "en-US";

function formatCurrency(
  amount: number,
  currency: string,
  locale: string,
): string {
  return amount.toLocaleString(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
}

export const SalesTrackingWidget = memo(() => {
  const translate = useTranslate();
  const { currency } = useConfigurationContext();
  const locale =
    navigator?.languages?.[0] ?? navigator?.language ?? DEFAULT_LOCALE;

  const [periodType, setPeriodType] = useState<PeriodType>("month");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteEntry] = useDelete();

  const { periods, totalManual, totalDeals, isPending } =
    useSalesTracking(periodType);

  // Fetch recent manual entries for the list
  const { data: recentEntries } = useGetList<SalesEntry>("sales_entries", {
    pagination: { perPage: 10, page: 1 },
    sort: { field: "period_date", order: "DESC" },
  });

  const handleDelete = (id: SalesEntry["id"]) => {
    deleteEntry("sales_entries", { id });
  };

  const manualLabel = translate("crm.dashboard.sales_tracking.manual", {
    _: "Manuell försäljning",
  });
  const dealLabel = translate("crm.dashboard.sales_tracking.deals", {
    _: "Deal-intäkt",
  });

  if (isPending) {
    return (
      <div className="flex flex-col">
        <div className="flex items-center mb-4">
          <div className="mr-3 flex">
            <TrendingUp className="text-muted-foreground w-6 h-6" />
          </div>
          <h2 className="text-xl font-semibold text-muted-foreground">
            {translate("crm.dashboard.sales_tracking.title", {
              _: "Försäljningslogg",
            })}
          </h2>
        </div>
        <div className="h-[300px] flex items-center justify-center">
          <div className="w-full h-full animate-pulse bg-muted rounded-md" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <div className="mr-3 flex">
            <TrendingUp className="text-muted-foreground w-6 h-6" />
          </div>
          <h2 className="text-xl font-semibold text-muted-foreground">
            {translate("crm.dashboard.sales_tracking.title", {
              _: "Försäljningslogg",
            })}
          </h2>
        </div>
        <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-1" />
          {translate("crm.dashboard.sales_tracking.add", {
            _: "Lägg till",
          })}
        </Button>
      </div>

      {/* Period toggle */}
      <Tabs
        value={periodType}
        onValueChange={(v) => setPeriodType(v as PeriodType)}
      >
        <TabsList>
          <TabsTrigger value="day">
            {translate("crm.dashboard.sales_tracking.day", { _: "Dag" })}
          </TabsTrigger>
          <TabsTrigger value="week">
            {translate("crm.dashboard.sales_tracking.week", { _: "Vecka" })}
          </TabsTrigger>
          <TabsTrigger value="month">
            {translate("crm.dashboard.sales_tracking.month", {
              _: "Månad",
            })}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Bar chart */}
      <div className="h-[300px]">
        <ResponsiveBar
          data={periods.map((p) => ({
            period: p.periodLabel,
            [manualLabel]: p.manualSales,
            [dealLabel]: p.dealRevenue,
          }))}
          indexBy="period"
          keys={[manualLabel, dealLabel]}
          colors={["#3b82f6", "#22c55e"]}
          margin={{ top: 20, right: 20, bottom: 40, left: 0 }}
          padding={0.3}
          groupMode="stacked"
          valueScale={{ type: "linear" }}
          indexScale={{ type: "band", round: true }}
          enableGridX={false}
          enableGridY={true}
          enableLabel={false}
          tooltip={({ id, value, indexValue, color }) => (
            <div className="p-2 bg-secondary rounded shadow inline-flex items-center gap-1 text-secondary-foreground text-sm">
              <span
                className="inline-block w-3 h-3 rounded-sm mr-1"
                style={{ backgroundColor: color }}
              />
              <strong>
                {indexValue} – {id}:
              </strong>
              &nbsp;{formatCurrency(value, currency, locale)}
            </div>
          )}
          axisBottom={{
            tickSize: 0,
            tickPadding: 8,
            tickRotation: periodType === "day" ? -45 : 0,
          }}
          axisLeft={null}
          axisRight={{
            format: (v) => `${Math.round(v / 1000)}k`,
            tickValues: 5,
          }}
          legends={[
            {
              dataFrom: "keys",
              anchor: "top-left",
              direction: "row",
              translateY: -20,
              itemWidth: 150,
              itemHeight: 16,
              symbolSize: 12,
              symbolShape: "square",
              itemTextColor: "var(--color-muted-foreground)",
            },
          ]}
        />
      </div>

      {/* Summary */}
      <Card>
        <CardContent className="flex gap-6 text-sm py-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">
              {translate("crm.dashboard.sales_tracking.manual_total", {
                _: "Manuellt registrerat",
              })}
            </span>
            <span className="font-semibold text-blue-500">
              {formatCurrency(totalManual, currency, locale)}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">
              {translate("crm.dashboard.sales_tracking.deals_total", {
                _: "Vunna deals",
              })}
            </span>
            <span className="font-semibold text-green-600">
              {formatCurrency(totalDeals, currency, locale)}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">
              {translate("crm.dashboard.sales_tracking.combined_total", {
                _: "Totalt",
              })}
            </span>
            <span className="font-semibold">
              {formatCurrency(totalManual + totalDeals, currency, locale)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Recent manual entries */}
      {recentEntries && recentEntries.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            {translate("crm.dashboard.sales_tracking.recent_entries", {
              _: "Senaste registreringar",
            })}
          </h3>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {recentEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between px-4 py-2 text-sm"
                  >
                    <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                      <span className="font-medium">
                        {formatCurrency(entry.amount, currency, locale)}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {format(new Date(entry.period_date), "d MMM yyyy")} ·{" "}
                        {entry.period_type === "day"
                          ? translate("crm.dashboard.sales_tracking.day", {
                              _: "Dag",
                            })
                          : entry.period_type === "week"
                            ? translate("crm.dashboard.sales_tracking.week", {
                                _: "Vecka",
                              })
                            : translate("crm.dashboard.sales_tracking.month", {
                                _: "Månad",
                              })}
                        {entry.description && ` · ${entry.description}`}
                      </span>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive h-7 w-7 shrink-0"
                      onClick={() => handleDelete(entry.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <SalesEntryDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        periodType={periodType}
      />
    </div>
  );
});
