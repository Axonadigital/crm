import { useTranslate } from "ra-core";
import { CreateButton } from "@/components/admin/create-button";
import { DataTable } from "@/components/admin/data-table";
import { List } from "@/components/admin/list";
import { SearchInput } from "@/components/admin/search-input";
import { Badge } from "@/components/ui/badge";

import { TopToolbar } from "../layout/TopToolbar";
import {
  emailTemplateCategoryColors as categoryColors,
  emailTemplateCategoryLabels as categoryLabels,
} from "./emailTemplateConstants";

const EmailTemplateListActions = () => (
  <TopToolbar>
    <CreateButton label="Ny mall" />
  </TopToolbar>
);

const filters = [<SearchInput source="q" alwaysOn key="q" />];

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
