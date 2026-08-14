import { ResponsiveLine } from "@nivo/line";
import {
  AlertTriangle,
  Building2,
  Percent,
  Search,
  UserPlus,
} from "lucide-react";
import { Link } from "react-router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { NIVO_THEME } from "../dashboard/chartTheme";
import type { ScannerLeadStatsResponse } from "../types";

// Samma fallback som ScanWebsiteButton/BatchScanButton — scannern är en
// separat Vercel-app, proxad in på axonadigital.se/scannahemsida i prod.
const SCANNER_URL =
  import.meta.env.VITE_SCANNER_URL ?? "https://axona-scanner.vercel.app";

function formatRate(value: number | null): string {
  return value == null ? "–" : `${value.toLocaleString("sv-SE")} %`;
}

function formatPeriodStart(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("sv-SE", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("sv-SE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const VERDICT_COLORS: Record<string, string> = {
  risk: "text-red-600",
  needs_work: "text-orange-600",
  leaking: "text-yellow-600",
  strong: "text-green-600",
};

export function ScannerLeadStatsContent({
  data,
  isPending,
  error,
  onRetry,
}: {
  data: ScannerLeadStatsResponse | null;
  isPending: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  if (isPending) return <ScannerLeadStatsSkeleton />;
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="size-4" />
        <AlertTitle>Lead-magnet-statistiken kunde inte laddas</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>{error.message}</p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Försök igen
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (!data) return null;

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Besökare som scannar sin egen hemsida via lead magneten på
        axonadigital.se — hur många försök som blir leads, och vilka de är.
      </p>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <SummaryCard
          icon={Search}
          label="Scan-försök"
          value={data.totals.requests.toLocaleString("sv-SE")}
          helper={`${data.totals.scans_completed.toLocaleString("sv-SE")} genomförda`}
        />
        <SummaryCard
          icon={UserPlus}
          label="Leads (mejl)"
          value={data.totals.leads_with_email.toLocaleString("sv-SE")}
          helper={`${formatRate(data.totals.conversion_rate)} konvertering`}
        />
        <SummaryCard
          icon={Percent}
          label="Konverteringsgrad"
          value={formatRate(data.totals.conversion_rate)}
          helper="Andel scan-försök med angivet mejl"
        />
        <SummaryCard
          icon={Building2}
          label="Snittpoäng leads"
          value={
            data.totals.avg_score_leads == null
              ? "–"
              : data.totals.avg_score_leads.toLocaleString("sv-SE")
          }
          helper="Genomsnittlig scanpoäng (0–100)"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Scan-försök och leads per vecka</CardTitle>
          <p className="text-sm text-muted-foreground">
            Antal publika scan-försök jämfört med hur många som lämnade sitt
            mejl.
          </p>
        </CardHeader>
        <CardContent>
          {data.trend.length < 2 ? (
            <div className="flex h-72 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
              Minst två veckor med data behövs för en trend.
            </div>
          ) : (
            <div className="h-72" aria-label="Scan-försök och leads per vecka">
              <ResponsiveLine
                data={[
                  {
                    id: "Scan-försök",
                    data: data.trend.map((point) => ({
                      x: point.period_start,
                      y: point.requests,
                    })),
                  },
                  {
                    id: "Leads",
                    data: data.trend.map((point) => ({
                      x: point.period_start,
                      y: point.leads,
                    })),
                  },
                ]}
                margin={{ top: 24, right: 24, bottom: 44, left: 48 }}
                xScale={{ type: "point" }}
                yScale={{ type: "linear", min: 0, max: "auto" }}
                curve="monotoneX"
                colors={["var(--color-chart-1)", "var(--color-chart-4)"]}
                lineWidth={2}
                pointSize={8}
                pointBorderWidth={2}
                pointBorderColor={{ from: "serieColor" }}
                pointColor={{ theme: "background" }}
                enableGridX={false}
                axisBottom={{
                  tickRotation: -20,
                  format: (value) => formatPeriodStart(String(value)),
                }}
                axisLeft={{}}
                useMesh
                enableSlices="x"
                sliceTooltip={({ slice }) => (
                  <div className="rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
                    <p className="mb-1 font-medium">
                      {formatPeriodStart(String(slice.points[0].data.x))}
                    </p>
                    {slice.points.map((point) => (
                      <p
                        key={point.seriesId}
                        className="flex items-center gap-2"
                      >
                        <span
                          className="size-2 rounded-full"
                          style={{ background: point.seriesColor }}
                        />
                        {point.seriesId}: {point.data.yFormatted}
                      </p>
                    ))}
                  </div>
                )}
                legends={[
                  {
                    anchor: "top-right",
                    direction: "row",
                    translateY: -20,
                    itemWidth: 100,
                    itemHeight: 16,
                    symbolShape: "circle",
                  },
                ]}
                theme={NIVO_THEME}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Senaste leads</CardTitle>
          <p className="text-sm text-muted-foreground">
            De senaste 20 besökarna som lämnade sitt mejl — skapas redan
            automatiskt som prospekt i Företag/Kontakter.
          </p>
        </CardHeader>
        <CardContent>
          {data.latest_leads.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Inga leads i vald period.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>E-post</TableHead>
                  <TableHead className="text-right">Poäng</TableHead>
                  <TableHead />
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.latest_leads.map((lead) => (
                  <TableRow key={`${lead.email}-${lead.created_at}`}>
                    <TableCell className="text-muted-foreground">
                      {formatDate(lead.created_at)}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate font-medium">
                      {lead.url}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {lead.email}
                    </TableCell>
                    <TableCell
                      className={`text-right font-semibold tabular-nums ${
                        lead.verdict_band
                          ? (VERDICT_COLORS[lead.verdict_band] ?? "")
                          : ""
                      }`}
                    >
                      {lead.total_score ?? "–"}
                    </TableCell>
                    <TableCell>
                      {lead.report_slug && (
                        <a
                          href={`${SCANNER_URL}/r/${lead.report_slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-primary hover:underline"
                        >
                          Rapport
                        </a>
                      )}
                    </TableCell>
                    <TableCell>
                      {lead.company_id != null && (
                        <Link
                          to={`/companies/${lead.company_id}/show`}
                          className="font-medium text-primary hover:underline"
                        >
                          Företag
                        </Link>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: typeof Search;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <Card className="gap-3 py-4">
      <CardContent className="px-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{label}</p>
          <Icon className="size-4 text-muted-foreground" />
        </div>
        <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
  );
}

function ScannerLeadStatsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
