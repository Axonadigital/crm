import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import { useDataProvider, useNotify } from "ra-core";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import type { CrmDataProvider } from "../providers/types";

/**
 * Fortnox connection panel. The consent flow runs exactly once: it creates a
 * service account in Fortnox, after which the backend mints its own tokens and
 * no one ever has to log in again.
 */
export const FortnoxIntegrationCard = () => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const queryClient = useQueryClient();

  const { data: status, isPending } = useQuery({
    queryKey: ["fortnox", "status"],
    queryFn: () => dataProvider.getFortnoxStatus(),
    retry: false,
  });

  const { mutate: connect, isPending: isConnecting } = useMutation({
    // Reconnecting replaces the stored connection, so the backend requires the
    // caller to say so explicitly.
    mutationFn: () =>
      dataProvider.startFortnoxAuthorization(status?.connected === true),
    onSuccess: ({ authorization_url }) => {
      // Fortnox demands a real browser login, so we hand the user off to it.
      window.open(authorization_url, "_blank", "noopener,noreferrer");
      notify("Godkänn kopplingen i Fortnox-fönstret, uppdatera sedan sidan.", {
        type: "info",
      });
    },
    onError: () => {
      notify("Kunde inte starta Fortnox-kopplingen", { type: "error" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["fortnox", "status"] });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Fortnox
          {status?.connected ? (
            <Badge variant="outline" className="gap-1">
              <CheckCircle2 className="h-3 w-3" /> Kopplat
            </Badge>
          ) : null}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : status?.connected ? (
          <div className="space-y-2 text-sm">
            <p>
              Anslutet till <strong>{status.company_name ?? "Fortnox"}</strong>
              {status.org_number ? ` (${status.org_number})` : ""}.
            </p>
            {status.auth_mode === "refresh_token" ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Kopplingen är inte permanent</AlertTitle>
                <AlertDescription>
                  Inget servicekonto kunde skapas, så kopplingen vilar på en
                  refresh-token som slutar gälla efter 45 dagars inaktivitet.
                  Koppla om för att försöka igen.
                </AlertDescription>
              </Alert>
            ) : (
              <p className="text-muted-foreground">
                Servicekonto aktivt — kopplingen förnyar sig själv och behöver
                aldrig loggas in på nytt.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              Koppla CRM:et till Fortnox för att kunna skapa kunder och fakturor
              och följa betalstatus direkt härifrån.
            </p>
            {status?.error ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Fortnox svarade med ett fel</AlertTitle>
                <AlertDescription>{status.error}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        )}

        <Button
          onClick={() => connect()}
          disabled={isConnecting}
          variant={status?.connected ? "outline" : "default"}
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          {status?.connected ? "Koppla om" : "Koppla till Fortnox"}
        </Button>
      </CardContent>
    </Card>
  );
};
