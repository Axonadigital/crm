import { useTranslate } from "ra-core";
import { CreateButton } from "@/components/admin/create-button";
import { DataTable } from "@/components/admin/data-table";
import { List } from "@/components/admin/list";
import { SearchInput } from "@/components/admin/search-input";
import { Badge } from "@/components/ui/badge";

import { TopToolbar } from "../layout/TopToolbar";

const EmailTemplateListActions = () => (
  <TopToolbar>
    <CreateButton label="Ny mall" />
  </TopToolbar>
);

const filters = [<SearchInput source="q" alwaysOn key="q" />];

const categoryColors: Record<string, string> = {
  outreach: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  followup:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  meeting_request:
    "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  proposal: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  thank_you: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
};

const categoryLabels: Record<string, string> = {
  outreach: "Outreach",
  followup: "Uppföljning",
  meeting_request: "Mötesförfrågan",
  proposal: "Offert",
  thank_you: "Tack",
};

export const EmailTemplateList = () => {
  const translate = useTranslate();
  return (
    <List
      actions={<EmailTemplateListActions />}
      filters={filters}
      sort={{ field: "updated_at", order: "DESC" }}
      title={translate("resources.email_templates.name", {
        _: "E-postmallar",
      })}
    >
      <DataTable
        columns={[
          {
            source: "name",
            label: translate("resources.email_templates.fields.name", {
              _: "Namn",
            }),
            sortable: true,
          },
          {
            source: "subject",
            label: translate("resources.email_templates.fields.subject", {
              _: "Ämnesrad",
            }),
            sortable: true,
          },
          {
            source: "category",
            label: translate("resources.email_templates.fields.category", {
              _: "Kategori",
            }),
            sortable: true,
            render: (record) => (
              <Badge
                className={categoryColors[record.category as string] || ""}
              >
                {categoryLabels[record.category as string] || record.category}
              </Badge>
            ),
          },
          {
            source: "updated_at",
            label: translate("resources.email_templates.fields.updated_at", {
              _: "Uppdaterad",
            }),
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
