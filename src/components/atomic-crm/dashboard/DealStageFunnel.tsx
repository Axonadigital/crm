import { Layers } from "lucide-react";
import { useTranslate } from "ra-core";
import { memo } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

import { useConfigurationContext } from "../root/ConfigurationContext";
import { useDashboardDeals } from "./useDashboardDeals";

const DEFAULT_LOCALE = "en-US";

const STAGE_COLORS: Record<string, string> = {
  opportunity: "#3b82f6",
  "generating-proposal": "#8b5cf6",
  "proposal-sent": "#f59e0b",
  "in-negociation": "#ef4444",
  delayed: "#6b7280",
};

export const DealStageFunnel = memo(() => {
  const translate = useTranslate();
  const { currency } = useConfigurationContext();
  const { dealsByStage, isPending } = useDashboardDeals();
  const locale =
    navigator?.languages?.[0] ?? navigator?.language ?? DEFAULT_LOCALE;

  if (isPending || dealsByStage.length === 0) {
    return null;
  }

  const maxValue = Math.max(...dealsByStage.map((s) => s.value));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center mb-2">
        <div className="mr-3 flex">
          <Layers className="text-muted-foreground w-6 h-6" />
        </div>
        <h2 className="text-xl font-semibold text-muted-foreground">
          {translate("crm.dashboard.deal_stage_breakdown", {
            _: "Deal Stage Breakdown",
          })}
        </h2>
      </div>
      <Card>
        <CardContent className="flex flex-col gap-4">
          {dealsByStage.map((stage) => (
            <div key={stage.stage} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{
                      backgroundColor: STAGE_COLORS[stage.stage] ?? "#6b7280",
                    }}
                  />
                  <span className="font-medium">{stage.label}</span>
                  <Badge variant="secondary" className="text-xs">
                    {stage.count}
                  </Badge>
                </div>
                <span className="text-muted-foreground font-medium">
                  {stage.value.toLocaleString(locale, {
                    style: "currency",
                    currency,
                    maximumFractionDigits: 0,
                  })}
                </span>
              </div>
              <Progress
                value={maxValue > 0 ? (stage.value / maxValue) * 100 : 0}
                className="h-2"
                style={
                  {
                    "--color-primary": STAGE_COLORS[stage.stage] ?? "#6b7280",
                  } as React.CSSProperties
                }
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
});
