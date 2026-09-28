import { useState } from "react";
import { Mail } from "lucide-react";
import {
  useDataProvider,
  useGetList,
  useNotify,
  useRecordContext,
  useRefresh,
} from "ra-core";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { Contact } from "../types";
import type { CrmDataProvider } from "../providers/supabase/dataProvider";

interface EmailTemplate {
  id: number;
  name: string;
  subject: string;
  body: string;
  category: string;
}

export const SendEmailDialog = () => {
  const record = useRecordContext<Contact>();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  const { data: templates } = useGetList<EmailTemplate>("email_templates", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "name", order: "ASC" },
  });

  const selectedTemplate = templates?.find(
    (t) => String(t.id) === selectedTemplateId,
  );

  const { mutate: sendEmail, isPending } = useMutation({
    mutationFn: () =>
      (dataProvider as any).sendEmail(Number(selectedTemplateId), record!.id),
    onSuccess: () => {
      notify("E-post skickad!", { type: "success" });
      setOpen(false);
      setSelectedTemplateId("");
      refresh();
    },
    onError: (error: Error) => {
      notify(`Kunde inte skicka: ${error.message}`, { type: "error" });
    },
  });

  if (!record) return null;

  const primaryEmail = record.email_jsonb?.[0]?.email;
  if (!primaryEmail) return null;

  // Preview: replace variables with contact data
  const previewBody = selectedTemplate?.body
    .replace(/\{\{first_name\}\}/g, record.first_name || "")
    .replace(/\{\{last_name\}\}/g, record.last_name || "")
    .replace(
      /\{\{full_name\}\}/g,
      `${record.first_name || ""} ${record.last_name || ""}`.trim(),
    );

  const previewSubject = selectedTemplate?.subject
    .replace(/\{\{first_name\}\}/g, record.first_name || "")
    .replace(/\{\{last_name\}\}/g, record.last_name || "")
    .replace(
      /\{\{full_name\}\}/g,
      `${record.first_name || ""} ${record.last_name || ""}`.trim(),
    );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Mail className="w-4 h-4 mr-1.5" />
          Skicka e-post
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Skicka e-post</DialogTitle>
          <DialogDescription>
            Till: {record.first_name} {record.last_name} ({primaryEmail})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Välj mall
            </label>
            <Select
              value={selectedTemplateId}
              onValueChange={setSelectedTemplateId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Välj en e-postmall..." />
              </SelectTrigger>
              <SelectContent>
                {templates?.map((template) => (
                  <SelectItem key={template.id} value={String(template.id)}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedTemplate && (
            <div className="rounded-md border p-3 bg-muted/50">
              <div className="text-sm font-medium mb-2">Förhandsgranskning</div>
              <div className="text-sm mb-1">
                <span className="font-medium">Ämne:</span> {previewSubject}
              </div>
              <div className="text-sm whitespace-pre-wrap mt-2 border-t pt-2">
                {previewBody}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Avbryt
          </Button>
          <Button
            onClick={() => sendEmail()}
            disabled={!selectedTemplateId || isPending}
          >
            <Mail className="w-4 h-4 mr-1.5" />
            {isPending ? "Skickar..." : "Skicka"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
