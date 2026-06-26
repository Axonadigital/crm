import { CreateButton } from "@/components/admin/create-button";
import { DataTable } from "@/components/admin/data-table";
import { List } from "@/components/admin/list";
import { SearchInput } from "@/components/admin/search-input";
import { Badge } from "@/components/ui/badge";

import { TopToolbar } from "../layout/TopToolbar";
import {
  sequenceStatusColors as statusColors,
  sequenceStatusLabels as statusLabels,
  sequenceTriggerLabels as triggerLabels,
} from "./sequenceConstants";

const SequenceListActions = () => (
  <TopToolbar>
    <CreateButton label="Ny sekvens" />
  </TopToolbar>
);

const filters = [<SearchInput source="q" alwaysOn key="q" />];

export const SequenceList = () => {
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
