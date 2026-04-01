import { useState } from "react";
import { AlertCircleIcon } from "lucide-react";
import { Form, required, useTranslate } from "ra-core";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Spinner } from "@/components/ui/spinner";
import { FileField, FileInput } from "@/components/admin";
import {
  type ImportFromJsonErrorState,
  type ImportFromJsonFailures,
  type ImportFromJsonFunction,
  type ImportFromJsonState,
  useImportFromJson,
} from "./useImportFromJson";
import {
  mapHeadersToCanonical,
  parseUniversalFile,
  remapRows,
  StructuredJsonError,
} from "./parseUniversalFile";
import sampleFile from "./import-sample.json?url";

type CsvContactImport = {
  id: number;
  first_name: string;
  last_name: string;
  emails: Array<{ email: string; type: string }>;
  phones: Array<{ number: string; type: string }>;
  tags: string[];
  company_id?: number;
  title?: string;
  background?: string;
  linkedin_url?: string;
  gender?: string;
};

type CsvCompanyImport = {
  id: number;
  name: string;
  website?: string;
  address?: string;
  city?: string;
  zipcode?: string;
  country?: string;
};

type CsvImportPayload = {
  contacts: CsvContactImport[];
  companies: CsvCompanyImport[];
};

export const ImportPage = () => {
  const translate = useTranslate();
  const [importState, importFile, reset] = useImportFromJson();
  const [parseError, setParseError] = useState<string | null>(null);

  const resetAll = () => {
    setParseError(null);
    reset();
  };

  const handleFileImport = async (file: File) => {
    try {
      setParseError(null);

      // Try universal parse first; if it's a structured JSON, pass directly
      let parsedFile: File;
      try {
        const parsed = await parseUniversalFile(file);
        const payload = convertRowsToImportPayload(parsed.rows, parsed.headers);
        parsedFile = createJsonFileFromPayload(payload, file.name);
      } catch (err) {
        if (err instanceof StructuredJsonError) {
          // Structured JSON — pass directly to the JSON importer
          parsedFile = err.file;
        } else {
          throw err;
        }
      }

      await importFile(parsedFile);
    } catch (err) {
      setParseError((err as Error).message);
    }
  };

  const renderImportContent = () => {
    if (importState.status === "importing") {
      return (
        <ImportFromJsonStatus importState={importState} translate={translate} />
      );
    }
    if (importState.status === "success") {
      return (
        <ImportFromJsonSuccess
          importState={importState}
          reset={resetAll}
          translate={translate}
        />
      );
    }
    if (importState.status === "error") {
      return (
        <ImportError
          importState={importState}
          parseError={parseError}
          onSubmit={handleFileImport}
          translate={translate}
        />
      );
    }
    return (
      <ImportIdle
        parseError={parseError}
        onSubmit={handleFileImport}
        translate={translate}
      />
    );
  };

  return (
    <div className="max-w-2xl mx-auto mt-8">
      <Card>
        <CardHeader>
          <CardTitle>{translate("crm.import.title")}</CardTitle>
        </CardHeader>
        <CardContent>{renderImportContent()}</CardContent>
      </Card>
    </div>
  );
};

ImportPage.path = "/import";

const SUPPORTED_FORMATS = "CSV, TSV, Excel (.xlsx, .xls), JSON, TXT";

const ImportIdle = ({
  onSubmit,
  parseError,
  translate,
}: {
  onSubmit: (file: File) => Promise<void>;
  parseError: string | null;
  translate: (key: string, options?: any) => string;
}) => (
  <>
    <div className="mb-4">
      <p className="text-sm">
        {translate("crm.import.idle.description_1", {
          _: "You can import sales, companies, contacts, notes, and tasks.",
        })}
      </p>
      <p className="text-sm">
        {translate("crm.import.idle.universal_description", {
          _: `Upload any tabular file (${SUPPORTED_FORMATS}). Column names are matched automatically.`,
        })}
      </p>
      <p className="text-sm">
        {translate("crm.import.idle.description_2", {
          _: "For full data import (sales, deals, notes, tasks), use a structured JSON file:",
        })}{" "}
        <a
          className="underline"
          download="import-sample.json"
          href={sampleFile}
        >
          sample.json
        </a>
      </p>
    </div>
    {parseError ? (
      <Alert variant="destructive" className="mb-4">
        <AlertCircleIcon />
        <AlertTitle>
          {translate("crm.import.error.unable", {
            _: "Unable to import this file.",
          })}
        </AlertTitle>
        <AlertDescription>
          <p>{parseError}</p>
        </AlertDescription>
      </Alert>
    ) : null}
    <ImportForm onSubmit={onSubmit} translate={translate} />
  </>
);

const ImportError = ({
  importState,
  parseError,
  onSubmit,
  translate,
}: {
  importState: ImportFromJsonErrorState;
  parseError: string | null;
  onSubmit: (file: File) => Promise<void>;
  translate: (key: string, options?: any) => string;
}) => (
  <>
    <Alert variant="destructive" className="mb-4">
      <AlertCircleIcon />
      <AlertTitle>
        {translate("crm.import.error.unable", {
          _: "Unable to import this file.",
        })}
      </AlertTitle>
      <AlertDescription>
        <p>{importState.error.message}</p>
      </AlertDescription>
    </Alert>
    {parseError ? (
      <Alert variant="destructive" className="mb-4">
        <AlertCircleIcon />
        <AlertDescription>{parseError}</AlertDescription>
      </Alert>
    ) : null}
    <ImportForm onSubmit={onSubmit} translate={translate} />
  </>
);

const ImportForm = ({
  onSubmit,
  translate,
}: {
  onSubmit: (file: File) => Promise<void>;
  translate: (key: string, options?: any) => string;
}) => (
  <Form
    onSubmit={(values: any) => {
      const file = values.file?.rawFile;
      if (file) {
        onSubmit(file);
      }
    }}
  >
    <FileInput className="mt-4" source="file" validate={required()}>
      <FileField source="src" title="title" />
    </FileInput>
    <div className="flex justify-end mt-4">
      <Button type="submit">{translate("crm.import.action.import")}</Button>
    </div>
  </Form>
);

const ImportFromJsonStatus = ({
  importState,
  translate,
}: {
  importState: ImportFromJsonState;
  translate: (key: string, options?: any) => string;
}) => (
  <>
    <Spinner />
    <p className="my-4 text-sm text-center text-muted-foreground">
      {translate("crm.import.status.in_progress", {
        _: "Import in progress, please don't navigate away from this page.",
      })}
    </p>
    <ImportStats importState={importState} translate={translate} />
  </>
);

const ImportFromJsonSuccess = ({
  importState,
  reset,
  translate,
}: {
  importState: ImportFromJsonState;
  reset: () => void;
  translate: (key: string, options?: any) => string;
}) => (
  <>
    <p className="mb-4 text-sm">
      {translate("crm.import.status.complete")}{" "}
      {hasFailedImports(importState.failedImports) ? (
        <>
          <span className="text-destructive">
            {translate("crm.import.status.some_failed", {
              _: "Some records were not imported.",
            })}{" "}
          </span>
          <DownloadErrorFileButton
            failedImports={importState.failedImports}
            translate={translate}
          />
        </>
      ) : (
        <span>
          {translate("crm.import.status.all_success", {
            _: "All records were imported successfully.",
          })}
        </span>
      )}
    </p>
    <ImportStats importState={importState} translate={translate} />
    <div className="flex justify-end mt-4">
      <Button variant="outline" onClick={reset}>
        {translate("crm.import.action.import_another", {
          _: "Import another file",
        })}
      </Button>
    </div>
  </>
);

const hasFailedImports = (failedImports: ImportFromJsonFailures) => {
  return (
    failedImports.sales.length > 0 ||
    failedImports.companies.length > 0 ||
    failedImports.contacts.length > 0 ||
    failedImports.notes.length > 0 ||
    failedImports.tasks.length > 0
  );
};

const DownloadErrorFileButton = ({
  failedImports,
  translate,
}: {
  failedImports: ImportFromJsonFailures;
  translate: (key: string, options?: any) => string;
}) => {
  return (
    <a
      className="font-semibold"
      onClick={async (event) => {
        const json = JSON.stringify(failedImports);
        const blob = new Blob([json], { type: "octet/stream" });
        const url = window.URL.createObjectURL(blob);
        event.currentTarget.href = url;
      }}
      download="atomic-crm-import-report.json"
    >
      {translate("crm.import.action.download_error_report", {
        _: "Download the error report",
      })}
    </a>
  );
};

const ImportStats = ({
  importState: { stats, failedImports },
  translate,
}: {
  importState: ImportFromJsonState;
  translate: (key: string, options?: any) => string;
}) => {
  const data = [
    {
      entity: "sales",
      imported: stats.sales,
      failed: failedImports.sales.length,
    },
    {
      entity: "companies",
      imported: stats.companies,
      failed: failedImports.companies.length,
    },
    {
      entity: "contacts",
      imported: stats.contacts,
      failed: failedImports.contacts.length,
    },
    {
      entity: "notes",
      imported: stats.notes,
      failed: failedImports.notes.length,
    },
    {
      entity: "tasks",
      imported: stats.tasks,
      failed: failedImports.tasks.length,
    },
  ];
  return (
    <Table>
      <TableCaption className="sr-only">
        {translate("crm.import.status.table_caption")}
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead className="w-25"></TableHead>
          <TableHead className="text-right">
            {translate("crm.import.status.imported")}
          </TableHead>
          <TableHead className="text-right">
            {translate("crm.import.status.failed")}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((record) => (
          <TableRow key={record.entity}>
            <TableCell className="font-medium">{record.entity}</TableCell>
            <TableCell className="text-right text-success">
              {record.imported}
            </TableCell>
            <TableCell
              className={cn(
                "text-right",
                record.failed > 0 && "text-destructive",
              )}
            >
              {record.failed}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

/**
 * Convert universally parsed rows into the JSON import payload.
 * Column names are fuzzy-matched via aliases.
 */
const convertRowsToImportPayload = (
  rows: Record<string, string>[],
  headers: string[],
): CsvImportPayload => {
  const mapping = mapHeadersToCanonical(headers);
  const mappedRows = remapRows(rows, headers, mapping);

  const companies: CsvCompanyImport[] = [];
  const contacts: CsvContactImport[] = [];
  const companiesMap = new Map<string, number>();
  let nextCompanyId = 1;
  let nextContactId = 1;

  for (const row of mappedRows) {
    const firstName = row.first_name ?? "";
    const lastName = row.last_name ?? "";
    const phoneWork = row.phone_work ?? "";
    const emailWork = row.email_work ?? "";
    const company = row.company ?? "";
    const tagsRaw = row.tags ?? "";
    const tags = parseTags(tagsRaw);

    const isEmptyRow =
      !firstName &&
      !lastName &&
      !phoneWork &&
      !emailWork &&
      !company &&
      !tags.length;
    if (isEmptyRow) {
      continue;
    }

    let companyId: number | undefined;
    if (company) {
      const existingCompanyId = companiesMap.get(company);
      if (existingCompanyId == null) {
        companyId = nextCompanyId;
        companiesMap.set(company, nextCompanyId);
        const companyRecord: CsvCompanyImport = {
          id: nextCompanyId,
          name: company,
        };
        if (row.website) companyRecord.website = row.website;
        if (row.address) companyRecord.address = row.address;
        if (row.city) companyRecord.city = row.city;
        if (row.zipcode) companyRecord.zipcode = row.zipcode;
        if (row.country) companyRecord.country = row.country;
        companies.push(companyRecord);
        nextCompanyId += 1;
      } else {
        companyId = existingCompanyId;
      }
    }

    const emails: Array<{ email: string; type: string }> = [];
    if (emailWork) emails.push({ email: emailWork, type: "Work" });
    if (row.email_home) emails.push({ email: row.email_home, type: "Home" });
    if (row.email_other) emails.push({ email: row.email_other, type: "Other" });

    const phones: Array<{ number: string; type: string }> = [];
    if (phoneWork) phones.push({ number: phoneWork, type: "Work" });
    if (row.phone_home) phones.push({ number: row.phone_home, type: "Home" });
    if (row.phone_other)
      phones.push({ number: row.phone_other, type: "Other" });

    const contact: CsvContactImport = {
      id: nextContactId,
      first_name: firstName,
      last_name: lastName,
      emails,
      phones,
      tags,
      ...(companyId == null ? {} : { company_id: companyId }),
    };

    if (row.title) contact.title = row.title;
    if (row.background) contact.background = row.background;
    if (row.linkedin_url) contact.linkedin_url = row.linkedin_url;
    if (row.gender) contact.gender = row.gender;

    contacts.push(contact);
    nextContactId += 1;
  }

  if (contacts.length === 0) {
    throw new Error(
      "No importable rows found. Make sure the file has columns like first_name, last_name, email, phone, etc.",
    );
  }

  return { contacts, companies };
};

const createJsonFileFromPayload = (
  payload: CsvImportPayload,
  originalName: string,
) => {
  const data = JSON.stringify({
    companies: payload.companies,
    contacts: payload.contacts,
  });
  const baseName = originalName.replace(/\.[^.]+$/, "");
  const fileName =
    baseName.length > 0 ? `${baseName}.json` : "import-data.json";

  return new File([data], fileName, {
    type: "application/json",
  });
};

const parseTags = (value: string) =>
  value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
