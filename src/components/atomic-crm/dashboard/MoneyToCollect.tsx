import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronRight,
  FileWarning,
  HandCoins,
  Repeat,
} from "lucide-react";
import { useDataProvider } from "ra-core";

import { Badge } from "@/components/ui/badge";

import { formatCurrency } from "../fortnox/invoiceFormat";
import type { CrmDataProvider } from "../providers/types";
import { DashboardCard } from "./DashboardCard";

const Section = ({
  icon: Icon,
  title,
  count,
  amount,
  tone,
  children,
}: {
  icon: React.ElementType;
  title: string;
  count: number;
  amount?: number;
  tone?: "danger";
  children: React.ReactNode;
}) => (
  <div>
    <div className="flex items-center justify-between px-1 py-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon
          className={`h-4 w-4 ${tone === "danger" ? "text-destructive" : "text-muted-foreground"}`}
        />
        {title}
      </div>
      <div className="flex items-center gap-2">
        {amount != null ? (
          <span className="text-sm font-semibold">
            {formatCurrency(amount)}
          </span>
        ) : null}
        <Badge variant={tone === "danger" ? "destructive" : "secondary"}>
          {count}
        </Badge>
      </div>
    </div>
    <div className="divide-y">{children}</div>
  </div>
);

const LinkRow = ({
  href,
  title,
  right,
}: {
  href: string;
  title: string;
  right?: string;
}) => (
  <a
    href={href}
    className="flex items-center justify-between gap-2 px-1 py-2 text-sm hover:bg-muted/50"
  >
    <span className="truncate">{title}</span>
    <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
      {right ? <span>{right}</span> : null}
      <ChevronRight className="h-4 w-4" />
    </span>
  </a>
);

/**
 * The money-and-actions widget: what needs doing to get paid, from data we
 * already hold. Three honest signals — outstanding invoices (reliable per
 * invoice), won customers not even set up as Fortnox customers (a strong
 * "probably not invoiced" signal, since no deal↔invoice link exists in the
 * data), and won recurring deals without a Fortnox contract.
 */
export const MoneyToCollect = () => {
  const dataProvider = useDataProvider<CrmDataProvider>();

  const { data: coverage } = useQuery({
    queryKey: ["customer-coverage"],
    queryFn: () => dataProvider.getCustomerCoverage(),
  });

  const { data: invoices } = useQuery({
    queryKey: ["fortnox", "supplier-and-invoices", "list"],
    queryFn: () => dataProvider.getFortnoxInvoices(),
  });

  const unpaid = (invoices ?? [])
    .filter((i) => i.status === "unpaid" || i.status === "overdue")
    .sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0));
  const unpaidBalance = unpaid.reduce((sum, i) => sum + (i.balance ?? 0), 0);

  const notCustomer = (coverage ?? []).filter((c) => !c.is_fortnox_customer);
  const notCustomerAmount = notCustomer.reduce(
    (sum, c) => sum + c.won_amount,
    0,
  );

  const recurringNoContract = (coverage ?? []).filter(
    (c) => c.has_recurring && !c.has_contract,
  );

  const nothing =
    unpaid.length === 0 &&
    notCustomer.length === 0 &&
    recurringNoContract.length === 0;

  return (
    <DashboardCard
      title="Pengar att hämta"
      icon={HandCoins}
      contentClassName="p-3"
    >
      {nothing ? (
        <p className="p-3 text-sm text-muted-foreground">
          Inget att åtgärda just nu. 🎉
        </p>
      ) : (
        <div className="space-y-3">
          {unpaid.length > 0 ? (
            <Section
              icon={AlertTriangle}
              title="Obetalda fakturor"
              count={unpaid.length}
              amount={unpaidBalance}
              tone="danger"
            >
              {unpaid.slice(0, 4).map((i) => (
                <LinkRow
                  key={i.document_number}
                  href="/#/invoices"
                  title={i.customer_name ?? `Faktura ${i.document_number}`}
                  right={`${formatCurrency(i.balance ?? 0)}${i.status === "overdue" ? " · förfallen" : ""}`}
                />
              ))}
            </Section>
          ) : null}

          {notCustomer.length > 0 ? (
            <Section
              icon={FileWarning}
              title="Vunna kunder ej upplagda i Fortnox"
              count={notCustomer.length}
              amount={notCustomerAmount}
            >
              {notCustomer.slice(0, 4).map((c) => (
                <LinkRow
                  key={c.company_id}
                  href={`/#/companies/${c.company_id}/show`}
                  title={c.company_name ?? "—"}
                  right={formatCurrency(c.won_amount)}
                />
              ))}
            </Section>
          ) : null}

          {recurringNoContract.length > 0 ? (
            <Section
              icon={Repeat}
              title="Återkommande utan Fortnox-avtal"
              count={recurringNoContract.length}
            >
              {recurringNoContract.slice(0, 4).map((c) => (
                <LinkRow
                  key={c.company_id}
                  href={`/#/companies/${c.company_id}/show`}
                  title={c.company_name ?? "—"}
                  right={`${formatCurrency(c.recurring_monthly)}/mån`}
                />
              ))}
            </Section>
          ) : null}
        </div>
      )}
    </DashboardCard>
  );
};
