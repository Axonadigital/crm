import {
  useGetList,
  useLocaleState,
  useRecordContext,
  useTranslate,
} from "ra-core";
import { Link } from "react-router-dom";
import { EditButton } from "@/components/admin/edit-button";
import { DeleteButton } from "@/components/admin";
import { ReferenceManyField } from "@/components/admin/reference-many-field";
import { ShowButton } from "@/components/admin/show-button";

import { AddTask } from "../tasks/AddTask";
import { TasksIterator } from "../tasks/TasksIterator";
import { TagsListEdit } from "./TagsListEdit";
import { ContactPersonalInfo } from "./ContactPersonalInfo";
import { ContactBackgroundInfo } from "./ContactBackgroundInfo";
import { AsideSection } from "../misc/AsideSection";
import { formatRelativeDate } from "../misc/RelativeDate";
import { findDealLabel } from "../deals/dealUtils";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Contact, Deal } from "../types";
import { ContactMergeButton } from "./ContactMergeButton";
import { ExportVCardButton } from "./ExportVCardButton";
import { ContactCalendarEvents } from "./ContactCalendarEvents";
import { SendEmailDialog } from "../templates/SendEmailDialog";
import { EnrollSequenceDialog } from "../sequences/EnrollSequenceDialog";
import { AnalyzeMeetingDialog } from "../meetings/AnalyzeMeetingDialog";
import { FetchFirefliesDialog } from "../meetings/FetchFirefliesDialog";
import { ContactTranscriptions } from "../meetings/ContactTranscriptions";

export const ContactAside = ({ link = "edit" }: { link?: "edit" | "show" }) => {
  const record = useRecordContext<Contact>();
  const translate = useTranslate();

  if (!record) return null;
  return (
    <div className="hidden sm:block w-92 min-w-92 text-sm">
      <div className="mb-4 -ml-1">
        {link === "edit" ? (
          <EditButton label="resources.contacts.action.edit" />
        ) : (
          <ShowButton label="resources.contacts.action.show" />
        )}
      </div>

      <AsideSection
        title={translate("resources.contacts.field_categories.personal_info")}
      >
        <ContactPersonalInfo />
      </AsideSection>

      <AsideSection
        title={translate("resources.contacts.field_categories.background_info")}
      >
        <ContactBackgroundInfo />
      </AsideSection>

      <AsideSection
        title={translate("resources.tags.name", { smart_count: 2 })}
      >
        <TagsListEdit />
      </AsideSection>

      <AsideSection
        title={translate("resources.tasks.name", { smart_count: 2 })}
      >
        <ReferenceManyField
          target="contact_id"
          reference="tasks"
          sort={{ field: "due_date", order: "ASC" }}
          perPage={1000}
        >
          <TasksIterator />
        </ReferenceManyField>
        <AddTask />
      </AsideSection>

      <AsideSection
        title={translate("resources.calendar_events.name", { smart_count: 2 })}
      >
        <ContactCalendarEvents />
      </AsideSection>

      <AsideSection title="Mötesanalyser">
        <ContactTranscriptions />
      </AsideSection>

      <ContactDeals contactId={record.id} />

      {link !== "edit" && (
        <>
          <div className="mt-6 pt-6 border-t hidden sm:flex flex-col gap-2 items-start">
            <SendEmailDialog />
            <EnrollSequenceDialog />
            <FetchFirefliesDialog />
            <AnalyzeMeetingDialog />
            <ExportVCardButton />
            <ContactMergeButton />
          </div>
          <div className="mt-6 pt-6 border-t hidden sm:flex flex-col gap-2 items-start">
            <DeleteButton
              className="h-6 cursor-pointer hover:bg-destructive/10! text-destructive! border-destructive! focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40"
              size="sm"
            />
          </div>
        </>
      )}
    </div>
  );
};

const ContactDeals = ({ contactId }: { contactId: number | string }) => {
  const translate = useTranslate();
  const [locale = "en"] = useLocaleState();
  const { dealStages, currency } = useConfigurationContext();
  const { data: deals, isPending } = useGetList<Deal>("deals", {
    pagination: { page: 1, perPage: 10 },
    sort: { field: "updated_at", order: "DESC" },
    filter: { "contact_ids@cs": `{${contactId}}` },
  });

  if (isPending || !deals?.length) return null;

  return (
    <AsideSection
      title={translate("resources.deals.name", { smart_count: deals.length })}
    >
      <div className="flex flex-col gap-1">
        {deals.map((deal) => (
          <Link
            key={deal.id}
            to={`/deals/${deal.id}/show`}
            className="flex items-center justify-between hover:bg-muted py-1 px-1 rounded transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{deal.name}</div>
              <div className="text-xs text-muted-foreground">
                {findDealLabel(dealStages, deal.stage)} &middot;{" "}
                {deal.amount.toLocaleString(locale, {
                  notation: "compact",
                  style: "currency",
                  currency,
                  currencyDisplay: "narrowSymbol",
                  minimumSignificantDigits: 3,
                })}
              </div>
            </div>
            <div className="text-xs text-muted-foreground ml-2">
              {formatRelativeDate(deal.updated_at, locale)}
            </div>
          </Link>
        ))}
      </div>
    </AsideSection>
  );
};
