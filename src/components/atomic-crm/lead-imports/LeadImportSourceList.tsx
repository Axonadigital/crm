import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TopToolbar } from "../layout/TopToolbar";
import type {
  LeadImportSource,
} from "../types";
import type { CrmDataProvider } from "../providers/supabase/dataProvider";

const statusVariant = (status: LeadImportSource["last_run_status"]) => {
  switch (status) {
    case "success":
      return "default";
    case "running":
      return "outline";
    case "partial":
      return "secondary";
    case "failed":
      return "destructive";
    default:
      return "secondary";
  }
};

const LeadImportActions = () => (
  <TopToolbar>
    <Button asChild variant="outline">
      <Link to="/lead_import_runs">Visa körningar</Link>
    </Button>
  </TopToolbar>
);

const ActiveBadge = () => {
  const record = useRecordContext<LeadImportSource>();
  if (!record) return null;
  return record.is_active ? (
    <Badge variant="default">Aktiv</Badge>
  ) : (
    <Badge variant="secondary">Inaktiv</Badge>
  );
};

const LastRunStatusField = () => {
  const record = useRecordContext<LeadImportSource>();
  if (!record) return null;
  return (
    <Badge variant={statusVariant(record.last_run_status)}>
      {record.last_run_status}
    </Badge>
  );
};

const LastSuccessfulRunField = () => {
  const record = useRecordContext<LeadImportSource>();
  if (!record) return null;
  return record.last_successful_run_at
    ? new Date(record.last_successful_run_at).toLocaleString("sv-SE")
    : "Aldrig";
};

const TriggerImportButton = () => {
  const record = useRecordContext<LeadImportSource>();
  const dataProvider = useDataProvider() as CrmDataProvider;
  const notify = useNotify();
  const refresh = useRefresh();
  const [batchSize, setBatchSize] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  if (!record) return null;

  const handleClick = async () => {
    setIsRunning(true);
    try {
      const parsedBatchSize = batchSize.trim()
        ? Number.parseInt(batchSize.trim(), 10)
        : undefined;
      const result = await dataProvider.importGoogleSheetLeads({
        source_id: record.id,
        ...(parsedBatchSize ? { batch_size: parsedBatchSize } : {}),
      });
      if (typeof result.message === "string" && result.rows_inserted == null) {
        notify(result.message, { type: "info" });
        return;
      }
      notify(
        `Import klar: ${result.rows_inserted ?? 0} nya, ${result.rows_skipped_duplicates ?? 0} dubbletter`,
        { type: "success" },
      );
      refresh();
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Import misslyckades",
        { type: "error" },
      );
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div
      className="flex items-center gap-2"
      onClick={(event) => event.stopPropagation()}
    >
      <Input
        type="number"
        min={1}
        placeholder={String(record.batch_size_default)}
        value={batchSize}
        onChange={(event) => setBatchSize(event.target.value)}
        className="h-8 w-24"
      />
      <Button
        size="sm"
        onClick={handleClick}
        disabled={isRunning || record.last_run_status === "running"}
      >
        {isRunning ? "Importerar..." : "Importera nästa batch"}
      </Button>
    </div>
  );
};

export const LeadImportSourceList = () => {
  return (
    <List
      title="Lead-importkällor"
      actions={<LeadImportActions />}
      sort={{ field: "updated_at", order: "DESC" }}
      perPage={10}
    >
      <DataTable>
        <DataTable.Col source="name" label="Namn" />
        <DataTable.Col source="is_active" label="Aktiv">
          <ActiveBadge />
        </DataTable.Col>
        <DataTable.Col source="batch_size_default" label="Standardbatch" />
        <DataTable.Col source="last_imported_row" label="Senaste rad" />
        <DataTable.Col source="last_run_status" label="Senaste status">
          <LastRunStatusField />
        </DataTable.Col>
        <DataTable.Col source="last_successful_run_at" label="Senast lyckad">
          <LastSuccessfulRunField />
        </DataTable.Col>
        <DataTable.Col source="last_run_message" label="Meddelande" />
        <DataTable.Col label="Kör nu">
          <TriggerImportButton />
        </DataTable.Col>
      </DataTable>
    </List>
  );
};
