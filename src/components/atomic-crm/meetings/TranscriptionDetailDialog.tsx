import { Brain, ExternalLink, Headphones, Clock } from "lucide-react";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Contact, MeetingTranscription } from "../types";
import type { CrmDataProvider } from "../providers/supabase/dataProvider";
import { MeetingAnalysisCard } from "./MeetingAnalysisCard";

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return `${hrs}h ${remainMins}m`;
  }
  return `${mins}m ${secs}s`;
}

export const TranscriptionDetailDialog = ({
  transcription,
  open,
  onClose,
}: {
  transcription: MeetingTranscription | null;
  open: boolean;
  onClose: () => void;
}) => {
  const record = useRecordContext<Contact>();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const refresh = useRefresh();

  const { mutate: reanalyze, isPending } = useMutation({
    mutationFn: () =>
      (dataProvider as any).analyzeMeeting({
        transcription_id: transcription?.id,
        contact_id: record?.id || null,
        company_id: record?.company_id || null,
      }),
    onSuccess: (data: { tasks_created: number }) => {
      notify(`Analys klar! ${data.tasks_created} uppgifter skapade.`, {
        type: "success",
      });
      refresh();
      onClose();
    },
    onError: (error: Error) => {
      notify(`Analys misslyckades: ${error.message}`, { type: "error" });
    },
  });

  if (!transcription) return null;

  const fireflies = transcription.fireflies_data;
  const hasAnalysis = !!transcription.analysis;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {fireflies?.title ?? "Transkription"}
            <Badge variant="outline" className="text-xs">
              {transcription.transcription_source}
            </Badge>
          </DialogTitle>
          {fireflies && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
              {fireflies.duration > 0 && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {formatDuration(fireflies.duration)}
                </span>
              )}
              {fireflies.meeting_attendees?.length > 0 && (
                <span>
                  {fireflies.meeting_attendees
                    .map((a) => a.displayName || a.email)
                    .join(", ")}
                </span>
              )}
            </div>
          )}
        </DialogHeader>

        <Tabs defaultValue={hasAnalysis ? "analysis" : "transcript"}>
          <TabsList>
            <TabsTrigger value="transcript">Transkription</TabsTrigger>
            {hasAnalysis && <TabsTrigger value="analysis">Analys</TabsTrigger>}
          </TabsList>

          <TabsContent value="transcript" className="mt-3">
            <div className="bg-muted/50 rounded-md p-4 max-h-[50vh] overflow-y-auto">
              <pre className="text-sm whitespace-pre-wrap font-mono leading-relaxed">
                {transcription.transcription_text}
              </pre>
            </div>
          </TabsContent>

          {hasAnalysis && transcription.analysis && (
            <TabsContent value="analysis" className="mt-3">
              <MeetingAnalysisCard
                analysis={transcription.analysis}
                tasksCreated={0}
              />
            </TabsContent>
          )}
        </Tabs>

        {fireflies && (
          <>
            <Separator />
            <div className="flex items-center gap-2">
              {fireflies.transcript_url && (
                <a
                  href={fireflies.transcript_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" size="sm">
                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                    Visa i Fireflies
                  </Button>
                </a>
              )}
              {fireflies.audio_url && (
                <a
                  href={fireflies.audio_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" size="sm">
                    <Headphones className="w-3.5 h-3.5 mr-1.5" />
                    Lyssna
                  </Button>
                </a>
              )}
            </div>
          </>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => reanalyze()}
            disabled={isPending}
          >
            <Brain className="w-4 h-4 mr-1.5" />
            {isPending
              ? "Analyserar..."
              : hasAnalysis
                ? "Analysera igen"
                : "Analysera med AI"}
          </Button>
          <Button onClick={onClose}>Stäng</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
