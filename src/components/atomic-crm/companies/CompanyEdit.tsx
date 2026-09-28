import { useMemo } from "react";
import { EditBase, Form, useEditContext, RecordContextProvider } from "ra-core";
import { Card, CardContent } from "@/components/ui/card";

import { CompanyInputs } from "./CompanyInputs";
import { CompanyAside } from "./CompanyAside";
import { FormToolbar } from "../layout/FormToolbar";
import { normalizeCompanyWebsite } from "./normalizeCompanyWebsite";

/**
 * Normalize context_links from enrichment objects {url, title, source}
 * to plain URL strings so the form can display and validate them.
 */
const normalizeContextLinks = (
  links?: (string | { url: string })[],
): string[] | undefined => {
  if (!Array.isArray(links)) return links;
  return links.map((link) => (typeof link === "string" ? link : link.url));
};

const CompanyEditForm = () => {
  const { record } = useEditContext();

  const normalizedRecord = useMemo(() => {
    if (!record) return record;
    if (!Array.isArray(record.context_links)) return record;
    return {
      ...record,
      context_links: normalizeContextLinks(record.context_links),
    };
  }, [record]);

  return (
    <RecordContextProvider value={normalizedRecord}>
      <div className="mt-2 flex gap-8">
        <Form className="flex flex-1 flex-col gap-4 pb-2">
          <Card>
            <CardContent>
              <CompanyInputs />
              <FormToolbar />
            </CardContent>
          </Card>
        </Form>

        <CompanyAside link="show" />
      </div>
    </RecordContextProvider>
  );
};

export const CompanyEdit = () => (
  <EditBase actions={false} redirect="show" transform={normalizeCompanyWebsite}>
    <CompanyEditForm />
  </EditBase>
);
