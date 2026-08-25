import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FlaskConical,
} from "lucide-react";
import { useDataProvider, useNotify } from "ra-core";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import type { CrmDataProvider } from "../providers/types";
import type { FortnoxEnvironment } from "../types";
import { FortnoxRecurringSandboxTest } from "./FortnoxRecurringSandboxTest";

/**
 * One Fortnox connection. The consent flow runs once per company: it creates a
 * service account in Fortnox, after which the backend mints its own tokens and
 * nobody has to log in again.
 *
 * Production and sandbox are separate connections, stored as separate rows, so
 * authorizing a test company never disturbs the live one — which matters
 * because the invoice sync runs every 15 minutes and would otherwise pull
 * invented invoices into the mirror that Kundtäckning and Likviditet read.
 */
const ConnectionPanel = ({
  environment,
}: {
  environment: FortnoxEnvironment;
}) => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const isSandbox = environment === "sandbox";

  const { data: status, isPending } = useQuery({
    queryKey: ["fortnox", "status", environment],
    queryFn: () => dataProvider.getFortnoxStatus(environment),
    retry: false,
  });

  const { mutate: connect, isPending: isConnecting } = useMutation({
    // Reconnecting replaces the stored connection, so the backend requires the
    // caller to say so explicitly.
    mutationFn: () =>
      dataProvider.startFortnoxAuthorization(
        status?.connected === true,
        environment,
      ),
    onSuccess: ({ authorization_url }) => {
      // Fortnox demands a real browser login, so we hand the user off to it.
      window.open(authorization_url, "_blank", "noopener,noreferrer");
      notify(
        isSandbox
          ? "Logga in på testföretaget i Fortnox-fönstret och godkänn kopplingen, uppdatera sedan sidan."
          : "Godkänn kopplingen i Fortnox-fönstret, uppdatera sedan sidan.",
        { type: "info" },
      );
    },
    onError: () => {
      notify("Kunde inte starta Fortnox-kopplingen", { type: "error" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["fortnox", "status"] });
    },
  });

  return (
    <div className="space-y-4">
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
            {isSandbox
              ? "Skapa en testmiljö i Fortnox utvecklarportal, koppla den här och prova nya flöden mot den i stället för mot skarp bokföring."
              : "Koppla CRM:et till Fortnox för att kunna skapa kunder och fakturor och följa betalstatus direkt härifrån."}
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
        variant={status?.connected || isSandbox ? "outline" : "default"}
      >
        <ExternalLink className="mr-2 h-4 w-4" />
        {status?.connected
          ? "Koppla om"
          : isSandbox
            ? "Koppla testmiljö"
            : "Koppla till Fortnox"}
      </Button>
    </div>
  );
};

const ConnectedBadge = ({
  environment,
}: {
  environment: FortnoxEnvironment;
}) => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const { data } = useQuery({
    queryKey: ["fortnox", "status", environment],
    queryFn: () => dataProvider.getFortnoxStatus(environment),
    retry: false,
  });
  if (!data?.connected) return null;
  return (
    <Badge variant="outline" className="gap-1">
      <CheckCircle2 className="h-3 w-3" /> Kopplat
    </Badge>
  );
};

export const FortnoxIntegrationCard = () => (
  <Card data-tour="settings-fortnox">
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        Fortnox
        <ConnectedBadge environment="production" />
      </CardTitle>
    </CardHeader>
    <CardContent>
      <ConnectionPanel environment="production" />
    </CardContent>
  </Card>
);

/**
 * The sandbox connection, kept in its own card so it can never be mistaken for
 * the live one. Fortnox allows up to 30 test companies per developer account,
 * created and deleted in the developer portal, each a full Fortnox database.
 *
 * Scheduled syncs always read the production connection, so a sandbox being
 * connected here changes nothing about the invoice mirror or the bookkeeping
 * figures. Only a flow that explicitly asks for the test environment reaches it.
 */
export const FortnoxSandboxCard = () => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const { data: sandbox } = useQuery({
    queryKey: ["fortnox", "status", "sandbox"],
    queryFn: () => dataProvider.getFortnoxStatus("sandbox"),
    retry: false,
  });

  return (
    <Card data-tour="settings-fortnox-sandbox">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4" />
          Fortnox testmiljö
          <ConnectedBadge environment="sandbox" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ConnectionPanel environment="sandbox" />
        {sandbox?.connected ? <FortnoxRecurringSandboxTest /> : null}
        <p className="text-xs text-muted-foreground">
          Synkarna av fakturor, leverantörsfakturor och verifikationer läser
          alltid skarp miljö. Testmiljön används bara av flöden som uttryckligen
          ber om den, så inget testdata kan hamna i Kundtäckning eller
          Likviditet.
        </p>
      </CardContent>
    </Card>
  );
};
