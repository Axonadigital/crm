import { useState } from "react";
import {
  Download,
  Search,
  Check,
  Clock,
  ExternalLink,
  Mic,
} from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import type { Contact } from "../types";
import type { CrmDataProvider } from "../providers/supabase/dataProvider";

interface FirefliesMatch {
  fireflies_id: string;
  title: string | null;
  date: string | null;
  duration: number | null;
  transcript_url: string | null;
  short_summary: string | null;
  attendees: Array<{ name: string; email: string }>;
  match_type: string;
  matched: boolean;
  already_imported: boolean;
  linked_to_contact: boolean;
}

interface SearchResult {
  contact: {
    id: number;
    name: string;
    emails: string[];
    company_name: string | null;
  };
  matches: FirefliesMatch[];
  total_searched: number;
}

const matchTypeLabels: Record<string, string> = {
  email: "E-post",
  name: "Namn",
  name_in_title: "Namn i titel",
  company: "Företag",
};

function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hours}h ${remainMins}m`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("sv-SE", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

export const FetchFirefliesDialog = () => {
  const record = useRecordContext<Contact>();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);

  const { mutate: search, isPending: isSearching } = useMutation({
    mutationFn: () => dataProvider.fetchFirefliesTranscripts(record!.id),
    onSuccess: (data: SearchResult) => {
      setSearchResult(data);
      if (data.matches.length === 0) {
        notify("Inga matchande transkriptioner hittades i Fireflies.", {
          type: "info",
        });
      }
    },
    onError: (error: Error) => {
      notify(`Sokning misslyckades: ${error.message}`, { type: "error" });
    },
  });

  const { mutate: importTranscript } = useMutation({
    mutationFn: (firefliesMeetingId: string) =>
      dataProvider.importFirefliesTranscript(record!.id, firefliesMeetingId),
    onSuccess: (_data, firefliesMeetingId) => {
      notify("Transkription importerad! AI-analys kors i bakgrunden.", {
        type: "success",
      });
      // Update local state to reflect import
      setSearchResult((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          matches: prev.matches.map((m) =>
            m.fireflies_id === firefliesMeetingId
              ? { ...m, already_imported: true, linked_to_contact: true }
              : m,
          ),
        };
      });
      setImportingId(null);
      refresh();
    },
    onError: (error: Error) => {
      notify(`Import misslyckades: ${error.message}`, { type: "error" });
      setImportingId(null);
    },
  });

  const handleImport = (firefliesMeetingId: string) => {
    setImportingId(firefliesMeetingId);
    importTranscript(firefliesMeetingId);
  };

  const handleClose = () => {
    setOpen(false);
    setSearchResult(null);
    setImportingId(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => (v ? setOpen(true) : handleClose())}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Mic className="w-4 h-4 mr-1.5" />
          Hamta fran Fireflies
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Hamta transkriptioner fran Fireflies</DialogTitle>
          <DialogDescription>
            Soker bland dina senaste Fireflies-moten efter transkriptioner som
            matchar denna kontakts e-post, namn eller foretag.
          </DialogDescription>
        </DialogHeader>

        {!searchResult ? (
          <div className="py-8 text-center">
            <Mic className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground mb-4">
              Klicka pa Sok for att hamta matchande transkriptioner fran
              Fireflies.
            </p>
            <Button onClick={() => search()} disabled={isSearching}>
              <Search className="w-4 h-4 mr-1.5" />
              {isSearching ? "Soker..." : "Sok i Fireflies"}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground mb-3">
              Sokte genom {searchResult.total_searched} transkriptioner.
              {searchResult.matches.length > 0
                ? ` Hittade ${searchResult.matches.length} matchande.`
                : " Inga matchningar."}
              {searchResult.contact.company_name && (
                <span>
                  {" "}
                  Matchade mot: {searchResult.contact.name},{" "}
                  {searchResult.contact.company_name}
                  {searchResult.contact.emails.length > 0 &&
                    `, ${searchResult.contact.emails.join(", ")}`}
                </span>
              )}
            </div>

            {searchResult.matches.length === 0 && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Inga transkriptioner i Fireflies matchade denna kontakt.
                <br />
                Kontrollera att kontaktens e-post, namn eller foretag ar
                korrekt.
              </div>
            )}

            {searchResult.matches.map((match) => (
              <div
                key={match.fireflies_id}
                className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <Mic className="w-5 h-5 mt-0.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm truncate">
                      {match.title || "Utan titel"}
                    </span>
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 h-4 shrink-0"
                    >
                      {matchTypeLabels[match.match_type] || match.match_type}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    {match.date && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(match.date)}
                      </span>
                    )}
                    {match.duration && (
                      <span>{formatDuration(match.duration)}</span>
                    )}
                    {match.transcript_url && (
                      <a
                        href={match.transcript_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-0.5 text-blue-600 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="w-3 h-3" />
                        Fireflies
                      </a>
                    )}
                  </div>

                  {match.short_summary && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {match.short_summary}
                    </p>
                  )}

                  {match.attendees.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {match.attendees.slice(0, 4).map((a, i) => (
                        <Badge
                          key={i}
                          variant="secondary"
                          className="text-[10px] px-1 py-0 h-4"
                        >
                          {a.name || a.email}
                        </Badge>
                      ))}
                      {match.attendees.length > 4 && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1 py-0 h-4"
                        >
                          +{match.attendees.length - 4}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>

                <div className="shrink-0">
                  {match.linked_to_contact ? (
                    <Badge
                      variant="secondary"
                      className="text-xs flex items-center gap-1"
                    >
                      <Check className="w-3 h-3" />
                      Kopplad
                    </Badge>
                  ) : match.already_imported ? (
                    <Badge
                      variant="outline"
                      className="text-xs flex items-center gap-1"
                    >
                      <Check className="w-3 h-3" />
                      Importerad
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleImport(match.fireflies_id)}
                      disabled={importingId === match.fireflies_id}
                    >
                      <Download className="w-3.5 h-3.5 mr-1" />
                      {importingId === match.fireflies_id
                        ? "Importerar..."
                        : "Importera"}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          {searchResult && (
            <Button
              variant="outline"
              onClick={() => {
                setSearchResult(null);
                search();
              }}
              disabled={isSearching}
            >
              <Search className="w-4 h-4 mr-1.5" />
              Sok igen
            </Button>
          )}
          <Button variant="outline" onClick={handleClose}>
            Stang
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
