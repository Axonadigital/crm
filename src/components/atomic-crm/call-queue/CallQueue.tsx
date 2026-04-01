import { useState } from "react";
import {
  useGetList,
  useRecordContext,
  useGetIdentity,
  useNotify,
  useRefresh,
  useDataProvider,
} from "ra-core";
import { Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Phone,
  Building2,
  Calendar,
  MapPin,
  Globe,
  ExternalLink,
  Save,
  X,
} from "lucide-react";
import type { CallLog, Company } from "../types";

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

const leadStatusBadgeVariant = (status: string) => {
  const variants: Record<
    string,
    "default" | "secondary" | "destructive" | "outline"
  > = {
    new: "secondary",
    contacted: "outline",
    interested: "default",
    callback_requested: "outline",
    meeting_booked: "default",
    not_interested: "destructive",
  };
  return variants[status] || "default";
};

const leadStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    new: "Ny",
    contacted: "Kontaktad",
    interested: "Intresserad",
    callback_requested: "Ring upp igen",
    meeting_booked: "Möte bokat",
    not_interested: "Inte intresserad",
  };
  return labels[status] || status;
};

export const CallQueue = () => {
  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Ringlista</h1>
      </div>
      <CallQueueContent />
    </div>
  );
};

/** Shared call queue content without wrapper padding/title — used by both desktop and mobile. */
export const CallQueueContent = () => {
  const [activeStatuses, setActiveStatuses] = useState<string[]>([
    "new",
    "contacted",
    "interested",
    "callback_requested",
  ]);

  const { data: companies, isPending } = useGetList<Company>("companies", {
    filter: {},
    sort: { field: "created_at", order: "DESC" },
    pagination: { page: 1, perPage: 100 },
  });

  const statusOptions: { value: string; label: string }[] = [
    { value: "new", label: "Ny" },
    { value: "contacted", label: "Kontaktad" },
    { value: "interested", label: "Intresserad" },
    { value: "callback_requested", label: "Ring upp igen" },
  ];
  const allStatusValues = statusOptions.map((status) => status.value);

  const activeStatusSet = new Set(activeStatuses);

  // Filter on client side for now (can be optimized with server-side filter later)
  const filteredCompanies = companies?.filter((company) =>
    activeStatusSet.has(company.lead_status),
  );

  const isFilterActive = (status: string) => activeStatuses.includes(status);

  const handleFilterToggle = (status: string) => {
    setActiveStatuses((prev) => {
      if (prev.includes(status)) {
        return prev.filter((item) => item !== status);
      }

      return [...prev, status];
    });
  };

  const showCalloutsOnly = () => {
    setActiveStatuses(["callback_requested"]);
  };

  const showColdLeadsOnly = () => {
    setActiveStatuses(["new"]);
  };

  if (isPending) {
    return <p>Laddar företag...</p>;
  }

  const hasResults = !!filteredCompanies && filteredCompanies.length > 0;
  const activeStatusNames = statusOptions
    .filter((status) => activeStatuses.includes(status.value))
    .map((status) => status.label);

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <Badge variant="outline" className="text-sm px-3 py-1">
          {filteredCompanies?.length || 0} företag att ringa
        </Badge>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setActiveStatuses(allStatusValues)}
        >
          Alla
        </Button>
        <Button size="sm" variant="outline" onClick={showColdLeadsOnly}>
          Kalla leads
        </Button>
        <Button size="sm" variant="outline" onClick={showCalloutsOnly}>
          Uppföljningar
        </Button>

        {statusOptions.map((status) => (
          <Button
            key={status.value}
            size="sm"
            variant={isFilterActive(status.value) ? "secondary" : "ghost"}
            onClick={() => handleFilterToggle(status.value)}
          >
            {status.label}
          </Button>
        ))}
      </div>

      {activeStatuses.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">
              Inga statusar valda i filtreringen.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setActiveStatuses(allStatusValues)}
              className="mt-4"
            >
              Visa alla ringlistestatusar
            </Button>
          </CardContent>
        </Card>
      ) : hasResults ? (
        <div className="grid gap-4">
          {filteredCompanies?.map((company) => (
            <CallQueueItem key={company.id} company={company} />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">
              Inga företag i ringlistan med valda filter.
              {activeStatusNames.length > 0 && (
                <> Valda statusar: {activeStatusNames.join(", ")}.</>
              )}
            </p>
            {companies && companies.length > 0 && (
              <p className="text-sm text-muted-foreground mt-2">
                Du har {companies.length} företag totalt, men inga med valda
                statusfilter.
              </p>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setActiveStatuses(allStatusValues)}
              className="mt-4"
            >
              Visa alla ringlistestatusar
            </Button>
          </CardContent>
        </Card>
      )}
    </>
  );
};

const CallQueueItem = ({ company }: { company: Company }) => {
  const [isCallModalOpen, setCallModalOpen] = useState(false);

  return (
    <>
      <Card className="hover:shadow-lg transition-shadow">
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="h-5 w-5 text-muted-foreground shrink-0" />
                <CardTitle className="text-xl truncate">
                  <Link
                    to={`/companies/${company.id}/show`}
                    className="hover:underline"
                  >
                    {company.name}
                  </Link>
                </CardTitle>
              </div>
              {company.lead_status && (
                <Badge variant={leadStatusBadgeVariant(company.lead_status)}>
                  {leadStatusLabel(company.lead_status)}
                </Badge>
              )}
            </div>
            <Button
              onClick={() => setCallModalOpen(true)}
              className="flex items-center gap-2"
            >
              <Phone className="h-4 w-4" />
              Ring nu
            </Button>
          </div>
        </CardHeader>

        <CardContent className="grid gap-3">
          {company.phone_number && (
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <a
                href={`tel:${company.phone_number}`}
                className="text-blue-600 hover:underline"
              >
                {company.phone_number}
              </a>
            </div>
          )}

          {company.website && (
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <a
                href={company.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline flex items-center gap-1"
              >
                {company.website.replace(/^https?:\/\//, "")}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}

          {(company.city || company.address) && (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {[company.address, company.city].filter(Boolean).join(", ")}
              </span>
            </div>
          )}

          {company.next_followup_date && (
            <div className="flex items-center gap-2 text-orange-600">
              <Calendar className="h-4 w-4" />
              <span className="text-sm font-medium">
                Följ upp:{" "}
                {new Date(company.next_followup_date).toLocaleDateString(
                  "sv-SE",
                )}
              </span>
            </div>
          )}

          {company.industry && (
            <Badge variant="outline" className="w-fit">
              {company.industry}
            </Badge>
          )}
        </CardContent>
      </Card>

      <CallLogDialog
        company={company}
        open={isCallModalOpen}
        onClose={() => setCallModalOpen(false)}
      />
    </>
  );
};

const CallLogDialog = ({
  company,
  open,
  onClose,
}: {
  company: Company;
  open: boolean;
  onClose: () => void;
}) => {
  const dataProvider =
    useDataProvider() as import("../../providers/supabase/dataProvider").CrmDataProvider;
  const notify = useNotify();
  const refresh = useRefresh();
  const [isSaving, setIsSaving] = useState(false);

  const [outcome, setOutcome] = useState<CallLog["call_outcome"]>("no_answer");
  const [notes, setNotes] = useState("");
  const [followupDate, setFollowupDate] = useState("");
  const [followupNote, setFollowupNote] = useState("");

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const followupTimestamp = followupDate
        ? new Date(followupDate).toISOString()
        : null;

      await dataProvider.logCall({
        company_id: Number(company.id),
        call_outcome: outcome,
        notes: notes || null,
        followup_date: followupTimestamp,
        followup_note: followupDate ? followupNote || null : null,
      });

      notify("Samtalslogg sparad", { type: "success" });
      refresh();
      onClose();
      resetForm();
    } catch (error) {
      notify(`Fel: ${error instanceof Error ? error.message : "Okänt fel"}`, {
        type: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    setOutcome("no_answer");
    setNotes("");
    setFollowupDate("");
    setFollowupNote("");
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Logga samtal - {company.name}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {company.phone_number && (
            <div className="flex items-center gap-2 text-lg">
              <Phone className="h-5 w-5 text-muted-foreground" />
              <a
                href={`tel:${company.phone_number}`}
                className="text-blue-600 hover:underline font-medium"
              >
                {company.phone_number}
              </a>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="outcome">Resultat *</Label>
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
              rows={4}
              placeholder="Vad hände under samtalet?"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="followup-date">Uppföljningsdatum (valbart)</Label>
            <input
              id="followup-date"
              type="datetime-local"
              value={followupDate}
              onChange={(e) => setFollowupDate(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {followupDate && (
            <div className="grid gap-2">
              <Label htmlFor="followup-note">Uppföljningsnotering</Label>
              <Textarea
                id="followup-note"
                value={followupNote}
                onChange={(e) => setFollowupNote(e.target.value)}
                rows={2}
                placeholder="Vad ska göras vid uppföljningen?"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            <X className="h-4 w-4 mr-2" />
            Avbryt
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? "Sparar..." : "Spara"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
