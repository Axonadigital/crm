import { useState } from "react";
import { useGetList, useLocaleState, useRecordContext } from "ra-core";
import { FileAudio, ExternalLink, Mic } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatRelativeDate } from "../misc/RelativeDate";
import type { Contact, MeetingTranscription } from "../types";
import { TranscriptionDetailDialog } from "./TranscriptionDetailDialog";

const sourceLabels: Record<string, string> = {
  fireflies: "Fireflies",
  manual: "Manuell",
  whisper: "Whisper",
  google_meet: "Google Meet",
};

export const ContactTranscriptions = () => {
  const record = useRecordContext<Contact>();
  const [locale = "sv"] = useLocaleState();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: transcriptions, isPending } = useGetList<MeetingTranscription>(
    "meeting_transcriptions",
    {
      pagination: { page: 1, perPage: 10 },
      sort: { field: "created_at", order: "DESC" },
      filter: { contact_id: record?.id },
    },
  );

  if (isPending) {
    return <div className="text-xs text-muted-foreground py-2">Laddar...</div>;
  }

  if (!transcriptions?.length) {
    return (
      <div className="text-xs text-muted-foreground py-2">
        Inga transkriptioner
      </div>
    );
  }

  const selected = transcriptions.find((t) => t.id === selectedId) ?? null;

  return (
    <>
      <div className="flex flex-col gap-1">
        {transcriptions.map((t) => {
          const title =
            t.fireflies_data?.title ??
            (t.analysis?.summary
              ? t.analysis.summary.slice(0, 60) + "..."
              : "Transkription");

          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedId(Number(t.id))}
              className="flex items-start gap-2 hover:bg-muted py-1.5 px-1 rounded transition-colors text-left w-full"
            >
              <FileAudio className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{title}</div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1 py-0 h-4"
                  >
                    {t.transcription_source === "fireflies" ? (
                      <Mic className="w-2.5 h-2.5 mr-0.5" />
                    ) : null}
                    {sourceLabels[t.transcription_source] ??
                      t.transcription_source}
                  </Badge>
                  <span>{formatRelativeDate(t.created_at, locale)}</span>
                  {t.analysis && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1 py-0 h-4"
                    >
                      Analyserad
                    </Badge>
                  )}
                </div>
              </div>
              {t.fireflies_data?.transcript_url && (
                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-1" />
              )}
            </button>
          );
        })}
      </div>

      <TranscriptionDetailDialog
        transcription={selected}
        open={selectedId !== null}
        onClose={() => setSelectedId(null)}
      />
    </>
  );
};
