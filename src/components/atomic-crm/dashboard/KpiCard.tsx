import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { memo } from "react";

import { Card, CardContent } from "@/components/ui/card";

interface KpiCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    direction: "up" | "down" | "flat";
  };
  color: string;
}

const trendColors = {
  up: "text-green-600",
  down: "text-red-500",
  flat: "text-muted-foreground",
};

const TrendIcon = {
  up: ArrowUp,
  down: ArrowDown,
  flat: Minus,
};

export const KpiCard = memo(
  ({ title, value, icon: Icon, trend, color }: KpiCardProps) => {
    return (
      <Card className="py-3">
        <CardContent className="flex flex-col gap-2 px-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground truncate">{title}</p>
            <div
              className="flex items-center justify-center w-7 h-7 rounded-lg shrink-0"
              style={{ backgroundColor: `${color}20` }}
            >
              <Icon className="w-4 h-4" style={{ color }} />
            </div>
          </div>
          <div className="flex items-baseline gap-1 min-w-0">
            <p className="text-xl font-bold tracking-tight truncate">{value}</p>
            {trend && (
              <span
                className={`flex items-center text-xs font-medium shrink-0 ${trendColors[trend.direction]}`}
              >
                {(() => {
                  const TIcon = TrendIcon[trend.direction];
                  return <TIcon className="w-3 h-3 mr-0.5" />;
                })()}
                {Math.abs(trend.value).toFixed(0)}%
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    );
  },
);
