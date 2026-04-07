import { useState } from "react";
import {
  useDataProvider,
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Phone } from "lucide-react";
import type { CallLog, Company } from "../types";
import type { CrmDataProvider } from "../providers/supabase/dataProvider";

// Mapping from call outcome → company lead_status
// null = don't change the company status
const OUTCOME_TO_LEAD_STATUS: Record<
  CallLog["call_outcome"],
  Company["lead_status"] | null
> = {
  no_answer: "no_response",
  busy: "no_response",
  wrong_number: null,
  spoke_gatekeeper: "contacted",
  spoke_decision_maker: "contacted",
  interested: "interested",
  not_interested: "not_interested",
  meeting_booked: "meeting_booked",
  send_info: "send_info",
  callback_requested: "contacted",
};

export const CallLogModal = () => {
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<CallLog["call_outcome"]>("no_answer");
  const [notes, setNotes] = useState("");
  const [followupDate, setFollowupDate] = useState("");
  const [followupNote, setFollowupNote] = useState("");
  const [isPending, setIsPending] = useState(false);

  const company = useRecordContext<Company>();
  const dataProvider = useDataProvider() as CrmDataProvider;
  const notify = useNotify();
  const refresh = useRefresh();

  const handleSubmit = async () => {
    if (!company?.id) return;

    setIsPending(true);
    try {
      const followupTimestamp = followupDate
        ? new Date(followupDate).toISOString()
        : null;

      await dataProvider.logCall({
        company_id: Number(company.id),
        call_outcome: outcome,
        notes: notes || null,
        followup_date: followupTimestamp,
        followup_note: followupNote || null,
      });

      // Auto-update company lead_status based on call outcome
      const newStatus = OUTCOME_TO_LEAD_STATUS[outcome];
      if (newStatus) {
        await dataProvider.update("companies", {
          id: company.id,
          data: { lead_status: newStatus },
          previousData: company,
        });
      }

      notify("Samtalslogg sparad", { type: "success" });
      refresh();
      setOpen(false);
      setOutcome("no_answer");
      setNotes("");
      setFollowupDate("");
      setFollowupNote("");
    } catch (error) {
      notify(
        `Fel: ${error instanceof Error ? error.message : "Kunde inte spara samtalslogg"}`,
        { type: "error" },
      );
    } finally {
      setIsPending(false);
    }
  };

  const outcomeOptions: { value: CallLog["call_outcome"]; label: string }[] = [
    { value: "no_answer", label: "Inget svar" },
    { value: "busy", label: "Upptaget" },
    { value: "wrong_number", label: "Fel nummer" },
    { value: "spoke_gatekeeper", label: "Pratade med receptionist" },
    { value: "spoke_decision_maker", label: "Pratade med beslutsfattare" },
    { value: "interested", label: "Intresserad" },
    { value: "not_interested", label: "Inte intresserad" },
    { value: "meeting_booked", label: "Möte bokat" },
    { value: "send_info", label: "Skicka info" },
    { value: "callback_requested", label: "Ring upp igen" },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Phone className="h-4 w-4" />
          Logga samtal
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Logga samtal</DialogTitle>
          <DialogDescription>
            Registrera ett samtal med {company?.name}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="outcome">Resultat</Label>
            <Select
              value={outcome}
              onValueChange={(value) =>
                setOutcome(value as CallLog["call_outcome"])
              }
            >
              <SelectTrigger id="outcome">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {outcomeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="notes">Anteckningar</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Vad hände under samtalet?"
              rows={4}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="followup_date">Uppföljningsdatum och tid</Label>
            <input
              id="followup_date"
              type="datetime-local"
              value={followupDate}
              onChange={(e) => setFollowupDate(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {followupDate && (
            <div className="grid gap-2">
              <Label htmlFor="followup_note">Uppföljningsnotering</Label>
              <Textarea
                id="followup_note"
                value={followupNote}
                onChange={(e) => setFollowupNote(e.target.value)}
                placeholder="Vad ska göras vid uppföljningen?"
                rows={2}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Avbryt
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Sparar..." : "Spara"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
