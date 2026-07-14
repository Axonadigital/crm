import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Send } from "lucide-react";
import { useDataProvider, useNotify, useRecordContext } from "ra-core";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { CrmDataProvider } from "../providers/types";
import type { Company } from "../types";
import { InvoiceStatusBadge } from "./InvoiceStatusBadge";
import { formatCurrency, formatDate } from "./invoiceFormat";
import { useCompanyInvoices } from "./useCompanyInvoices";

/**
 * Every invoice this customer has in Fortnox, with its status. Mirrors the
 * Fakturor page, scoped to one company.
 */
export const CompanyInvoicesTab = () => {
  const company = useRecordContext<Company>();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const queryClient = useQueryClient();

  const { invoices, overdueCount, overdueAmount, unsentCount, isPending } =
    useCompanyInvoices(company?.id);

  const { mutate: send, isPending: isSending } = useMutation({
    mutationFn: (documentNumber: number) =>
      dataProvider.sendFortnoxInvoice(documentNumber),
    onSuccess: () => {
      notify("Fakturan skickades till kunden", { type: "info" });
      queryClient.invalidateQueries({ queryKey: ["fortnox"] });
    },
    onError: (error: Error) =>
      notify(error.message || "Kunde inte skicka fakturan", { type: "error" }),
  });

  if (isPending) return <Skeleton className="h-32 w-full" />;

  if (invoices.length === 0) {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        Inga fakturor i Fortnox för den här kunden.
      </p>
    );
  }

  return (
    <div className="space-y-4 pt-2">
      {overdueCount > 0 ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {overdueCount} förfallen{overdueCount > 1 ? "a" : ""} faktura
            {overdueCount > 1 ? "or" : ""} på {formatCurrency(overdueAmount)}
            {unsentCount > 0
              ? ` · ${unsentCount} faktura${unsentCount > 1 ? "or" : ""} har aldrig skickats till kunden`
              : ""}
            .
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nr</TableHead>
              <TableHead>Datum</TableHead>
              <TableHead>Förfaller</TableHead>
              <TableHead className="text-right">Belopp</TableHead>
              <TableHead className="text-right">Kvar</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => (
              <TableRow key={invoice.document_number}>
                <TableCell className="font-mono text-xs">
                  {invoice.document_number}
                </TableCell>
                <TableCell>{formatDate(invoice.invoice_date)}</TableCell>
                <TableCell>{formatDate(invoice.due_date)}</TableCell>
                <TableCell className="text-right">
                  {formatCurrency(invoice.total, invoice.currency ?? "SEK")}
                </TableCell>
                <TableCell className="text-right">
                  {invoice.status === "paid"
                    ? "—"
                    : formatCurrency(
                        invoice.balance,
                        invoice.currency ?? "SEK",
                      )}
                </TableCell>
                <TableCell>
                  <InvoiceStatusBadge invoice={invoice} />
                </TableCell>
                <TableCell className="text-right">
                  {!invoice.sent && invoice.status !== "cancelled" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isSending}
                      onClick={() => send(invoice.document_number)}
                    >
                      <Send className="mr-1 h-3 w-3" />
                      Skicka
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
