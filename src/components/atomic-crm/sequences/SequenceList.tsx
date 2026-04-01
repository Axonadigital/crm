import { useTranslate } from "ra-core";
import { CreateButton } from "@/components/admin/create-button";
import { DataTable } from "@/components/admin/data-table";
import { List } from "@/components/admin/list";
import { SearchInput } from "@/components/admin/search-input";
import { Badge } from "@/components/ui/badge";

import { TopToolbar } from "../layout/TopToolbar";

const SequenceListActions = () => (
  <TopToolbar>
    <CreateButton label="Ny sekvens" />
  </TopToolbar>
);

const filters = [<SearchInput source="q" alwaysOn key="q" />];

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  paused:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
};

const statusLabels: Record<string, string> = {
  draft: "Utkast",
  active: "Aktiv",
  paused: "Pausad",
};

const triggerLabels: Record<string, string> = {
  manual: "Manuell",
  new_lead: "Ny lead",
  segment_change: "Segmentändring",
};

export const SequenceList = () => {
  const translate = useTranslate();
  return (
    <List
      actions={<SequenceListActions />}
      filters={filters}
      sort={{ field: "updated_at", order: "DESC" }}
      title="Sekvenser"
    >
      <DataTable
        columns={[
          {
            source: "name",
            label: "Namn",
            sortable: true,
          },
          {
            source: "status",
            label: "Status",
            sortable: true,
            render: (record) => (
              <Badge className={statusColors[record.status as string] || ""}>
                {statusLabels[record.status as string] || record.status}
              </Badge>
            ),
          },
          {
            source: "trigger_type",
            label: "Trigger",
            sortable: true,
            render: (record) =>
              triggerLabels[record.trigger_type as string] ||
              record.trigger_type,
          },
          {
            source: "updated_at",
            label: "Uppdaterad",
            sortable: true,
            render: (record) =>
              record.updated_at
                ? new Date(record.updated_at as string).toLocaleDateString(
                    "sv-SE",
                  )
                : "",
          },
        ]}
        rowClick="edit"
      />
    </List>
  );
};
