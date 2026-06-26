import {
  InfiniteListBase,
  RecordContextProvider,
  useGetIdentity,
  useListContext,
  useRefresh,
  useTranslate,
} from "ra-core";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import MobileHeader from "../layout/MobileHeader";
import { MobileContent } from "../layout/MobileContent";
import { InfinitePagination } from "../misc/InfinitePagination";
import {
  emailTemplateCategoryColors,
  emailTemplateCategoryLabels as categoryLabels,
} from "./emailTemplateConstants";

type EmailTemplate = {
  id: string | number;
  name: string;
  subject: string;
  category: string;
  updated_at?: string;
};

/**
 * Mobile list of e-mail templates.
 *
 * Read-only: creation and editing live on desktop. Provides quick
 * reference to available templates when composing a message.
 */
export const MobileEmailTemplatesList = () => {
  const { identity } = useGetIdentity();
  if (!identity) return null;

  return (
    <InfiniteListBase
      perPage={25}
      sort={{ field: "updated_at", order: "DESC" }}
      queryOptions={{
        onError: () => {
          /* Disable error notification as layout handles it */
        },
      }}
    >
      <EmailTemplatesListLayoutMobile />
    </InfiniteListBase>
  );
};

const EmailTemplatesListLayoutMobile = () => {
  const { isPending, data, error } = useListContext<EmailTemplate>();
  const translate = useTranslate();
  const refresh = useRefresh();

  return (
    <>
      <MobileHeader>
        <h1 className="text-xl font-semibold">
          {translate("resources.email_templates.name", {
            smart_count: 2,
            _: "E-postmallar",
          })}
        </h1>
      </MobileHeader>
      <MobileContent onRefresh={refresh}>
        {data?.length ? (
          <div className="flex flex-col gap-2">
            {data.map((template) => (
              <RecordContextProvider key={template.id} value={template}>
                <EmailTemplatesListItem template={template} />
              </RecordContextProvider>
            ))}
          </div>
        ) : !isPending ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {translate("ra.navigation.no_results", {
              _: "Inga mallar hittades",
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

const EmailTemplatesListItem = ({ template }: { template: EmailTemplate }) => {
  const updatedLabel = template.updated_at
    ? new Date(template.updated_at).toLocaleDateString("sv-SE")
    : "";

  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-card p-3 shadow-[var(--shadow-card)]">
      <div className="flex items-start gap-2 justify-between">
        <div className="font-medium text-sm truncate flex-1">
          {template.name}
        </div>
        {template.category && (
          <Badge
            className={cn(
              emailTemplateCategoryColors[template.category],
              "px-1.5 py-0 shrink-0",
            )}
          >
            {categoryLabels[template.category] ?? template.category}
          </Badge>
        )}
      </div>
      {template.subject && (
        <div className="text-xs text-muted-foreground truncate">
          {template.subject}
        </div>
      )}
      {updatedLabel && (
        <div className="text-xs text-muted-foreground">{updatedLabel}</div>
      )}
    </div>
  );
};
