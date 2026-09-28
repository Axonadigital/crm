import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreVertical, Plus } from "lucide-react";
import { useDataProvider, useNotify } from "ra-core";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { CrmDataProvider } from "../providers/types";
import type { Subscription } from "../types";
import { formatCurrency, formatDate } from "./invoiceFormat";
import { SubscriptionDialog } from "./SubscriptionDialog";
import {
  type CostRow,
  deviation,
  findUnregistered,
  reconcile,
} from "./subscriptionReconcile";

const StatCard = ({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "danger";
}) => (
  <Card>
    <CardContent className="pt-6">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div
        className={`mt-2 text-2xl font-semibold ${tone === "danger" ? "text-destructive" : ""}`}
      >
        {value}
      </div>
      {sub ? (
        <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
      ) : null}
    </CardContent>
  </Card>
);

export const SubscriptionsPage = () => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Subscription | undefined>();
  const [seed, setSeed] = useState<
    { name: string; aliases: string } | undefined
  >();

  const { data: subscriptions } = useQuery({
    queryKey: ["subscriptions"],
    queryFn: () => dataProvider.getSubscriptions(),
  });

  const { data: costs } = useQuery({
    queryKey: ["fortnox", "cost-by-description"],
    queryFn: () => dataProvider.getCostByDescription(),
  });

  const costRows: CostRow[] = useMemo(
    () =>
      (costs ?? []).map((c) => ({
        description: c.description,
        month_count: c.month_count,
        total_cost: c.total_cost,
        cost_90d: c.cost_90d,
        last_date: c.last_date,
      })),
    [costs],
  );

  const endMutation = useMutation({
    mutationFn: (id: Subscription["id"]) =>
      dataProvider.updateSubscription(id, {
        status: "ended",
        ended_on: new Date().toISOString().slice(0, 10),
      }),
    onSuccess: () => {
      notify("Abonnemang avslutat", { type: "info" });
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: Subscription["id"]) => dataProvider.deleteSubscription(id),
    onSuccess: () => {
      notify("Abonnemang borttaget", { type: "info" });
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
    },
  });

  const enriched = useMemo(
    () =>
      (subscriptions ?? []).map((s) => {
        const rec = reconcile(s.aliases, costRows);
        return { s, rec, dev: deviation(s.monthly_amount, rec) };
      }),
    [subscriptions, costRows],
  );

  const active = enriched.filter((e) => e.s.status === "active");
  const history = enriched.filter((e) => e.s.status !== "active");

  const declaredMonthly = active.reduce(
    (sum, e) => sum + e.s.monthly_amount,
    0,
  );
  const bookedMonthly = active.reduce((sum, e) => sum + e.rec.bookedMonthly, 0);
  const deviations = active.filter((e) => e.dev !== "ok").length;

  const unregistered = useMemo(
    () => findUnregistered(costRows, subscriptions ?? []),
    [costRows, subscriptions],
  );

  const openCreate = (seedValue?: { name: string; aliases: string }) => {
    setEditing(undefined);
    setSeed(seedValue);
    setDialogOpen(true);
  };
  const openEdit = (s: Subscription) => {
    setEditing(s);
    setSeed(undefined);
    setDialogOpen(true);
  };

  const DevBadge = ({
    dev,
    booked,
  }: {
    dev: ReturnType<typeof deviation>;
    booked: number;
  }) => {
    if (dev === "ok") return null;
    if (dev === "missing") {
      return <Badge variant="outline">ej bokförd senaste 90 dgr</Badge>;
    }
    return (
      <Badge variant="destructive">bokfört ~{formatCurrency(booked)}/mån</Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Abonnemang</h1>
          <p className="text-sm text-muted-foreground">
            Det ni faktiskt betalar för — stämt av mot bokföringen.
          </p>
        </div>
        <Button onClick={() => openCreate()}>
          <Plus className="mr-2 h-4 w-4" />
          Lägg till
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Löpande kostnad"
          value={`${formatCurrency(declaredMonthly)}/mån`}
          sub={`${active.length} aktiva abonnemang`}
        />
        <StatCard
          label="Bokfört (~90 dgr)"
          value={`${formatCurrency(bookedMonthly)}/mån`}
          sub="vad Fortnox faktiskt dragit"
        />
        <StatCard
          label="Avvikelser"
          value={String(deviations)}
          sub="deklarerat ≠ bokfört"
          tone={deviations > 0 ? "danger" : undefined}
        />
        <StatCard
          label="Oregistrerade"
          value={String(unregistered.length)}
          sub="återkommande i bokföringen"
          tone={unregistered.length > 0 ? "danger" : undefined}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="p-4 pb-0">
            <h2 className="font-semibold">Aktiva abonnemang</h2>
          </div>
          {active.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              Inga aktiva abonnemang. Klicka "Lägg till".
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Namn</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead className="text-right">Deklarerat/mån</TableHead>
                  <TableHead className="text-right">Bokfört/mån</TableHead>
                  <TableHead>Sedan</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {active.map(({ s, rec, dev }) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.category ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(s.monthly_amount)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span>{formatCurrency(rec.bookedMonthly)}</span>
                        <DevBadge dev={dev} booked={rec.bookedMonthly} />
                      </div>
                    </TableCell>
                    <TableCell>{formatDate(s.started_on)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(s)}>
                            Redigera
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => endMutation.mutate(s.id)}
                          >
                            Avsluta
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => deleteMutation.mutate(s.id)}
                          >
                            Ta bort
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {unregistered.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <div className="p-4 pb-0">
              <h2 className="font-semibold">
                Återkommande i bokföringen — ej i registret
              </h2>
              <p className="text-sm text-muted-foreground">
                Kostnader som dras löpande men saknas i listan ovan. Lägg till
                dem så fångas de i runraten.
              </p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Leverantör (bokföring)</TableHead>
                  <TableHead className="text-right">~/mån (90 dgr)</TableHead>
                  <TableHead>Senast</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {unregistered.map((c) => (
                  <TableRow key={c.description}>
                    <TableCell className="font-mono text-xs">
                      {c.description}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(c.cost_90d / 3)}
                    </TableCell>
                    <TableCell>{formatDate(c.last_date)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          openCreate({
                            name: c.description,
                            aliases: c.description,
                          })
                        }
                      >
                        Lägg till
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {history.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <div className="p-4 pb-0">
              <h2 className="font-semibold">Tidigare &amp; pausade</h2>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Namn</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Deklarerat/mån</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map(({ s }) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {s.status === "ended" ? "Avslutad" : "Pausad"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(s.started_on)} – {formatDate(s.ended_on)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(s.monthly_amount)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(s)}>
                            Redigera
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => deleteMutation.mutate(s.id)}
                          >
                            Ta bort
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <p className="text-xs text-muted-foreground">
        "Bokfört/mån" är vad Fortnox faktiskt dragit senaste 90 dagarna
        (återbetalningar avräknade), fördelat per månad. Avviker det mycket från
        det deklarerade beloppet är det värt att kolla.
      </p>

      <SubscriptionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        subscription={editing}
        seed={seed}
      />
    </div>
  );
};

SubscriptionsPage.path = "/subscriptions";
