import {
  InfiniteListBase,
  RecordContextProvider,
  useGetIdentity,
  useListContext,
  useTranslate,
} from "ra-core";
import { Link } from "react-router";
import { MapPin, Phone } from "lucide-react";

import MobileHeader from "../layout/MobileHeader";
import { MobileContent } from "../layout/MobileContent";
import { InfinitePagination } from "../misc/InfinitePagination";
import { CompanyAvatar } from "./CompanyAvatar";
import { CompanyEmpty } from "./CompanyEmpty";
import type { Company } from "../types";
import { Badge } from "@/components/ui/badge";
import { getLeadStatusBadgeVariant } from "./leadStatusUtils";
export const CompanyListMobile = () => {
  const { identity } = useGetIdentity();
  if (!identity) return null;

  return (
    <InfiniteListBase
      perPage={25}
      sort={{ field: "name", order: "ASC" }}
      queryOptions={{
        onError: () => {
          /* Disable error notification as layout handles it */
        },
      }}
    >
      <CompanyListLayoutMobile />
    </InfiniteListBase>
  );
};

const CompanyListLayoutMobile = () => {
  const { isPending, data, error, filterValues } = useListContext<Company>();
  const translate = useTranslate();

  const hasFilters = filterValues && Object.keys(filterValues).length > 0;

  if (!isPending && !data?.length && !hasFilters) return <CompanyEmpty />;

  return (
    <div>
      <MobileHeader>
        <h1 className="text-xl font-semibold">
          {translate("resources.companies.name", { smart_count: 2 })}
        </h1>
      </MobileHeader>
      <MobileContent>
        <div className="flex flex-col gap-2">
          {data?.map((company) => (
            <RecordContextProvider key={company.id} value={company}>
              <CompanyListItem company={company} />
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

const CompanyListItem = ({ company }: { company: Company }) => {
  const translate = useTranslate();

  return (
    <Link
      to={`/companies/${company.id}/show`}
      className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors no-underline"
    >
      <CompanyAvatar width={40} height={40} />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{company.name}</div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {company.city && (
            <span className="flex items-center gap-0.5">
              <MapPin className="w-3 h-3" />
              {company.city}
            </span>
          )}
          {company.phone_number && (
            <span className="flex items-center gap-0.5">
              <Phone className="w-3 h-3" />
              {company.phone_number}
            </span>
          )}
        </div>
        {company.lead_status && (
          <Badge
            variant={getLeadStatusBadgeVariant(company.lead_status)}
            className="mt-1 text-[10px] px-1.5 py-0"
          >
            {translate(
              `resources.companies.lead_status.${company.lead_status}`,
              {
                _: company.lead_status.replace(/_/g, " "),
              },
            )}
          </Badge>
        )}
      </div>
      <div className="text-right text-xs text-muted-foreground">
        {company.nb_contacts != null && company.nb_contacts > 0 && (
          <div>
            {translate("resources.companies.nb_contacts", {
              smart_count: company.nb_contacts,
            })}
          </div>
        )}
        {company.nb_deals != null && company.nb_deals > 0 && (
          <div>
            {translate("resources.companies.nb_deals", {
              smart_count: company.nb_deals,
            })}
          </div>
        )}
      </div>
    </Link>
  );
};
