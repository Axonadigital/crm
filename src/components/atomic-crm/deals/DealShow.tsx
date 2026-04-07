import { useMutation } from "@tanstack/react-query";
import { isValid } from "date-fns";
import { Archive, ArchiveRestore, Pencil } from "lucide-react";
import { useState } from "react";
import {
  ShowBase,
  useDataProvider,
  useNotify,
  useRecordContext,
  useRedirect,
  useRefresh,
  useTranslate,
  useUpdate,
} from "ra-core";
import { Link } from "react-router";
import { DeleteWithConfirmButton } from "@/components/admin/delete-with-confirm-button";
import { EditButton } from "@/components/admin/edit-button";
import { ReferenceArrayField } from "@/components/admin/reference-array-field";
import { ReferenceField } from "@/components/admin/reference-field";
import { ReferenceManyField } from "@/components/admin/reference-many-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useIsMobile } from "@/hooks/use-mobile";

import { CompanyAvatar } from "../companies/CompanyAvatar";
import MobileHeader from "../layout/MobileHeader";
import { MobileContent } from "../layout/MobileContent";
import { MobileBackButton } from "../misc/MobileBackButton";
import { NoteCreate } from "../notes/NoteCreate";
import { NotesIterator } from "../notes/NotesIterator";
import { NoteCreateSheet } from "../notes/NoteCreateSheet";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Deal } from "../types";
import { ContactList } from "./ContactList";
import { DealEditSheet } from "./DealEditSheet";
import { findDealLabel, formatISODateString } from "./dealUtils";

export const DealShow = ({ open, id }: { open: boolean; id?: string }) => {
  const isMobile = useIsMobile();
  const redirect = useRedirect();
  const handleClose = () => {
    redirect("list", "deals");
  };

  if (isMobile) {
    return id ? (
      <ShowBase id={id}>
        <DealShowContentMobile />
      </ShowBase>
    ) : null;
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="lg:max-w-4xl p-4 overflow-y-auto max-h-9/10 top-1/20 translate-y-0">
        {id ? (
          <ShowBase id={id}>
            <DealShowContent />
          </ShowBase>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};

const DealShowContent = () => {
  const translate = useTranslate();
  const { dealStages, dealCategories, currency } = useConfigurationContext();
  const record = useRecordContext<Deal>();
  if (!record) return null;

  return (
    <>
      <div className="space-y-2">
        {record.archived_at ? <ArchivedTitle /> : null}
        <div className="flex-1">
          <div className="flex justify-between items-start mb-8">
            <div className="flex items-center gap-4">
              <ReferenceField
                source="company_id"
                reference="companies"
                link="show"
              >
                <CompanyAvatar />
              </ReferenceField>
              <h2 className="text-2xl font-semibold">{record.name}</h2>
            </div>
            <div className={`flex gap-2 ${record.archived_at ? "" : "pr-12"}`}>
              {record.archived_at ? (
                <>
                  <UnarchiveButton record={record} />
                  <DeleteWithConfirmButton />
                </>
              ) : (
                <>
                  <ArchiveButton record={record} />
                  <EditButton />
                </>
              )}
            </div>
          </div>

          <div className="flex gap-8 m-4">
            <div className="flex flex-col mr-10">
              <span className="text-xs text-muted-foreground tracking-wide">
                {translate("resources.deals.fields.expected_closing_date")}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm">
                  {isValid(new Date(record.expected_closing_date))
                    ? formatISODateString(record.expected_closing_date)
                    : translate("resources.deals.invalid_date")}
                </span>
                {new Date(record.expected_closing_date) < new Date() ? (
                  <Badge variant="destructive">
                    {translate("crm.common.past")}
                  </Badge>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col mr-10">
              <span className="text-xs text-muted-foreground tracking-wide">
                {translate("resources.deals.fields.amount")}
              </span>
              <span className="text-sm">
                {record.amount.toLocaleString("en-US", {
                  notation: "compact",
                  style: "currency",
                  currency,
                  currencyDisplay: "narrowSymbol",
                  minimumSignificantDigits: 3,
                })}
              </span>
            </div>

            {record.category && (
              <div className="flex flex-col mr-10">
                <span className="text-xs text-muted-foreground tracking-wide">
                  {translate("resources.deals.fields.category")}
                </span>
                <span className="text-sm">
                  {dealCategories.find((c) => c.value === record.category)
                    ?.label ?? record.category}
                </span>
              </div>
            )}

            <div className="flex flex-col mr-10">
              <span className="text-xs text-muted-foreground tracking-wide">
                {translate("resources.deals.fields.stage")}
              </span>
              <span className="text-sm">
                {findDealLabel(dealStages, record.stage)}
              </span>
            </div>
          </div>

          {!!record.contact_ids?.length && (
            <div className="m-4">
              <div className="flex flex-col min-h-12 mr-10">
                <span className="text-xs text-muted-foreground tracking-wide">
                  {translate("resources.deals.fields.contact_ids")}
                </span>
                <ReferenceArrayField
                  source="contact_ids"
                  reference="contacts_summary"
                >
                  <ContactList />
                </ReferenceArrayField>
              </div>
            </div>
          )}

          {record.description && (
            <div className="m-4 whitespace-pre-line">
              <span className="text-xs text-muted-foreground tracking-wide">
                {translate("resources.deals.fields.description")}
              </span>
              <p className="text-sm leading-6">{record.description}</p>
            </div>
          )}

          <div className="m-4">
            <Separator className="mb-4" />
            <ReferenceManyField
              target="deal_id"
              reference="deal_notes"
              sort={{ field: "date", order: "DESC" }}
              empty={<NoteCreate reference={"deals"} />}
            >
              <NotesIterator reference="deals" />
            </ReferenceManyField>
          </div>
        </div>
      </div>
    </>
  );
};

const DealShowContentMobile = () => {
  const translate = useTranslate();
  const { dealStages, dealCategories, currency } = useConfigurationContext();
  const record = useRecordContext<Deal>();
  const [noteCreateOpen, setNoteCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  if (!record) return null;

  return (
    <>
      <NoteCreateSheet open={noteCreateOpen} onOpenChange={setNoteCreateOpen} />
      <DealEditSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        dealId={record.id}
      />
      <MobileHeader>
        <MobileBackButton />
        <div className="flex flex-1 min-w-0">
          <Link to="/deals" className="flex-1 min-w-0">
            <h1 className="truncate text-xl font-semibold">{record.name}</h1>
          </Link>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-full"
          onClick={() => setEditOpen(true)}
        >
          <Pencil className="size-5" />
          <span className="sr-only">{translate("ra.action.edit")}</span>
        </Button>
      </MobileHeader>
      <MobileContent>
        {record.archived_at ? <ArchivedTitle /> : null}

        <div className="flex items-center gap-3 mb-4">
          <ReferenceField source="company_id" reference="companies" link="show">
            <CompanyAvatar width={40} height={40} />
          </ReferenceField>
          <h2 className="text-2xl font-bold flex-1 min-w-0 truncate">
            {record.name}
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">
              {translate("resources.deals.fields.expected_closing_date")}
            </span>
            <div className="flex items-center gap-1">
              <span className="text-sm">
                {isValid(new Date(record.expected_closing_date))
                  ? formatISODateString(record.expected_closing_date)
                  : translate("resources.deals.invalid_date")}
              </span>
              {new Date(record.expected_closing_date) < new Date() ? (
                <Badge variant="destructive" className="text-[10px] px-1 py-0">
                  {translate("crm.common.past")}
                </Badge>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">
              {translate("resources.deals.fields.amount")}
            </span>
            <span className="text-sm">
              {record.amount.toLocaleString("en-US", {
                notation: "compact",
                style: "currency",
                currency,
                currencyDisplay: "narrowSymbol",
                minimumSignificantDigits: 3,
              })}
            </span>
          </div>

          {record.category && (
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">
                {translate("resources.deals.fields.category")}
              </span>
              <span className="text-sm">
                {dealCategories.find((c) => c.value === record.category)
                  ?.label ?? record.category}
              </span>
            </div>
          )}

          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">
              {translate("resources.deals.fields.stage")}
            </span>
            <span className="text-sm">
              {findDealLabel(dealStages, record.stage)}
            </span>
          </div>
        </div>

        {!!record.contact_ids?.length && (
          <div className="mb-4">
            <span className="text-xs text-muted-foreground">
              {translate("resources.deals.fields.contact_ids")}
            </span>
            <ReferenceArrayField
              source="contact_ids"
              reference="contacts_summary"
            >
              <ContactList />
            </ReferenceArrayField>
          </div>
        )}

        {record.description && (
          <div className="mb-4 whitespace-pre-line">
            <span className="text-xs text-muted-foreground">
              {translate("resources.deals.fields.description")}
            </span>
            <p className="text-sm leading-6">{record.description}</p>
          </div>
        )}

        <Separator className="mb-4" />
        <ReferenceManyField
          target="deal_id"
          reference="deal_notes"
          sort={{ field: "date", order: "DESC" }}
          empty={
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-muted-foreground mb-4">
                {translate("resources.notes.empty")}
              </p>
              <Button variant="outline" onClick={() => setNoteCreateOpen(true)}>
                {translate("resources.notes.action.add")}
              </Button>
            </div>
          }
        >
          <NotesIterator reference="deals" />
        </ReferenceManyField>

        {record.archived_at ? null : (
          <div className="flex gap-2 mt-4">
            <ArchiveButton record={record} />
          </div>
        )}
        {record.archived_at ? (
          <div className="flex gap-2 mt-4">
            <UnarchiveButton record={record} />
          </div>
        ) : null}
      </MobileContent>
    </>
  );
};

const ArchivedTitle = () => {
  const translate = useTranslate();
  return (
    <div className="bg-orange-500 px-6 py-4">
      <h3 className="text-lg font-bold text-white">
        {translate("resources.deals.archived.title")}
      </h3>
    </div>
  );
};

const ArchiveButton = ({ record }: { record: Deal }) => {
  const translate = useTranslate();
  const [update] = useUpdate();
  const redirect = useRedirect();
  const notify = useNotify();
  const refresh = useRefresh();
  const handleClick = () => {
    update(
      "deals",
      {
        id: record.id,
        data: { archived_at: new Date().toISOString() },
        previousData: record,
      },
      {
        onSuccess: () => {
          redirect("list", "deals");
          notify("resources.deals.archived.success", {
            type: "info",
            undoable: false,
          });
          refresh();
        },
        onError: () => {
          notify("resources.deals.archived.error", {
            type: "error",
          });
        },
      },
    );
  };

  return (
    <Button
      onClick={handleClick}
      size="sm"
      variant="outline"
      className="flex items-center gap-2 h-9"
    >
      <Archive className="w-4 h-4" />
      {translate("resources.deals.archived.action")}
    </Button>
  );
};

const UnarchiveButton = ({ record }: { record: Deal }) => {
  const translate = useTranslate();
  const dataProvider = useDataProvider();
  const redirect = useRedirect();
  const notify = useNotify();
  const refresh = useRefresh();

  const { mutate } = useMutation({
    mutationFn: () => dataProvider.unarchiveDeal(record),
    onSuccess: () => {
      redirect("list", "deals");
      notify("resources.deals.unarchived.success", {
        type: "info",
        undoable: false,
      });
      refresh();
    },
    onError: () => {
      notify("resources.deals.unarchived.error", {
        type: "error",
      });
    },
  });

  const handleClick = () => {
    mutate();
  };

  return (
    <Button
      onClick={handleClick}
      size="sm"
      variant="outline"
      className="flex items-center gap-2 h-9"
    >
      <ArchiveRestore className="w-4 h-4" />
      {translate("resources.deals.unarchived.action")}
    </Button>
  );
};
