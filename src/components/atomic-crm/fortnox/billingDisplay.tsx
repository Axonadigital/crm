import { CalendarClock, Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";

import type { CustomerBillingRow } from "../types";
import { formatDate } from "./invoiceFormat";

type BillingStatus = CustomerBillingRow["billing_status"];

export const BILLING_STATUS_LABELS: Record<BillingStatus, string> = {
  ok: "Planerad",
  due_soon: "Dags snart",
  overdue: "Behöver faktureras",
  never_invoiced: "Ingen faktura",
};

export const BILLING_CADENCE_LABELS: Record<
  CustomerBillingRow["billing_cadence"],
  string
> = {
  monthly: "Månadsvis",
  quarterly: "Kvartalsvis",
  yearly: "Årsvis",
  mixed: "Blandat",
};

const badgeVariant = (
  status: BillingStatus,
): "destructive" | "outline" | "secondary" =>
  status === "overdue" || status === "never_invoiced"
    ? "destructive"
    : status === "due_soon"
      ? "outline"
      : "secondary";

export const BillingStatusBadge = ({ status }: { status: BillingStatus }) => (
  <Badge variant={badgeVariant(status)}>{BILLING_STATUS_LABELS[status]}</Badge>
);

/**
 * Compact "next invoice on <date>" chip — the small, low-noise marker used on
 * deal cards and the deal page. Colour follows the billing status so an overdue
 * one reads at a glance without spelling it out.
 */
export const NextInvoiceChip = ({
  date,
  status,
  className,
}: {
  date: string | null;
  status: BillingStatus;
  className?: string;
}) => {
  if (!date) return null;
  const tone =
    status === "overdue"
      ? "text-destructive"
      : status === "due_soon"
        ? "text-amber-600 dark:text-amber-500"
        : "text-muted-foreground";
  const Icon = status === "due_soon" ? Clock : CalendarClock;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs ${tone} ${className ?? ""}`}
      title={`Nästa faktura ${formatDate(date)}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {formatDate(date)}
    </span>
  );
};
