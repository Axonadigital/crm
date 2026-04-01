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
      <Card className="py-4">
        <CardContent className="flex items-center gap-4">
          <div
            className="flex items-center justify-center w-10 h-10 rounded-lg"
            style={{ backgroundColor: `${color}20` }}
          >
            <Icon className="w-5 h-5" style={{ color }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground truncate">{title}</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold tracking-tight">{value}</p>
              {trend && (
                <span
                  className={`flex items-center text-xs font-medium ${trendColors[trend.direction]}`}
                >
                  {(() => {
                    const TIcon = TrendIcon[trend.direction];
                    return <TIcon className="w-3 h-3 mr-0.5" />;
                  })()}
                  {Math.abs(trend.value).toFixed(0)}%
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  },
);
