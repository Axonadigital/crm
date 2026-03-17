import * as Papa from "papaparse";
import { useState } from "react";
import { AlertCircleIcon } from "lucide-react";
import { Form, required, useTranslate } from "ra-core";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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
import sampleFile from "./import-sample.json?url";

type ImportMode = "json" | "csv";

const REQUIRED_CSV_COLUMNS = [
  "first_name",
  "last_name",
  "company",
  "phone_work",
  "email_work",
  "tags",
] as const;

type CsvContactImport = {
  id: number;
  first_name: string;
  last_name: string;
  emails: Array<{ email: string; type: string }>;
  phones: Array<{ number: string; type: string }>;
  tags: string[];
  company_id?: number;
};

type CsvCompanyImport = {
  id: number;
  name: string;
};

type CsvImportPayload = {
  contacts: CsvContactImport[];
  companies: CsvCompanyImport[];
};

export const ImportPage = () => {
  const translate = useTranslate();
  const [importState, importFile, reset] = useImportFromJson();
  const [mode, setMode] = useState<ImportMode>("json");
  const [csvImportError, setCsvImportError] = useState<string | null>(null);

  const resetAll = () => {
    setCsvImportError(null);
    reset();
  };

  const handleCsvImport = async (file: File) => {
    try {
      setCsvImportError(null);
      const payload = await parseCsvToImportPayload(file);
      const jsonFile = createJsonFileFromCsvPayload(
        payload,
        file.name.replace(/\.csv$/i, ""),
      );
      await importFile(jsonFile);
    } catch (err) {
      setCsvImportError((err as Error).message);
    }
  };

  const renderImportContent = () => {
    if (importState.status === "importing") {
      return <ImportFromJsonStatus importState={importState} translate={translate} />;
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
    if (mode === "json") {
      if (importState.status === "error") {
        return (
          <ImportFromJsonError
            importState={importState}
            importFile={importFile}
            translate={translate}
          />
        );
      }
      return (
        <ImportFromJsonIdle
          importFile={importFile}
          translate={translate}
        />
      );
    }

    if (importState.status === "error") {
      return (
        <ImportFromCsvError
          importState={importState}
          csvImportError={csvImportError}
          onSubmit={handleCsvImport}
          translate={translate}
        />
      );
    }
    return (
      <ImportFromCsvIdle
        csvImportError={csvImportError}
        onSubmit={handleCsvImport}
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
        <CardContent>
          <Tabs
            defaultValue="json"
            value={mode}
            onValueChange={(nextMode) => {
              setMode(nextMode as ImportMode);
              setCsvImportError(null);
              reset();
            }}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="json">
                {translate("crm.import.tab.json", {
                  _: "JSON",
                })}
              </TabsTrigger>
              <TabsTrigger value="csv">
                {translate("crm.import.tab.csv", {
                  _: "Import CSV",
                })}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="json" className="mt-4">
              {mode === "json" && renderImportContent()}
            </TabsContent>
            <TabsContent value="csv" className="mt-4">
              {mode === "csv" && renderImportContent()}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

ImportPage.path = "/import";

const ImportFromJsonIdle = ({
  importFile,
  translate,
}: {
  importFile: ImportFromJsonFunction;
  translate: (key: string, options?: any) => string;
}) => (
  <>
    <div className="mb-4">
      <p className="text-sm">
        {translate("crm.import.idle.description_1", {
          _: "You can import sales, companies, contacts, companies, notes, and tasks.",
        })}
      </p>
      <p className="text-sm">
        {translate("crm.import.idle.description_2", {
          _: "Data must be in a JSON file matching the following sample:",
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
    <ImportFromJsonForm importFile={importFile} translate={translate} />
  </>
);

const ImportFromJsonError = ({
  importState,
  importFile,
  translate,
}: {
  importFile: ImportFromJsonFunction;
  importState: ImportFromJsonErrorState;
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
    <ImportFromJsonForm importFile={importFile} translate={translate} />
  </>
);

const ImportFromCsvIdle = ({
  onSubmit,
  csvImportError,
  translate,
}: {
  onSubmit: (file: File) => Promise<void>;
  csvImportError: string | null;
  translate: (key: string, options?: any) => string;
}) => (
  <>
    <div className="mb-4">
      <p className="text-sm">
        {translate("crm.import.idle.csv.description", {
          _: "You can import contacts from a CSV file with these columns: first_name, last_name, company, phone_work, email_work, tags.",
        })}
      </p>
      <p className="text-sm">
        {translate("crm.import.idle.csv.description_2", {
          _: "Columns may be empty if optional, but rows must still include names.",
        })}
      </p>
    </div>
    {csvImportError ? (
      <Alert variant="destructive" className="mb-4">
        <AlertCircleIcon />
        <AlertTitle>
          {translate("crm.import.error.unable", {
            _: "Unable to import this file.",
          })}
        </AlertTitle>
        <AlertDescription>
          <p>{csvImportError}</p>
        </AlertDescription>
      </Alert>
    ) : null}
    <Form
      onSubmit={(values: any) => {
        const file = values.file?.rawFile;
        if (file) {
          onSubmit(file);
        }
      }}
    >
      <FileInput
        className="mt-4"
        source="file"
        accept={{ "text/csv": [".csv"] }}
        validate={required()}
      >
        <FileField source="src" title="title" />
      </FileInput>
      <div className="flex justify-end mt-4">
        <Button type="submit">{translate("crm.import.action.import")}</Button>
      </div>
    </Form>
  </>
);

const ImportFromCsvError = ({
  importState,
  onSubmit,
  csvImportError,
  translate,
}: {
  importState: ImportFromJsonErrorState;
  onSubmit: (file: File) => Promise<void>;
  csvImportError: string | null;
  translate: (key: string, options?: any) => string;
}) => {
  return (
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
      {csvImportError ? (
        <Alert variant="destructive" className="mb-4">
          <AlertCircleIcon />
          <AlertDescription>{csvImportError}</AlertDescription>
        </Alert>
      ) : null}
      <ImportFromCsvIdle
        csvImportError={null}
        onSubmit={onSubmit}
        translate={translate}
      />
    </>
  );
};

const ImportFromJsonForm = ({
  importFile,
  translate,
}: {
  importFile: ImportFromJsonFunction;
  translate: (key: string, options?: any) => string;
}) => (
  <Form
    onSubmit={(values: any) => {
      importFile(values.file.rawFile);
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

const parseCsvToImportPayload = async (
  file: File,
): Promise<CsvImportPayload> => {
  const parseResult = await new Promise<Papa.ParseResult<Record<string, string>>>(
    (resolve, reject) => {
      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: normalizeCsvHeader,
        complete: (result) => {
          resolve(result);
        },
        error: (error) => {
          reject(new Error(error.message));
        },
      });
    },
  );

  if (
    parseResult.errors.length > 0 &&
    parseResult.data.some((row) => Object.keys(row).length > 0)
  ) {
    const firstErrors = parseResult.errors
      .slice(0, 3)
      .map((error) => `Row ${error.row}: ${error.message}`)
      .join(", ");
    throw new Error(
      `CSV parsing failed: ${firstErrors}${parseResult.errors.length > 3 ? ", ..." : ""}`,
    );
  }

  const fields = parseResult.meta.fields ?? [];
  const missingColumns = REQUIRED_CSV_COLUMNS.filter(
    (column) => !fields.includes(column),
  );
  if (missingColumns.length > 0) {
    throw new Error(
      `CSV is missing required columns: ${missingColumns.join(", ")}.`,
    );
  }

  const companies: CsvCompanyImport[] = [];
  const contacts: CsvContactImport[] = [];
  const companiesMap = new Map<string, number>();
  let nextCompanyId = 1;
  let nextContactId = 1;

  for (const row of parseResult.data) {
    const firstName = normalizeCsvValue(row.first_name);
    const lastName = normalizeCsvValue(row.last_name);
    const phoneWork = normalizeCsvValue(row.phone_work);
    const emailWork = normalizeCsvValue(row.email_work);
    const company = normalizeCsvValue(row.company);
    const tags = parseTags(normalizeCsvValue(row.tags));

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
        companies.push({ id: nextCompanyId, name: company });
        nextCompanyId += 1;
      } else {
        companyId = existingCompanyId;
      }
    }

    contacts.push({
      id: nextContactId,
      first_name: firstName,
      last_name: lastName,
      emails: emailWork ? [{ email: emailWork, type: "Work" }] : [],
      phones: phoneWork ? [{ number: phoneWork, type: "Work" }] : [],
      tags,
      ...(companyId == null ? {} : { company_id: companyId }),
    });
    nextContactId += 1;
  }

  if (contacts.length === 0) {
    throw new Error("No importable rows were found in the CSV file.");
  }

  return { contacts, companies };
};

const createJsonFileFromCsvPayload = (
  payload: CsvImportPayload,
  fileBaseName: string,
) => {
  const data = JSON.stringify({
    companies: payload.companies,
    contacts: payload.contacts,
  });
  const fileName =
    fileBaseName.length > 0 ? `${fileBaseName}.json` : "import-csv.json";

  return new File([data], fileName, {
    type: "application/json",
  });
};

const normalizeCsvHeader = (header: string | null) => {
  return header?.replace("\uFEFF", "").trim() ?? "";
};

const normalizeCsvValue = (value: string | undefined) => value?.trim() ?? "";

const parseTags = (value: string) =>
  value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
