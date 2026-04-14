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
import type { LeadImportSource } from "../types";
import type { CrmDataProvider } from "../providers/supabase/dataProvider";

const QUICK_BATCH_SIZES = [50, 100, 200, 300] as const;
const MAX_BATCH_SIZE = 1000;

type ImportRowStats = {
  scanned_rows?: number[];
  imported_rows?: number[];
  duplicate_rows?: number[];
  failed_rows?: number[];
};

type ImportGoogleSheetLeadsResult = {
  message?: string;
  rows_inserted?: number;
  rows_scanned?: number;
  rows_skipped_duplicates?: number;
  rows_failed?: number;
  actual_batch_size?: number;
  sheet_writeback_status?: string;
  row_stats?: ImportRowStats;
  last_run_message?: string;
};

const toRowRanges = (rowNumbers?: number[]) => {
  if (!rowNumbers?.length) return "inga";

  const sorted = [...rowNumbers].sort((a, b) => a - b);
  const ranges: string[] = [];
  let rangeStart = sorted[0];
  let previous = sorted[0];

  for (let index = 1; index < sorted.length; index++) {
    const current = sorted[index];
    if (current === previous || current === previous + 1) {
      previous = current;
      continue;
    }

    ranges.push(
      rangeStart === previous ? String(rangeStart) : `${rangeStart}-${previous}`,
    );
    rangeStart = current;
    previous = current;
  }

  ranges.push(
    rangeStart === previous ? String(rangeStart) : `${rangeStart}-${previous}`,
  );

  return ranges.join(", ");
};

const formatRowStats = (rowStats?: ImportRowStats) => {
  if (!rowStats?.scanned_rows?.length) return null;

  return [
    `Rader: ${toRowRanges(rowStats.scanned_rows)}`,
    `Nya: ${toRowRanges(rowStats.imported_rows)}`,
    `Dubbletter: ${toRowRanges(rowStats.duplicate_rows)}`,
    `Fel: ${toRowRanges(rowStats.failed_rows)}`,
  ].join(" | ");
};

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
  const [startRow, setStartRow] = useState("");
  const [endRow, setEndRow] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  if (!record) return null;

  const handleClick = async () => {
    try {
      const parsedBatchSize = batchSize.trim()
        ? Number.parseInt(batchSize.trim(), 10)
        : undefined;
      const parsedStartRow = startRow.trim()
        ? Number.parseInt(startRow.trim(), 10)
        : undefined;
      const parsedEndRow = endRow.trim()
        ? Number.parseInt(endRow.trim(), 10)
        : undefined;

      const isStartRowImport = parsedStartRow != null;
      const hasEndRow = parsedEndRow != null;

      if (isStartRowImport) {
        if (
          Number.isNaN(parsedStartRow) ||
          parsedStartRow < 2 ||
          (hasEndRow && (Number.isNaN(parsedEndRow) || parsedEndRow < 2))
        ) {
          notify("Radintervall måste vara giltiga radnummer från 2 och uppåt", {
            type: "warning",
          });
          return;
        }
      }

      if (hasEndRow && !isStartRowImport) {
        notify("Ange från-rad om du vill ange till-rad", {
          type: "warning",
        });
        return;
      }

      if (isStartRowImport && !hasEndRow && parsedBatchSize == null) {
        notify("Ange batchstorlek eller till-rad när du väljer från-rad", {
          type: "warning",
        });
        return;
      }

      if (hasEndRow) {
        if (parsedEndRow < parsedStartRow!) {
          notify("Till-rad måste vara samma eller större än från-rad", {
            type: "warning",
          });
          return;
        }
        if (parsedEndRow - parsedStartRow! + 1 > MAX_BATCH_SIZE) {
          notify(`Radintervallet får innehålla högst ${MAX_BATCH_SIZE} rader`, {
            type: "warning",
          });
          return;
        }
      }

      if (parsedBatchSize != null) {
        if (Number.isNaN(parsedBatchSize) || parsedBatchSize < 1) {
          notify("Batchstorlek måste vara minst 1", { type: "warning" });
          return;
        }
        if (parsedBatchSize > MAX_BATCH_SIZE) {
          notify(`Batchstorlek får vara högst ${MAX_BATCH_SIZE}`, {
            type: "warning",
          });
          return;
        }
      }

      const derivedEndRow =
        isStartRowImport && !hasEndRow
          ? parsedStartRow! + (parsedBatchSize ?? record.batch_size_default) - 1
          : parsedEndRow;
      const isRangeImport = isStartRowImport;

      setIsRunning(true);
      const result = (await dataProvider.importGoogleSheetLeads({
        source_id: record.id,
        ...(isRangeImport
          ? {
              start_row: parsedStartRow,
              end_row: derivedEndRow,
            }
          : parsedBatchSize
            ? { batch_size: parsedBatchSize }
            : {}),
      })) as ImportGoogleSheetLeadsResult;
      if (typeof result.message === "string" && result.rows_inserted == null) {
        notify(result.message, { type: "info" });
        return;
      }
      const requestedBatchSize = isRangeImport
        ? derivedEndRow! - parsedStartRow! + 1
        : (parsedBatchSize ?? record.batch_size_default);
      const actualBatchSize =
        result.actual_batch_size ?? result.rows_scanned ?? 0;
      const writebackStatus =
        result.sheet_writeback_status &&
        result.sheet_writeback_status !== "not_attempted"
          ? ` Sheets: ${result.sheet_writeback_status}`
          : "";
      const rowStatsMessage =
        formatRowStats(result.row_stats) ?? result.last_run_message ?? "";
      notify(
        `Import klar${isRangeImport ? ` för rad ${parsedStartRow}-${derivedEndRow}` : ""}: begärde ${requestedBatchSize}, körde ${actualBatchSize}, ${result.rows_inserted ?? 0} nya, ${result.rows_skipped_duplicates ?? 0} dubbletter.${writebackStatus}${rowStatsMessage ? ` ${rowStatsMessage}` : ""}`,
        { type: "success" },
      );
      refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Import misslyckades", {
        type: "error",
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div
      className="flex flex-col gap-2"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex flex-wrap gap-1">
        {QUICK_BATCH_SIZES.map((size) => (
          <Button
            key={size}
            type="button"
            size="sm"
            variant={batchSize === String(size) ? "default" : "outline"}
            onClick={() => setBatchSize(String(size))}
            disabled={isRunning || record.last_run_status === "running"}
          >
            {size}
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={1}
          max={MAX_BATCH_SIZE}
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
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={2}
          placeholder="Från rad"
          value={startRow}
          onChange={(event) => setStartRow(event.target.value)}
          className="h-8 w-24"
        />
        <Input
          type="number"
          min={2}
          placeholder="Till rad"
          value={endRow}
          onChange={(event) => setEndRow(event.target.value)}
          className="h-8 w-24"
        />
      </div>
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
