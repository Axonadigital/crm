import { useState, useEffect } from "react";
import {
  useCreate,
  useGetIdentity,
  useNotify,
  useRecordContext,
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
import { supabase } from "../providers/supabase/supabase";

export const CallLogModal = () => {
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<CallLog["call_outcome"]>("no_answer");
  const [notes, setNotes] = useState("");
  const [followupDate, setFollowupDate] = useState("");
  const [followupNote, setFollowupNote] = useState("");
  const [authUserId, setAuthUserId] = useState<string | null>(null);

  const company = useRecordContext<Company>();
  const { identity } = useGetIdentity();
  const [create, { isPending }] = useCreate();
  const notify = useNotify();

  // Get the actual Supabase auth user ID (UUID)
  useEffect(() => {
    const getAuthUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setAuthUserId(user?.id || null);
    };
    getAuthUser();
  }, []);

  const handleSubmit = async () => {
    if (!company?.id) return;

    try {
      // Convert datetime-local string to ISO timestamp if followupDate exists
      const followupTimestamp = followupDate
        ? new Date(followupDate).toISOString()
        : undefined;

      await create(
        "call_logs",
        {
          data: {
            company_id: company.id,
            user_id: authUserId, // Use the Supabase auth UUID
            call_outcome: outcome,
            notes: notes || undefined,
            followup_date: followupTimestamp,
            followup_note: followupNote || undefined,
            created_at: new Date().toISOString(),
          },
        },
        {
          onSuccess: () => {
            notify("Samtalslogg sparad", { type: "success" });
            setOpen(false);
            // Reset form
            setOutcome("no_answer");
            setNotes("");
            setFollowupDate("");
            setFollowupNote("");
          },
          onError: (error) => {
            notify(`Fel: ${error.message}`, { type: "error" });
          },
        },
      );
    } catch (error) {
      notify("Kunde inte spara samtalslogg", { type: "error" });
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
