import { useGetIdentity, useTranslate } from "ra-core";
import { Clock, FileSignature, TrendingUp, Users } from "lucide-react";
import { addDays, endOfDay, startOfDay } from "date-fns";

import { ToggleFilterButton } from "@/components/admin/toggle-filter-button";
import { useIsMobile } from "@/hooks/use-mobile";

import { FilterCategory } from "../filters/FilterCategory";
import { ResponsiveFilters } from "../misc/ResponsiveFilters";
import { quoteStatusList } from "./quoteStatuses";

/**
 * Shared quote list filter used in the mobile layout.
 *
 * Renders a search input plus filter categories for status, validity window,
 * and "only my quotes". On desktop, ResponsiveFilters shows this as a
 * sidebar; on mobile, it shows as a bottom sheet triggered by a filter
 * icon button.
 */
export const QuoteListFilter = () => {
  const translate = useTranslate();
  const { identity } = useGetIdentity();
  const isMobile = useIsMobile();
  const toggleClassName = "w-auto md:w-full justify-between h-10 md:h-8";
  const toggleSize = isMobile ? ("lg" as const) : undefined;

  const now = new Date();
  const in7Days = endOfDay(addDays(now, 7)).toISOString();
  const todayStart = startOfDay(now).toISOString();

  return (
    <ResponsiveFilters>
      <FilterCategory
        icon={<FileSignature className="h-4 w-4" />}
        label="resources.quotes.fields.status"
      >
        {quoteStatusList.map((status) => (
          <ToggleFilterButton
            key={status}
            className={toggleClassName}
            label={translate(`resources.quotes.statuses.${status}`, {
              _: status,
            })}
            value={{ status }}
            size={toggleSize}
          />
        ))}
      </FilterCategory>

      <FilterCategory
        icon={<Clock className="h-4 w-4" />}
        label="resources.quotes.fields.valid_until"
      >
        <ToggleFilterButton
          className={toggleClassName}
          label={translate("resources.quotes.filters.expiring_soon", {
            _: "Går ut inom 7 dagar",
          })}
          value={{
            "valid_until@gte": todayStart,
            "valid_until@lte": in7Days,
          }}
          size={toggleSize}
        />
        <ToggleFilterButton
          className={toggleClassName}
          label={translate("resources.quotes.filters.expired", {
            _: "Har gått ut",
          })}
          value={{
            "valid_until@lt": todayStart,
          }}
          size={toggleSize}
        />
      </FilterCategory>

      <FilterCategory
        icon={<TrendingUp className="h-4 w-4" />}
        label="resources.quotes.filters.activity"
      >
        <ToggleFilterButton
          className={toggleClassName}
          label={translate("resources.quotes.filters.signed", {
            _: "Signerade",
          })}
          value={{ status: "signed" }}
          size={toggleSize}
        />
        <ToggleFilterButton
          className={toggleClassName}
          label={translate("resources.quotes.filters.awaiting_signature", {
            _: "Väntar på signatur",
          })}
          value={{ status: "sent" }}
          size={toggleSize}
        />
      </FilterCategory>

      <FilterCategory
        icon={<Users className="h-4 w-4" />}
        label="resources.quotes.fields.sales_id"
      >
        <ToggleFilterButton
          className={toggleClassName}
          label={translate("crm.common.me", { _: "Mina" })}
          value={{ sales_id: identity?.id }}
          size={toggleSize}
        />
      </FilterCategory>
    </ResponsiveFilters>
  );
};
