import { useState } from "react";
import { Brain } from "lucide-react";
import {
  useDataProvider,
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
import { Textarea } from "@/components/ui/textarea";
import type { Contact } from "../types";
import type { CrmDataProvider } from "../providers/supabase/dataProvider";
import { MeetingAnalysisCard } from "./MeetingAnalysisCard";

interface AnalysisResponse {
  transcription_id: number;
  analysis: {
    summary: string;
    customer_needs: string[];
    objections: string[];
    action_items: Array<{
      text: string;
      assignee: string;
      due_days: number;
    }>;
    quote_context: {
      services_discussed: string[];
      budget_mentioned: string | null;
      timeline: string | null;
      decision_makers: string[];
      next_steps: string;
    };
    sentiment: "positive" | "neutral" | "negative";
    deal_probability: number;
  };
  tasks_created: number;
  task_ids: number[];
}

export const AnalyzeMeetingDialog = ({
  calendarEventId,
}: {
  calendarEventId?: number;
}) => {
  const record = useRecordContext<Contact>();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  const [transcriptionText, setTranscriptionText] = useState("");
  const [analysisResult, setAnalysisResult] = useState<AnalysisResponse | null>(
    null,
  );

  const { mutate: analyze, isPending } = useMutation({
    mutationFn: () =>
      (dataProvider as any).analyzeMeeting({
        transcription_text: transcriptionText,
        calendar_event_id: calendarEventId || null,
        contact_id: record?.id || null,
        company_id: record?.company_id || null,
      }),
    onSuccess: (data: AnalysisResponse) => {
      setAnalysisResult(data);
      notify(`Analys klar! ${data.tasks_created} uppgifter skapade.`, {
        type: "success",
      });
      refresh();
    },
    onError: (error: Error) => {
      notify(`Analys misslyckades: ${error.message}`, { type: "error" });
    },
  });

  const handleClose = () => {
    setOpen(false);
    setTranscriptionText("");
    setAnalysisResult(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => (v ? setOpen(true) : handleClose())}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Brain className="w-4 h-4 mr-1.5" />
          Analysera möte
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Analysera mötesanteckningar</DialogTitle>
          <DialogDescription>
            Klistra in mötesanteckningar eller transkribering. AI analyserar och
            skapar automatiskt uppgifter och offertunderlag.
          </DialogDescription>
        </DialogHeader>

        {!analysisResult ? (
          <div className="space-y-4">
            <Textarea
              value={transcriptionText}
              onChange={(e) => setTranscriptionText(e.target.value)}
              placeholder="Klistra in mötesanteckningar, transkribering eller sammanfattning här..."
              rows={12}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Minst 50 tecken krävs. Ju mer detaljer, desto bättre analys.
            </p>
          </div>
        ) : (
          <MeetingAnalysisCard
            analysis={analysisResult.analysis}
            tasksCreated={analysisResult.tasks_created}
          />
        )}

        <DialogFooter>
          {!analysisResult ? (
            <>
              <Button variant="outline" onClick={handleClose}>
                Avbryt
              </Button>
              <Button
                onClick={() => analyze()}
                disabled={transcriptionText.trim().length < 50 || isPending}
              >
                <Brain className="w-4 h-4 mr-1.5" />
                {isPending ? "Analyserar..." : "Analysera"}
              </Button>
            </>
          ) : (
            <Button onClick={handleClose}>Stäng</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
