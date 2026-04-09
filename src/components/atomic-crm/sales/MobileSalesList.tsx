import {
  InfiniteListBase,
  RecordContextProvider,
  useGetIdentity,
  useListContext,
  useRefresh,
  useTranslate,
} from "ra-core";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

import MobileHeader from "../layout/MobileHeader";
import { MobileContent } from "../layout/MobileContent";
import { InfinitePagination } from "../misc/InfinitePagination";
import type { Sale } from "../types";

/**
 * Mobile list of sales users (the CRM's team members).
 *
 * Read-only: creation, editing and user administration live on desktop.
 * Provides visibility into who's on the team, their role and whether
 * their account is disabled.
 */
export const MobileSalesList = () => {
  const { identity } = useGetIdentity();
  if (!identity) return null;

  return (
    <InfiniteListBase
      perPage={25}
      sort={{ field: "first_name", order: "ASC" }}
      queryOptions={{
        onError: () => {
          /* Disable error notification as layout handles it */
        },
      }}
    >
      <SalesListLayoutMobile />
    </InfiniteListBase>
  );
};

const SalesListLayoutMobile = () => {
  const { isPending, data, error } = useListContext<Sale>();
  const translate = useTranslate();
  const refresh = useRefresh();

  return (
    <>
      <MobileHeader>
        <h1 className="text-xl font-semibold">
          {translate("resources.sales.name", {
            smart_count: 2,
            _: "Säljare",
          })}
        </h1>
      </MobileHeader>
      <MobileContent onRefresh={refresh}>
        {data?.length ? (
          <div className="flex flex-col gap-1">
            {data.map((sale) => (
              <RecordContextProvider key={sale.id} value={sale}>
                <SalesListItem sale={sale} />
              </RecordContextProvider>
            ))}
          </div>
        ) : !isPending ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {translate("ra.navigation.no_results", {
              _: "Inga säljare hittades",
            })}
          </p>
        ) : null}
        {!error && (
          <div className="flex justify-center">
            <InfinitePagination />
          </div>
        )}
      </MobileContent>
    </>
  );
};

const SalesListItem = ({ sale }: { sale: Sale }) => {
  const translate = useTranslate();
  const initials = `${sale.first_name?.[0] ?? ""}${sale.last_name?.[0] ?? ""}`;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg">
      <Avatar className="size-10">
        <AvatarImage src={sale.avatar?.src} alt={sale.first_name} />
        <AvatarFallback>{initials || "?"}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">
          {sale.first_name} {sale.last_name}
        </div>
        {sale.email && (
          <div className="text-xs text-muted-foreground truncate">
            {sale.email}
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1">
        {sale.administrator && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {translate("resources.sales.fields.administrator", {
              _: "Admin",
            })}
          </Badge>
        )}
        {sale.disabled && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {translate("resources.sales.fields.disabled", {
              _: "Inaktiverad",
            })}
          </Badge>
        )}
      </div>
    </div>
  );
};
