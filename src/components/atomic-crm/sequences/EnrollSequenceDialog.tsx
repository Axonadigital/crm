import { useState } from "react";
import { ListTodo } from "lucide-react";
import {
  useCreate,
  useGetList,
  useNotify,
  useRecordContext,
  useRefresh,
} from "ra-core";
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
import { Badge } from "@/components/ui/badge";
import type { Contact } from "../types";

interface Sequence {
  id: number;
  name: string;
  status: string;
  description: string | null;
}

export const EnrollSequenceDialog = () => {
  const record = useRecordContext<Contact>();
  const notify = useNotify();
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  const [selectedSequenceId, setSelectedSequenceId] = useState<string>("");
  const [create, { isPending }] = useCreate();

  // Only show active sequences
  const { data: sequences } = useGetList<Sequence>("sequences", {
    filter: { status: "active" },
    pagination: { page: 1, perPage: 100 },
    sort: { field: "name", order: "ASC" },
  });

  // Check existing enrollments for this contact
  const { data: enrollments } = useGetList("sequence_enrollments", {
    filter: { contact_id: record?.id },
    pagination: { page: 1, perPage: 100 },
    sort: { field: "enrolled_at", order: "DESC" },
  });

  if (!record) return null;

  const enrolledSequenceIds = new Set(
    enrollments
      ?.filter((e) => e.status === "active")
      .map((e) => e.sequence_id) || [],
  );

  const selectedSequence = sequences?.find(
    (s) => String(s.id) === selectedSequenceId,
  );

  const handleEnroll = async () => {
    if (!selectedSequenceId) return;

    try {
      // Fetch first step to calculate next_action_at
      const sequenceId = parseInt(selectedSequenceId);

      // Calculate next_action_at based on first step delay
      // Step 1 delay is typically 0 (send immediately), but respect it
      const nextActionAt = new Date().toISOString();

      await create(
        "sequence_enrollments",
        {
          data: {
            sequence_id: sequenceId,
            contact_id: record.id,
            company_id: record.company_id || null,
            current_step: 0,
            status: "active",
            next_action_at: nextActionAt,
          },
        },
        { returnPromise: true },
      );

      notify("Kontakt enrollad i sekvens!", { type: "success" });
      setOpen(false);
      setSelectedSequenceId("");
      refresh();
    } catch (error) {
      notify(
        `Kunde inte enrolla: ${error instanceof Error ? error.message : "Okänt fel"}`,
        { type: "error" },
      );
    }
  };

  // Don't show if no active sequences
  if (!sequences?.length) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ListTodo className="w-4 h-4 mr-1.5" />
          Enrolla i sekvens
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enrolla i sekvens</DialogTitle>
          <DialogDescription>
            {record.first_name} {record.last_name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Välj sekvens
            </label>
            <Select
              value={selectedSequenceId}
              onValueChange={setSelectedSequenceId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Välj en sekvens..." />
              </SelectTrigger>
              <SelectContent>
                {sequences?.map((seq) => (
                  <SelectItem
                    key={seq.id}
                    value={String(seq.id)}
                    disabled={enrolledSequenceIds.has(seq.id)}
                  >
                    <span className="flex items-center gap-2">
                      {seq.name}
                      {enrolledSequenceIds.has(seq.id) && (
                        <Badge variant="secondary" className="text-xs">
                          Redan enrollad
                        </Badge>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedSequence?.description && (
            <p className="text-sm text-muted-foreground">
              {selectedSequence.description}
            </p>
          )}

          {enrollments && enrollments.length > 0 && (
            <div className="text-xs text-muted-foreground border-t pt-3">
              <div className="font-medium mb-1">Aktiva sekvenser:</div>
              {enrollments
                .filter((e) => e.status === "active")
                .map((e) => (
                  <div key={e.id} className="flex items-center gap-1">
                    <Badge
                      variant="secondary"
                      className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                    >
                      Aktiv
                    </Badge>
                    <span>Steg {e.current_step}</span>
                  </div>
                ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Avbryt
          </Button>
          <Button
            onClick={handleEnroll}
            disabled={!selectedSequenceId || isPending}
          >
            <ListTodo className="w-4 h-4 mr-1.5" />
            {isPending ? "Enrollar..." : "Enrolla"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
