import {
  InfiniteListBase,
  RecordContextProvider,
  useGetIdentity,
  useListContext,
  useTranslate,
} from "ra-core";
import { ReferenceField } from "@/components/admin/reference-field";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router";

import MobileHeader from "../layout/MobileHeader";
import { MobileContent } from "../layout/MobileContent";
import { InfinitePagination } from "../misc/InfinitePagination";
import { CompanyAvatar } from "../companies/CompanyAvatar";
import { QuoteEmpty } from "./QuoteEmpty";
import { QuoteListFilter } from "./QuoteListFilter";
import { quoteStatusColors } from "./quoteStatuses";
import type { Quote } from "../types";

export const MobileQuotesList = () => {
  const { identity } = useGetIdentity();
  if (!identity) return null;

  return (
    <InfiniteListBase
      perPage={25}
      sort={{ field: "created_at", order: "DESC" }}
      queryOptions={{
        onError: () => {
          /* Disable error notification as layout handles it */
        },
      }}
    >
      <QuotesListLayoutMobile />
    </InfiniteListBase>
  );
};

const QuotesListLayoutMobile = () => {
  const { isPending, data, error, filterValues } = useListContext<Quote>();
  const translate = useTranslate();

  const hasFilters = filterValues && Object.keys(filterValues).length > 0;

  if (!isPending && !data?.length && !hasFilters) return <QuoteEmpty />;

  return (
    <div>
      <MobileHeader>
        <QuoteListFilter />
      </MobileHeader>
      <MobileContent>
        {data?.length ? (
          <div className="flex flex-col gap-2">
            {data.map((quote) => (
              <RecordContextProvider key={quote.id} value={quote}>
                <QuoteListItem quote={quote} />
              </RecordContextProvider>
            ))}
          </div>
        ) : !isPending ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {translate("ra.navigation.no_results", {
              _: "Inga offerter matchar dina filter",
            })}
          </p>
        ) : null}
        {!error && (
          <div className="flex justify-center">
            <InfinitePagination />
          </div>
        )}
      </MobileContent>
    </div>
  );
};

const QuoteListItem = ({ quote }: { quote: Quote }) => {
  const translate = useTranslate();

  return (
    <Link
      to={`/quotes/${quote.id}/show`}
      className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors no-underline"
    >
      <ReferenceField source="company_id" reference="companies" link={false}>
        <CompanyAvatar width={40} height={40} />
      </ReferenceField>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{quote.title}</div>
        <div className="text-xs text-muted-foreground">
          {Number(quote.total_amount).toLocaleString("sv-SE")} {quote.currency}
        </div>
        <Badge
          variant={quoteStatusColors[quote.status]}
          className="mt-1 text-[10px] px-1.5 py-0"
        >
          {translate(`resources.quotes.statuses.${quote.status}`, {
            _: quote.status,
          })}
        </Badge>
      </div>
      {quote.valid_until && (
        <div className="text-right text-xs text-muted-foreground">
          {new Date(quote.valid_until).toLocaleDateString("sv-SE")}
        </div>
      )}
    </Link>
  );
};
