import {
  InfiniteListBase,
  RecordContextProvider,
  useGetIdentity,
  useListContext,
  useRefresh,
  useTranslate,
  useLocaleState,
} from "ra-core";
import { useEffect, useState } from "react";
import { Filter, Search, X } from "lucide-react";
import { ReferenceField } from "@/components/admin/reference-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Link } from "react-router";

import MobileHeader from "../layout/MobileHeader";
import { MobileContent } from "../layout/MobileContent";
import { InfinitePagination } from "../misc/InfinitePagination";
import { CompanyAvatar } from "../companies/CompanyAvatar";
import { useConfigurationContext } from "../root/ConfigurationContext";
import { DealArchivedList } from "./DealArchivedList";
import { DealEmpty } from "./DealEmpty";
import { findDealLabel } from "./dealUtils";
import { formatRelativeDate } from "../misc/RelativeDate";
import type { Deal } from "../types";

export const MobileDealsList = () => {
  const { identity } = useGetIdentity();
  if (!identity) return null;

  return (
    <InfiniteListBase
      perPage={25}
      filter={{ "archived_at@is": null }}
      sort={{ field: "index", order: "DESC" }}
      queryOptions={{
        onError: () => {
          /* Disable error notification as layout handles it */
        },
      }}
    >
      <DealsListLayoutMobile />
    </InfiniteListBase>
  );
};

const DealsListLayoutMobile = () => {
  const { isPending, data, error, filterValues } = useListContext<Deal>();
  const translate = useTranslate();
  const refresh = useRefresh();

  const hasFilters = filterValues && Object.keys(filterValues).length > 0;

  if (!isPending && !data?.length && !hasFilters) {
    return (
      <>
        <MobileHeader>
          <h1 className="text-xl font-semibold">
            {translate("resources.deals.name", { smart_count: 2 })}
          </h1>
        </MobileHeader>
        <MobileContent onRefresh={refresh}>
          <DealEmpty />
          <DealArchivedList />
        </MobileContent>
      </>
    );
  }

  return (
    <>
      <MobileHeader>
        <h1 className="text-xl font-semibold">
          {translate("resources.deals.name", { smart_count: 2 })}
        </h1>
        <FilterSheetButton />
      </MobileHeader>
      <MobileContent onRefresh={refresh}>
        <div className="flex flex-col gap-3">
          <SearchBar />
          <StagePicker />
          {data?.length ? (
            <div className="flex flex-col gap-2">
              {data.map((deal) => (
                <RecordContextProvider key={deal.id} value={deal}>
                  <DealListItem deal={deal} />
                </RecordContextProvider>
              ))}
            </div>
          ) : !isPending ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {translate("ra.navigation.no_results", {
                _: "Inga deals matchar dina filter",
              })}
            </p>
          ) : null}
        </div>
        {!error && (
          <div className="flex justify-center">
            <InfinitePagination />
          </div>
        )}
        <DealArchivedList />
      </MobileContent>
    </>
  );
};

const SearchBar = () => {
  const translate = useTranslate();
  const { filterValues, setFilters, displayedFilters } = useListContext();
  const currentQ = (filterValues.q as string) ?? "";
  const [value, setValue] = useState(currentQ);

  // Sync local state when filterValues.q changes externally (e.g. clear filters)
  useEffect(() => {
    setValue((filterValues.q as string) ?? "");
  }, [filterValues.q]);

  // Debounce the filter update to avoid firing a request per keystroke
  useEffect(() => {
    if (value === ((filterValues.q as string | undefined) ?? "")) return;
    const timer = setTimeout(() => {
      const next = { ...filterValues };
      if (value) {
        next.q = value;
      } else {
        delete next.q;
      }
      setFilters(next, displayedFilters);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
      <Input
        type="search"
        inputMode="search"
        placeholder={translate("ra.action.search", { _: "Sök" })}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="pl-9 pr-9 h-11"
        aria-label={translate("ra.action.search", { _: "Sök" })}
      />
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setValue("")}
          className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full text-muted-foreground"
          aria-label={translate("ra.action.clear_search", {
            _: "Rensa sök",
          })}
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
};

const StagePicker = () => {
  const translate = useTranslate();
  const { dealStages } = useConfigurationContext();
  const { filterValues, setFilters, displayedFilters } = useListContext();

  const currentStage = (filterValues.stage as string) ?? "all";

  const handleChange = (value: string) => {
    // ToggleGroup single-select can emit "" when deselecting; treat that as "all"
    const next = { ...filterValues };
    if (!value || value === "all") {
      delete next.stage;
    } else {
      next.stage = value;
    }
    setFilters(next, displayedFilters);
  };

  return (
    <div className="overflow-x-auto overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none]">
      <ToggleGroup
        type="single"
        value={currentStage}
        onValueChange={handleChange}
        variant="outline"
        className="w-max min-w-full pr-1"
      >
        <ToggleGroupItem
          value="all"
          className="h-10 whitespace-nowrap px-4 text-sm"
        >
          {translate("resources.deals.filters.all_stages", { _: "Alla" })}
        </ToggleGroupItem>
        {dealStages.map((stage) => (
          <ToggleGroupItem
            key={stage.value}
            value={stage.value}
            className="h-10 whitespace-nowrap px-4 text-sm"
          >
            {stage.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
};

const FilterSheetButton = () => {
  const translate = useTranslate();
  const { identity } = useGetIdentity();
  const { filterValues, setFilters, displayedFilters } = useListContext();
  const { dealCategories } = useConfigurationContext();
  const [open, setOpen] = useState(false);

  const currentCategory = (filterValues.category as string) ?? "";
  const isOnlyMine = typeof filterValues.sales_id !== "undefined";

  // Count active filters beyond the stage picker and search bar (exposed elsewhere)
  const extraFilterCount = (currentCategory ? 1 : 0) + (isOnlyMine ? 1 : 0);

  const handleCategoryChange = (value: string) => {
    const next = { ...filterValues };
    if (!value || value === "__all__") {
      delete next.category;
    } else {
      next.category = value;
    }
    setFilters(next, displayedFilters);
  };

  const handleOnlyMineChange = (checked: boolean) => {
    const next = { ...filterValues };
    if (checked && identity?.id) {
      next.sales_id = identity.id;
    } else {
      delete next.sales_id;
    }
    setFilters(next, displayedFilters);
  };

  const handleReset = () => {
    setFilters({}, []);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative rounded-full shrink-0"
          aria-label={translate("ra.action.filter", { _: "Filter" })}
        >
          <Filter className="size-5" />
          {extraFilterCount > 0 && (
            <span className="absolute top-1 right-1 min-w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center px-1">
              {extraFilterCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="pb-8">
        <SheetHeader>
          <SheetTitle>
            {translate("ra.action.filter", { _: "Filter" })}
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-6 p-4">
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium">
              {translate("resources.deals.fields.category", {
                _: "Kategori",
              })}
            </Label>
            <Select
              value={currentCategory || "__all__"}
              onValueChange={handleCategoryChange}
            >
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">
                  {translate("resources.deals.filters.all_categories", {
                    _: "Alla kategorier",
                  })}
                </SelectItem>
                {dealCategories.map((category) => (
                  <SelectItem key={category.value} value={category.value}>
                    {category.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="deals-only-mine" className="text-sm font-medium">
              {translate("resources.deals.filters.only_mine", {
                _: "Bara mina deals",
              })}
            </Label>
            <Switch
              id="deals-only-mine"
              checked={isOnlyMine}
              onCheckedChange={handleOnlyMineChange}
            />
          </div>
        </div>

        <SheetFooter className="flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            className="flex-1 h-12"
          >
            {translate("ra.action.clear_input_value", {
              _: "Rensa filter",
            })}
          </Button>
          <SheetClose asChild>
            <Button type="button" className="flex-1 h-12">
              {translate("ra.action.confirm", { _: "Klart" })}
            </Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

const DealListItem = ({ deal }: { deal: Deal }) => {
  const [locale = "en"] = useLocaleState();
  const { dealStages, dealCategories, currency } = useConfigurationContext();

  return (
    <Link
      to={`/deals/${deal.id}/show`}
      className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors no-underline"
    >
      <ReferenceField source="company_id" reference="companies" link={false}>
        <CompanyAvatar width={40} height={40} />
      </ReferenceField>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{deal.name}</div>
        <div className="text-xs text-muted-foreground">
          {deal.amount.toLocaleString("en-US", {
            notation: "compact",
            style: "currency",
            currency,
            currencyDisplay: "narrowSymbol",
            minimumSignificantDigits: 3,
          })}
          {deal.category
            ? ` - ${dealCategories.find((c) => c.value === deal.category)?.label ?? deal.category}`
            : ""}
        </div>
        <Badge variant="secondary" className="mt-1 text-[10px] px-1.5 py-0">
          {findDealLabel(dealStages, deal.stage)}
        </Badge>
      </div>
      <div className="text-right text-xs text-muted-foreground">
        {deal.updated_at && (
          <div>{formatRelativeDate(deal.updated_at, locale)}</div>
        )}
      </div>
    </Link>
  );
};
