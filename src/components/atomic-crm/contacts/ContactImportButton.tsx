import { useCallback, useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { Upload, Loader2 } from "lucide-react";
import { Form, useRefresh, useTranslate } from "ra-core";
import { Link } from "react-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormToolbar } from "@/components/admin/simple-form";
import { FileInput } from "@/components/admin/file-input";
import { FileField } from "@/components/admin/file-field";

import {
  mapHeadersToCanonical,
  parseUniversalFile,
  remapRows,
} from "../misc/parseUniversalFile";
import type { ContactImportSchema } from "./useContactImport";
import { useContactImport } from "./useContactImport";
import * as sampleCsv from "./contacts_export.csv?raw";

export const ContactImportButton = () => {
  const translate = useTranslate();
  const [modalOpen, setModalOpen] = useState(false);

  const handleOpenModal = () => {
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={handleOpenModal}
        className="flex items-center gap-2 cursor-pointer"
      >
        <Upload /> {translate("resources.contacts.import.button")}
      </Button>
      <ContactImportDialog open={modalOpen} onClose={handleCloseModal} />
    </>
  );
};

const SAMPLE_URL = `data:text/csv;name=crm_contacts_sample.csv;charset=utf-8,${encodeURIComponent(
  sampleCsv.default,
)}`;

type ContactImportModalProps = {
  open: boolean;
  onClose(): void;
};

type ImportState =
  | { state: "idle" }
  | { state: "parsing" }
  | {
      state: "running" | "complete";
      rowCount: number;
      importCount: number;
      errorCount: number;
      remainingTime: number | null;
    }
  | { state: "error"; error: Error };

export function ContactImportDialog({
  open,
  onClose,
}: ContactImportModalProps) {
  const translate = useTranslate();
  const refresh = useRefresh();
  const processBatch = useContactImport();
  const [importer, setImporter] = useState<ImportState>({ state: "idle" });
  const [file, setFile] = useState<File | null>(null);

  const reset = useCallback(() => {
    setImporter({ state: "idle" });
    setFile(null);
  }, []);

  useEffect(() => {
    if (importer.state === "complete") {
      refresh();
    }
  }, [importer.state, refresh]);

  const handleFileChange = (file: File | null) => {
    setFile(file);
  };

  const startImport = async () => {
    if (!file) return;
    setImporter({ state: "parsing" });

    try {
      const parsed = await parseUniversalFile(file);
      const mapping = mapHeadersToCanonical(parsed.headers);
      const mappedRows = remapRows(parsed.rows, parsed.headers, mapping);

      // Convert to ContactImportSchema format
      const rows: ContactImportSchema[] = mappedRows.map((row) => ({
        first_name: row.first_name ?? "",
        last_name: row.last_name ?? "",
        company: row.company ?? "",
        phone_work: row.phone_work ?? "",
        email_work: row.email_work ?? "",
        tags: row.tags ?? "",
        gender: row.gender,
        title: row.title,
        email_home: row.email_home,
        email_other: row.email_other,
        phone_home: row.phone_home,
        phone_other: row.phone_other,
        background: row.background,
        avatar: row.avatar,
        first_seen: row.first_seen,
        last_seen: row.last_seen,
        has_newsletter: row.has_newsletter,
        status: row.status,
        linkedin_url: row.linkedin_url,
      }));

      if (rows.length === 0) {
        setImporter({
          state: "error",
          error: new Error("No importable rows found in the file."),
        });
        return;
      }

      setImporter({
        state: "running",
        rowCount: rows.length,
        errorCount: 0,
        importCount: 0,
        remainingTime: null,
      });

      const batchSize = 10;
      let totalTime = 0;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        try {
          const start = Date.now();
          await processBatch(batch);
          totalTime += Date.now() - start;

          const meanTime = totalTime / (i + batch.length);
          setImporter((prev) => {
            if (prev.state === "running") {
              const importCount = prev.importCount + batch.length;
              return {
                ...prev,
                importCount,
                remainingTime: meanTime * (rows.length - importCount),
              };
            }
            return prev;
          });
        } catch {
          setImporter((prev) =>
            prev.state === "running"
              ? { ...prev, errorCount: prev.errorCount + batch.length }
              : prev,
          );
        }
      }

      setImporter((prev) =>
        prev.state === "running"
          ? { ...prev, state: "complete", remainingTime: null }
          : prev,
      );
    } catch (err) {
      setImporter({
        state: "error",
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleReset = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <Form className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {translate("resources.contacts.import.title")}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col space-y-2">
            {importer.state === "running" && (
              <div className="flex flex-col gap-2">
                <Alert>
                  <AlertDescription className="flex flex-row gap-4">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    {translate("resources.contacts.import.running")}
                  </AlertDescription>
                </Alert>

                <div className="text-sm">
                  {translate("resources.contacts.import.progress", {
                    importCount: importer.importCount,
                    rowCount: importer.rowCount,
                    errorCount: importer.errorCount,
                  })}
                  {importer.remainingTime !== null && (
                    <>
                      {" "}
                      {translate(
                        "resources.contacts.import.remaining_time",
                      )}{" "}
                      <strong>
                        {millisecondsToTime(importer.remainingTime)}
                      </strong>
                      .{" "}
                      <button
                        onClick={handleReset}
                        className="text-red-600 underline hover:text-red-800"
                      >
                        {translate("resources.contacts.import.stop")}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {importer.state === "error" && (
              <Alert variant="destructive">
                <AlertDescription>
                  {translate("resources.contacts.import.error")}
                </AlertDescription>
              </Alert>
            )}

            {importer.state === "complete" && (
              <Alert>
                <AlertDescription>
                  {translate("resources.contacts.import.complete", {
                    importCount: importer.importCount,
                    errorCount: importer.errorCount,
                  })}
                </AlertDescription>
              </Alert>
            )}

            {importer.state === "idle" && (
              <>
                <Alert>
                  <AlertDescription className="flex flex-col gap-4">
                    {translate("resources.contacts.import.sample_hint")}
                    <Button asChild variant="outline" size="sm">
                      <Link
                        to={SAMPLE_URL}
                        download={"crm_contacts_sample.csv"}
                      >
                        {translate("resources.contacts.import.sample_download")}
                      </Link>
                    </Button>{" "}
                  </AlertDescription>
                </Alert>

                <FileInput
                  source="csv"
                  label="resources.contacts.import.csv_file"
                  onChange={handleFileChange}
                >
                  <FileField source="src" title="title" target="_blank" />
                </FileInput>
              </>
            )}
          </div>
        </Form>

        <div className="flex justify-start pt-6">
          <FormToolbar>
            {importer.state === "idle" ? (
              <Button onClick={startImport} disabled={!file}>
                {translate("resources.contacts.import.button")}
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={importer.state === "running"}
              >
                {translate("ra.action.close")}
              </Button>
            )}
          </FormToolbar>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function millisecondsToTime(ms: number) {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (60 * 1000)) % 60);

  return `${minutes}m ${seconds}s`;
}
