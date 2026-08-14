import { ResponsiveLine } from "@nivo/line";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Mail,
  MessageCircleReply,
  MousePointerClick,
  Send,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useDataProvider } from "ra-core";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";

import { NIVO_THEME } from "../dashboard/chartTheme";
import MobileHeader from "../layout/MobileHeader";
import { MobileContent } from "../layout/MobileContent";
import type { CrmDataProvider } from "../providers/types";
import type { EmailSendStatsResponse } from "../types";
import { ScannerLeadStatsContent } from "./ScannerLeadStatsContent";

const CHANNEL_LABELS: Record<string, string> = {
  monthly_report: "Månadsrapport",
  docuseal_signing: "Offert-signering",
  template: "Mall-utskick",
  other: "Övrigt",
};

type PeriodOption = "30d" | "90d" | "12m" | "all";

const PERIOD_LABELS: Record<PeriodOption, string> = {
  "30d": "Senaste 30 dagarna",
  "90d": "Senaste 90 dagarna",
  "12m": "Senaste 12 månaderna",
  all: "Alla utskick",
};

function periodToRange(period: PeriodOption): { start?: string; end?: string } {
  if (period === "all") return {};
  const now = new Date();
  const start = new Date(now);
  if (period === "30d") start.setUTCDate(start.getUTCDate() - 30);
  if (period === "90d") start.setUTCDate(start.getUTCDate() - 90);
  if (period === "12m") start.setUTCMonth(start.getUTCMonth() - 12);
  return { start: start.toISOString() };
}

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

type StatsTab = "email" | "scanner";

const TAB_DESCRIPTIONS: Record<StatsTab, string> = {
  email:
    "Öppnings- och klickfrekvens för utskickade mejl (månadsrapporter, offertsigneringar och mallutskick), som underlag för att jämföra vilka texter som fungerar.",
  scanner:
    "Besökare som scannar sin egen hemsida via lead magneten på axonadigital.se — hur många försök som blir leads, och vilka de är.",
};

export function EmailStatsPage() {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const isMobile = useIsMobile();
  const [period, setPeriod] = useState<PeriodOption>("90d");
  const [tab, setTab] = useState<StatsTab>("email");

  const range = useMemo(() => periodToRange(period), [period]);
  const emailStatsQuery = useQuery({
    queryKey: ["email-send-stats", period],
    queryFn: () => dataProvider.getEmailSendStats(range),
  });
  const scannerLeadStatsQuery = useQuery({
    queryKey: ["scanner-lead-stats", period],
    queryFn: () => dataProvider.getScannerLeadStats(range),
    enabled: tab === "scanner",
  });

  const content = (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="hidden items-center gap-2 md:flex">
            <Mail className="size-5 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">
              Email-statistik
            </h1>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {TAB_DESCRIPTIONS[tab]}
          </p>
        </div>
        <Select
          value={period}
          onValueChange={(value) => setPeriod(value as PeriodOption)}
        >
          <SelectTrigger className="w-full lg:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PERIOD_LABELS) as PeriodOption[]).map((option) => (
              <SelectItem key={option} value={option}>
                {PERIOD_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </header>

      <Tabs value={tab} onValueChange={(value) => setTab(value as StatsTab)}>
        <TabsList>
          <TabsTrigger value="email">E-post</TabsTrigger>
          <TabsTrigger value="scanner">
            Lead-magnet (scanna hemsida)
          </TabsTrigger>
        </TabsList>
        <TabsContent value="email" className="mt-6">
          <EmailStatsContent
            data={emailStatsQuery.data ?? null}
            isPending={emailStatsQuery.isPending}
            error={emailStatsQuery.error as Error | null}
            onRetry={() => emailStatsQuery.refetch()}
          />
        </TabsContent>
        <TabsContent value="scanner" className="mt-6">
          <ScannerLeadStatsContent
            data={scannerLeadStatsQuery.data ?? null}
            isPending={scannerLeadStatsQuery.isPending}
            error={scannerLeadStatsQuery.error as Error | null}
            onRetry={() => scannerLeadStatsQuery.refetch()}
          />
        </TabsContent>
      </Tabs>
    </div>
  );

  if (isMobile) {
    return (
      <>
        <MobileHeader>
          <div>
            <p className="text-xs text-muted-foreground">Översikt</p>
            <h1 className="text-lg font-semibold">Email-statistik</h1>
          </div>
        </MobileHeader>
        <MobileContent
          onRefresh={() =>
            tab === "email"
              ? emailStatsQuery.refetch()
              : scannerLeadStatsQuery.refetch()
          }
        >
          {content}
        </MobileContent>
      </>
    );
  }

  return <main className="mt-1">{content}</main>;
}

function EmailStatsContent({
  data,
  isPending,
  error,
  onRetry,
}: {
  data: EmailSendStatsResponse | null;
  isPending: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  if (isPending) return <EmailStatsSkeleton />;
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="size-4" />
        <AlertTitle>Email-statistiken kunde inte laddas</AlertTitle>
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

  const trendPoints = data.trend.filter(
    (point) => point.open_rate != null || point.click_rate != null,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <SummaryCard
          icon={Send}
          label="Skickade"
          value={data.totals.sent.toLocaleString("sv-SE")}
          helper={`${data.totals.delivered.toLocaleString("sv-SE")} levererade`}
        />
        <SummaryCard
          icon={Mail}
          label="Öppningsfrekvens"
          value={formatRate(data.totals.open_rate)}
          helper={`${data.totals.opened.toLocaleString("sv-SE")} öppnade`}
        />
        <SummaryCard
          icon={MousePointerClick}
          label="Klickfrekvens"
          value={formatRate(data.totals.click_rate)}
          helper={`${data.totals.clicked.toLocaleString("sv-SE")} klickade`}
        />
        <SummaryCard
          icon={MessageCircleReply}
          label="Svarsfrekvens"
          value={formatRate(data.totals.reply_rate)}
          helper={`${data.totals.replied.toLocaleString("sv-SE")} svarade`}
        />
        <SummaryCard
          icon={AlertTriangle}
          label="Studsfrekvens"
          value={formatRate(data.totals.bounce_rate)}
          helper={`${data.totals.bounced.toLocaleString("sv-SE")} studsade`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Öppnings- och klickfrekvens per vecka</CardTitle>
          <p className="text-sm text-muted-foreground">
            Andel av veckans utskick som öppnades respektive klickades.
          </p>
        </CardHeader>
        <CardContent>
          {trendPoints.length < 2 ? (
            <div className="flex h-72 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
              Minst två veckor med data behövs för en trend.
            </div>
          ) : (
            <div
              className="h-72"
              aria-label="Öppnings- och klickfrekvens per vecka"
            >
              <ResponsiveLine
                data={[
                  {
                    id: "Öppningsfrekvens",
                    data: trendPoints.map((point) => ({
                      x: point.period_start,
                      y: point.open_rate,
                    })),
                  },
                  {
                    id: "Klickfrekvens",
                    data: trendPoints.map((point) => ({
                      x: point.period_start,
                      y: point.click_rate,
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
                axisLeft={{
                  format: (value) => `${value} %`,
                }}
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
                        {point.seriesId}: {point.data.yFormatted} %
                      </p>
                    ))}
                  </div>
                )}
                legends={[
                  {
                    anchor: "top-right",
                    direction: "row",
                    translateY: -20,
                    itemWidth: 130,
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
          <CardTitle>Per kanal</CardTitle>
          <p className="text-sm text-muted-foreground">
            Månadsrapporter, offertsigneringar och mallutskick jämförda.
          </p>
        </CardHeader>
        <CardContent>
          {data.by_channel.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Inga utskick i vald period.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kanal</TableHead>
                  <TableHead className="text-right">Skickade</TableHead>
                  <TableHead className="text-right">Öppnade</TableHead>
                  <TableHead className="text-right">Klickade</TableHead>
                  <TableHead className="text-right">Svarade</TableHead>
                  <TableHead className="text-right">Öppningsfrekvens</TableHead>
                  <TableHead className="text-right">Klickfrekvens</TableHead>
                  <TableHead className="text-right">Svarsfrekvens</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.by_channel.map((row) => (
                  <TableRow key={row.channel}>
                    <TableCell className="font-medium">
                      {CHANNEL_LABELS[row.channel] ?? row.channel}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.sent.toLocaleString("sv-SE")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.opened.toLocaleString("sv-SE")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.clicked.toLocaleString("sv-SE")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.replied.toLocaleString("sv-SE")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRate(row.open_rate)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRate(row.click_rate)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRate(row.reply_rate)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per mall</CardTitle>
          <p className="text-sm text-muted-foreground">
            Jämför olika mejlmallar för att se vilka texter som konverterar bäst
            — grunden för att A/B-testa nya varianter.
          </p>
        </CardHeader>
        <CardContent>
          {data.by_template.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Inga mallutskick i vald period.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mall</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead className="text-right">Skickade</TableHead>
                  <TableHead className="text-right">Öppnade</TableHead>
                  <TableHead className="text-right">Klickade</TableHead>
                  <TableHead className="text-right">Svarade</TableHead>
                  <TableHead className="text-right">Öppningsfrekvens</TableHead>
                  <TableHead className="text-right">Klickfrekvens</TableHead>
                  <TableHead className="text-right">Svarsfrekvens</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.by_template.map((row) => (
                  <TableRow key={row.template_id}>
                    <TableCell className="font-medium">
                      {row.template_name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.category}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.sent.toLocaleString("sv-SE")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.opened.toLocaleString("sv-SE")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.clicked.toLocaleString("sv-SE")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.replied.toLocaleString("sv-SE")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRate(row.open_rate)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRate(row.click_rate)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRate(row.reply_rate)}
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
  icon: typeof Send;
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

function EmailStatsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
