import { ErrorBoundary, type FallbackProps } from "react-error-boundary";
import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const WidgetFallback = ({ error, resetErrorBoundary }: FallbackProps) => {
  const message =
    error instanceof Error ? error.message : "Unknown widget error";

  if (import.meta.env.DEV) {
    console.error("[Dashboard widget error]", error);
  }

  return (
    <Card className="border-destructive/30">
      <CardContent className="flex flex-col items-center gap-2 py-6 text-center">
        <CircleAlert className="w-5 h-5 text-destructive" />
        <p className="text-sm text-muted-foreground">
          Widget could not be loaded
        </p>
        {import.meta.env.DEV && (
          <p className="text-xs text-muted-foreground font-mono max-w-full truncate">
            {message}
          </p>
        )}
        <Button variant="ghost" size="sm" onClick={resetErrorBoundary}>
          Retry
        </Button>
      </CardContent>
    </Card>
  );
};

export const WidgetErrorBoundary = ({ children }: { children: ReactNode }) => (
  <ErrorBoundary FallbackComponent={WidgetFallback}>{children}</ErrorBoundary>
);
