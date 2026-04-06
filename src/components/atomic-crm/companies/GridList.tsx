import { useState } from "react";
import {
  RecordContextProvider,
  useDataProvider,
  useListContext,
  useNotify,
  useRefresh,
  useTranslate,
} from "ra-core";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Confirm } from "@/components/admin/confirm";
import { SelectAllButton } from "@/components/admin/select-all-button";

import type { Company } from "../types";
import { CompanyCard } from "./CompanyCard";

const times = (nbChildren: number, fn: (key: number) => any) =>
  Array.from({ length: nbChildren }, (_, key) => fn(key));

const LoadingGridList = () => (
  <div
    className="w-full gap-2 grid"
    style={{
      gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    }}
  >
    {times(15, (key) => (
      <div className="h-[200px] flex flex-col bg-gray-200 rounded" key={key} />
    ))}
  </div>
);

const LoadedGridList = () => {
  const { data, error, isPending, selectedIds, onSelect } =
    useListContext<Company>();
  const translate = useTranslate();

  if (isPending || error) return null;

  const selectedCompanyIds = selectedIds ?? [];

  const handleToggleSelection = (companyId: Company["id"]) => {
    const nextSelection = selectedCompanyIds.includes(companyId)
      ? selectedCompanyIds.filter((id) => id !== companyId)
      : [...selectedCompanyIds, companyId];
    onSelect?.(nextSelection);
  };

  return (
    <div
      className="w-full gap-2 grid"
      style={{
        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
      }}
    >
      {data.map((record) => (
        <RecordContextProvider key={record.id} value={record}>
          <CompanyCard
            isSelected={selectedCompanyIds.includes(record.id)}
            onToggleSelection={handleToggleSelection}
          />
        </RecordContextProvider>
      ))}

      {data.length === 0 && (
        <div className="p-2">
          {translate("resources.companies.empty.title", {
            _: "No companies found",
          })}
        </div>
      )}
    </div>
  );
};

export const ImageList = () => {
  const { isPending } = useListContext();
  return (
    <>
      {isPending ? <LoadingGridList /> : <LoadedGridList />}
      <CompanyBulkActionsToolbar />
    </>
  );
};

const CompanyBulkActionsToolbar = () => {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const { selectedIds, onUnselectItems, refetch } = useListContext<Company>();
  const dataProvider = useDataProvider();
  const notify = useNotify();
  const refresh = useRefresh();

  if (!selectedIds?.length) {
    return null;
  }

  const handleDelete = async () => {
    try {
      await dataProvider.deleteMany("companies", { ids: selectedIds });
      setIsConfirmOpen(false);
      onUnselectItems?.();
      await refetch?.();
      refresh();
      notify(`${selectedIds.length} företag borttagna`, {
        type: "success",
      });
    } catch (error) {
      setIsConfirmOpen(false);
      notify(
        error instanceof Error
          ? `Kunde inte ta bort företag: ${error.message}`
          : "Kunde inte ta bort företag",
        { type: "error" },
      );
    }
  };

  return (
    <>
      <Card className="flex flex-col gap-2 md:gap-6 md:flex-row items-stretch sm:items-center p-2 px-4 w-[90%] sm:w-fit mx-auto fixed bottom-2 left-0 right-0 z-10 bg-zinc-100 dark:bg-zinc-900">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            className="has-[>svg]:px-0"
            onClick={(event) => {
              event.stopPropagation();
              onUnselectItems?.();
            }}
          >
            <X />
          </Button>
          <span className="text-sm text-muted-foreground">
            {selectedIds.length} företag valda
          </span>
        </div>
        <SelectAllButton />
        <Button
          type="button"
          variant="destructive"
          onClick={() => setIsConfirmOpen(true)}
        >
          Ta bort valda
        </Button>
      </Card>
      <Confirm
        isOpen={isConfirmOpen}
        title="Ta bort valda företag?"
        content={`Det här tar bort ${selectedIds.length} företag och kan inte ångras.`}
        confirm="Ta bort"
        cancel="Avbryt"
        confirmColor="warning"
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleDelete}
      />
    </>
  );
};
