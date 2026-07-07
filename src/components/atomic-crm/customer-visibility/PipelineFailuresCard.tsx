import { AlertTriangle, RotateCcw } from "lucide-react";
import { useState } from "react";
import { useDataProvider, useGetList, useGetMany, useNotify } from "ra-core";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import type { VisibilityDataProvider } from "../companies/visibility/types";
import type { Company, ReportPipelineQueueItem } from "../types";

const STAGE_LABELS: Record<ReportPipelineQueueItem["stage"], string> = {
  snapshot: "Analys",
  report: "Rapport",
};

/**
 * Visar kunder vars automatiska månadsanalys/rapport misslyckades (report_pipeline_queue,
 * status='failed') med exakt felmeddelande, och en "Kör om"-knapp som återanvänder samma
 * manuella anrop som Kund-fliken redan har. Tomt/inget att visa → renderar ingenting.
 */
export function PipelineFailuresCard() {
  const dataProvider = useDataProvider<VisibilityDataProvider>();
  const notify = useNotify();
  const [retryingId, setRetryingId] = useState<number | null>(null);

  const {
    data: failures,
    total,
    isPending,
    refetch,
  } = useGetList<ReportPipelineQueueItem>("report_pipeline_queue", {
    pagination: { page: 1, perPage: 50 },
    sort: { field: "created_at", order: "DESC" },
    filter: { status: "failed" },
  });

  const companyIds = [
    ...new Set((failures ?? []).map((item) => item.company_id)),
  ];
  const { data: companies } = useGetMany<Company>(
    "companies",
    { ids: companyIds },
    { enabled: companyIds.length > 0 },
  );
  const companyNameById = new Map(
    (companies ?? []).map((company) => [company.id, company.name]),
  );

  if (isPending || !failures || failures.length === 0) return null;

  const handleRetry = async (item: ReportPipelineQueueItem) => {
    const companyName =
      companyNameById.get(item.company_id) ?? `Kund #${item.company_id}`;
    setRetryingId(item.id as number);
    try {
      // analyzeWebsite kastar alltid vid fel (ingen tyst "skip"), så om den
      // lyckas är det en riktig framgång. generateMonthlyReport kan däremot
      // svara 200 med status:"skipped_no_snapshot" — samma lista av godkända
      // statusar som cron-ticken (generate_monthly_reports/index.ts) använder,
      // så knappen inte kan gömma ett kvarstående fel bakom "klar".
      let resultStatus: string | null = null;
      if (item.stage === "snapshot") {
        await dataProvider.analyzeWebsite(item.company_id, {
          window_kind: "calendar_month",
          start_date: item.period_start,
          end_date: item.period_end,
        });
      } else {
        const result = await dataProvider.generateMonthlyReport(
          item.company_id,
          { period_start: item.period_start, period_end: item.period_end },
        );
        resultStatus = result.status;
      }
      const ok =
        resultStatus === null ||
        resultStatus === "draft" ||
        resultStatus === "draft_cron" ||
        resultStatus === "skipped_already_finalized";

      await dataProvider.update("report_pipeline_queue", {
        id: item.id,
        data: ok
          ? {
              status: "done",
              error: null,
              completed_at: new Date().toISOString(),
            }
          : { error: `Oväntat resultat vid omkörning: ${resultStatus}` },
        previousData: item,
      });

      if (ok) {
        notify(`${companyName} kördes om`, { type: "success" });
      } else {
        notify(
          `${companyName}: omkörningen gav fortfarande inget resultat (${resultStatus})`,
          { type: "warning" },
        );
      }
      await refetch();
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : `Kunde inte köra om ${companyName}`,
        { type: "warning" },
      );
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <Card className="border-amber-300/60 dark:border-amber-900/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-500">
          <AlertTriangle className="size-4" />
          {failures.length} kund{failures.length === 1 ? "" : "er"} fastnade i
          månadsrapport-kön
        </CardTitle>
        <CardDescription>
          Automatisk analys eller rapportgenerering misslyckades — kör om direkt
          här.
          {total != null && total > failures.length
            ? ` Visar de ${failures.length} senaste av ${total}.`
            : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {failures.map((item) => (
          <div
            key={item.id}
            className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  {companyNameById.get(item.company_id) ??
                    `Kund #${item.company_id}`}
                </span>
                <Badge variant="outline">{STAGE_LABELS[item.stage]}</Badge>
                <span className="text-xs text-muted-foreground">
                  {item.attempts} försök
                </span>
              </div>
              <p
                className="mt-1 truncate text-xs text-muted-foreground"
                title={item.error ?? undefined}
              >
                {item.error ?? "Okänt fel"}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={retryingId === item.id}
              onClick={() => handleRetry(item)}
            >
              <RotateCcw className="size-4" />
              Kör om
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
