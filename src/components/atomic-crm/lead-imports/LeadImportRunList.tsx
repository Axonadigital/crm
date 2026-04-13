import type { MouseEvent } from "react";
import {
  useDataProvider,
  useNotify,
  useRecordContext,
  useRefresh,
} from "ra-core";
import { Link } from "react-router";
import { DataTable } from "@/components/admin/data-table";
import { List } from "@/components/admin/list";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TopToolbar } from "../layout/TopToolbar";
import type { LeadImportRun } from "../types";
import type { CrmDataProvider } from "../providers/supabase/dataProvider";

const RunStatusBadge = () => {
  const record = useRecordContext<LeadImportRun>();
  if (!record) return null;

  const variant =
    record.status === "success"
      ? "default"
      : record.status === "failed"
        ? "destructive"
        : record.status === "partial"
          ? "secondary"
          : "outline";

  return <Badge variant={variant}>{record.status}</Badge>;
};

const FinishedAtField = () => {
  const record = useRecordContext<LeadImportRun>();
  if (!record) return null;
  return record.finished_at
    ? new Date(record.finished_at).toLocaleString("sv-SE")
    : "Pågår";
};

const RetryEnrichmentButton = () => {
  const record = useRecordContext<LeadImportRun>();
  const dataProvider = useDataProvider() as CrmDataProvider;
  const notify = useNotify();
  const refresh = useRefresh();

  if (!record || !record.imported_company_ids?.length) return null;

  const handleClick = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    try {
      const result = await dataProvider.retryLeadImportEnrichment(record.id);
      notify(
        `Retry klar: ${result.retried_companies ?? 0} företag skickade till enrichment`,
        { type: "success" },
      );
      refresh();
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Retry misslyckades",
        { type: "error" },
      );
    }
  };

  return (
    <Button size="sm" variant="outline" onClick={handleClick}>
      Kör enrichment igen
    </Button>
  );
};

const LeadImportRunActions = () => (
  <TopToolbar>
    <Button asChild variant="outline">
      <Link to="/lead_import_sources">Visa källor</Link>
    </Button>
  </TopToolbar>
);

export const LeadImportRunList = () => {
  return (
    <List
      title="Lead-importkörningar"
      actions={<LeadImportRunActions />}
      sort={{ field: "started_at", order: "DESC" }}
      perPage={25}
    >
      <DataTable>
        <DataTable.Col source="id" label="Körning" />
        <DataTable.Col source="triggered_by" label="Typ" />
        <DataTable.Col source="requested_batch_size" label="Batch" />
        <DataTable.Col source="status" label="Status">
          <RunStatusBadge />
        </DataTable.Col>
        <DataTable.Col source="rows_scanned" label="Scannade" />
        <DataTable.Col source="rows_inserted" label="Nya" />
        <DataTable.Col
          source="rows_skipped_duplicates"
          label="Dubbletter"
        />
        <DataTable.Col source="rows_failed" label="Fel" />
        <DataTable.Col source="finished_at" label="Klar">
          <FinishedAtField />
        </DataTable.Col>
        <DataTable.Col source="error_summary" label="Felmeddelande" />
        <DataTable.Col label="Åtgärd">
          <RetryEnrichmentButton />
        </DataTable.Col>
      </DataTable>
    </List>
  );
};
