import {
  useDataProvider,
  useGetIdentity,
  useListContext,
  useRecordContext,
  useTranslate,
} from "ra-core";
import { useEffect, useRef } from "react";
import { matchPath, useLocation } from "react-router";
import { CreateButton } from "@/components/admin/create-button";
import { ExportButton } from "@/components/admin/export-button";
import { List } from "@/components/admin/list";
import { ReferenceInput } from "@/components/admin/reference-input";
import { FilterButton } from "@/components/admin/filter-form";
import { SearchInput } from "@/components/admin/search-input";
import { SelectInput } from "@/components/admin/select-input";
import { SortButton } from "@/components/admin/sort-button";
import { DataTable } from "@/components/admin/data-table";
import { ReferenceField } from "@/components/admin/reference-field";
import { DateField } from "@/components/admin/date-field";
import { Badge } from "@/components/ui/badge";

import { TopToolbar } from "../layout/TopToolbar";
import { CompanyAvatar } from "../companies/CompanyAvatar";
import type { Quote } from "../types";
import { QuoteCreate } from "./QuoteCreate";
import { QuoteEdit } from "./QuoteEdit";
import { QuoteShow } from "./QuoteShow";
import { QuoteEmpty } from "./QuoteEmpty";
import { quoteStatusColors, quoteStatusList } from "./quoteStatuses";

const useExpireOverdueQuotes = () => {
  const dataProvider = useDataProvider();
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;
    // Fire-and-forget: expire overdue quotes on list load
    dataProvider.expireOverdueQuotes?.().catch(() => {
      // Silent fail — non-critical background operation
    });
  }, [dataProvider]);
};

const QuoteList = () => {
  const { identity } = useGetIdentity();
  const translate = useTranslate();
  useExpireOverdueQuotes();

  if (!identity) return null;

  const quoteFilters = [
    <SearchInput source="q" alwaysOn />,
    <ReferenceInput source="company_id" reference="companies">
      <SelectInput
        label={false}
        optionText="name"
        emptyText={translate("resources.quotes.fields.company_id", {
          _: "Company",
        })}
        helperText={false}
      />
    </ReferenceInput>,
    <SelectInput
      source="status"
      label="resources.quotes.fields.status"
      choices={quoteStatusList.map((status) => ({
        id: status,
        name: translate(`resources.quotes.statuses.${status}`, { _: status }),
      }))}
      helperText={false}
    />,
  ];

  return (
    <List
      perPage={25}
      title={false}
      sort={{ field: "created_at", order: "DESC" }}
      filters={quoteFilters}
      actions={<QuoteActions />}
    >
      <QuoteLayout />
    </List>
  );
};

const QuoteLayout = () => {
  const location = useLocation();
  const matchCreate = matchPath("/quotes/create", location.pathname);
  const matchShow = matchPath("/quotes/:id/show", location.pathname);
  const matchEdit = matchPath("/quotes/:id", location.pathname);

  const { data, isPending, filterValues } = useListContext();
  const hasFilters = filterValues && Object.keys(filterValues).length > 0;

  if (isPending) return null;
  if (!data?.length && !hasFilters) return <QuoteEmpty />;

  return (
    <div className="w-full">
      <DataTable rowClick="show">
        <DataTable.Col source="title" />
        <DataTable.Col
          source="company_id"
          label="resources.quotes.fields.company_id"
        >
          <ReferenceField source="company_id" reference="companies" link="show">
            <CompanyField />
          </ReferenceField>
        </DataTable.Col>
        <DataTable.Col
          source="total_amount"
          label="resources.quotes.fields.total_amount"
        >
          <QuoteAmountField />
        </DataTable.Col>
        <DataTable.Col source="status" label="resources.quotes.fields.status">
          <QuoteStatusField />
        </DataTable.Col>
        <DataTable.Col
          source="valid_until"
          label="resources.quotes.fields.valid_until"
        >
          <DateField source="valid_until" />
        </DataTable.Col>
        <DataTable.Col
          source="created_at"
          label="resources.quotes.fields.created_at"
        >
          <DateField source="created_at" />
        </DataTable.Col>
      </DataTable>
      <QuoteCreate open={!!matchCreate} />
      <QuoteEdit open={!!matchEdit && !matchCreate} id={matchEdit?.params.id} />
      <QuoteShow open={!!matchShow} id={matchShow?.params.id} />
    </div>
  );
};

const CompanyField = () => {
  const record = useRecordContext();
  if (!record) return null;
  return (
    <div className="flex items-center gap-2">
      <CompanyAvatar />
      <span className="text-sm">{record.name}</span>
    </div>
  );
};

const QuoteAmountField = () => {
  const record = useRecordContext<Quote>();
  if (!record) return null;
  return (
    <span className="text-sm">
      {Number(record.total_amount).toLocaleString("sv-SE")} {record.currency}
    </span>
  );
};

const QuoteStatusField = () => {
  const translate = useTranslate();
  const record = useRecordContext<Quote>();
  if (!record) return null;
  return (
    <Badge variant={quoteStatusColors[record.status]}>
      {translate(`resources.quotes.statuses.${record.status}`, {
        _: record.status,
      })}
    </Badge>
  );
};

const QuoteActions = () => (
  <TopToolbar>
    <SortButton
      fields={["created_at", "total_amount", "status", "valid_until"]}
    />
    <FilterButton />
    <ExportButton />
    <CreateButton label="resources.quotes.action.new" />
  </TopToolbar>
);

export default QuoteList;
