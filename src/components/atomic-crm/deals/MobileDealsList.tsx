import {
  InfiniteListBase,
  RecordContextProvider,
  useGetIdentity,
  useListContext,
  useTranslate,
  useLocaleState,
} from "ra-core";
import { ReferenceField } from "@/components/admin/reference-field";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router";

import MobileHeader from "../layout/MobileHeader";
import { MobileContent } from "../layout/MobileContent";
import { InfinitePagination } from "../misc/InfinitePagination";
import { CompanyAvatar } from "../companies/CompanyAvatar";
import { useConfigurationContext } from "../root/ConfigurationContext";
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

  const hasFilters = filterValues && Object.keys(filterValues).length > 0;

  if (!isPending && !data?.length && !hasFilters) return <DealEmpty />;

  return (
    <div>
      <MobileHeader>
        <h1 className="text-xl font-semibold">
          {translate("resources.deals.name", { smart_count: 2 })}
        </h1>
      </MobileHeader>
      <MobileContent>
        <div className="flex flex-col gap-2">
          {data?.map((deal) => (
            <RecordContextProvider key={deal.id} value={deal}>
              <DealListItem deal={deal} />
            </RecordContextProvider>
          ))}
        </div>
        {!error && (
          <div className="flex justify-center">
            <InfinitePagination />
          </div>
        )}
      </MobileContent>
    </div>
  );
};

const DealListItem = ({ deal }: { deal: Deal }) => {
  const translate = useTranslate();
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
