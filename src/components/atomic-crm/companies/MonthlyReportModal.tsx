import { useEffect, useState } from "react";
import { useDataProvider, useNotify } from "ra-core";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ClipboardCopy,
  Download,
  Eye,
  Loader2,
  Mail,
  Sparkles,
} from "lucide-react";

import type {
  Company,
  MonthlyReport,
  PresentationPolicy,
  ReportAiContent,
} from "../types";
import type { VisibilityDataProvider } from "./visibility/types";

/** Kundvända visningsreglage i granskningsvyn (label + förklaring). */
const PRESENTATION_TOGGLES: Array<{
  key: keyof PresentationPolicy;
  label: string;
  hint: string;
}> = [
  { key: "showClicks", label: "Klick", hint: "KPI-kort för klick från Google" },
  {
    key: "showImpressions",
    label: "Visningar",
    hint: "KPI-kort för visningar i sök",
  },
  {
    key: "showCtr",
    label: "Klickfrekvens",
    hint: "KPI-kort för andel som klickade",
  },
  {
    key: "showPositionAbsolute",
    label: "Snittposition (råtal)",
    hint: "Det exakta positionstalet, t.ex. 34,7",
  },
  {
    key: "showPerformanceScore",
    label: "Prestandapoäng",
    hint: "Rå Lighthouse-poäng (0–100)",
  },
  { key: "showLcp", label: "Laddtid", hint: "Rå laddtid i sekunder" },
  {
    key: "showPageExperience",
    label: "Sidupplevelse-tabell",
    hint: "LCP/INP/CLS/Lighthouse-tabellen i PDF:en",
  },
  {
    key: "showFourParts",
    label: "'Fyra delar'-översikt",
    hint: "Status-scorecard (röd 'Behöver åtgärdas')",
  },
  {
    key: "showMethodology",
    label: "Metodavsnitt",
    hint: "'Så ska rapporten läsas'-sidan",
  },
];

const TONE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "auto", label: "Auto (rekommenderas)" },
  { value: "celebrate", label: "Fira (skryt lite)" },
  { value: "balanced", label: "Balanserad" },
  { value: "reassure", label: "Trygg/försiktig" },
];

/**
 * Bygger ämnesrad + urklippsinnehåll för rapportmejlet. `html` är den
 * FAKTISKA genererade mejlmallen (samma som förhandsvisnings-iframen och
 * det som skulle skickas) — inte bara de redigerbara textfälten — så att
 * inklistring i Gmail ser likadan ut (rubrik, KPI-kort, layout). `text` är
 * en enkel textreserv för klienter som inte tar emot rik HTML vid inklistring.
 */
function buildEmailClipboard(
  company: Company,
  report: MonthlyReport,
  ai: ReportAiContent,
): { subject: string; text: string; html: string } {
  const periodLabel =
    report.view_model?.period.label ??
    `${report.data_period_start ?? ""} – ${report.data_period_end ?? ""}`;
  const subject = `Er synlighet i ${periodLabel} — ${company.name}`;

  const paragraphs = [
    ai.greeting,
    ai.summary,
    ai.recommended_action,
    ai.upsell_pitch,
  ].filter((p) => p && p.trim().length > 0);

  const text = paragraphs.join("\n\n");
  const html = report.generated_html ?? "";

  return { subject, text, html };
}

/** Skillnaden mellan editerad policy och auto-basen → minimal override-payload. */
function diffPresentation(
  base: PresentationPolicy,
  edited: PresentationPolicy,
): Partial<PresentationPolicy> {
  const out: Partial<PresentationPolicy> = {};
  (Object.keys(edited) as Array<keyof PresentationPolicy>).forEach((key) => {
    if (edited[key] !== base[key]) {
      (out as Record<string, unknown>)[key] = edited[key];
    }
  });
  return out;
}

/**
 * Månadsrapport-modal: generera draft → granska/redigera → skicka till kund.
 * Speglar CallLogFollowupModal. Edge-funktionen bygger om mail-HTML från
 * redigerad AI-text vid utskick (single source of truth).
 */

const PERIOD_PRESETS: Array<{ value: string; label: string }> = [
  { value: "this_month", label: "Denna månad (hittills)" },
  { value: "last_month", label: "Förra månaden" },
  { value: "last_2", label: "Senaste 2 månaderna" },
  { value: "quarter", label: "Senaste kvartalet (3 mån)" },
  { value: "half", label: "Senaste halvåret (6 mån)" },
  { value: "year", label: "Senaste året (12 mån)" },
  { value: "custom", label: "Eget månadsintervall" },
];

// Beräknar {period_start, period_end} (hela månader, UTC) för ett snabbval.
function computeReportPeriod(
  preset: string,
  customFrom: string,
  customTo: string,
): { period_start: string; period_end: string } | null {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const range = (backStart: number, backEnd: number) => ({
    period_start: new Date(Date.UTC(y, m + backStart, 1))
      .toISOString()
      .slice(0, 10),
    period_end: new Date(Date.UTC(y, m + backEnd + 1, 0))
      .toISOString()
      .slice(0, 10),
  });
  switch (preset) {
    case "this_month":
      return range(0, 0);
    case "last_month":
      return range(-1, -1);
    case "last_2":
      return range(-2, -1);
    case "quarter":
      return range(-3, -1);
    case "half":
      return range(-6, -1);
    case "year":
      return range(-12, -1);
    case "custom": {
      if (!customFrom || !customTo) return null;
      const [fy, fm] = customFrom.split("-").map(Number);
      const [ty, tm] = customTo.split("-").map(Number);
      if (!fy || !fm || !ty || !tm) return null;
      const start = new Date(Date.UTC(fy, fm - 1, 1));
      const end = new Date(Date.UTC(ty, tm, 0));
      if (start > end) return null;
      return {
        period_start: start.toISOString().slice(0, 10),
        period_end: end.toISOString().slice(0, 10),
      };
    }
    default:
      return range(-1, -1);
  }
}
export const MonthlyReportModal = ({
  company,
  reportId,
  open,
  onOpenChange,
  onSent,
  initialPeriod,
}: {
  company: Company;
  reportId?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent?: () => void;
  initialPeriod?: { start: string; end: string } | null;
}) => {
  const dataProvider = useDataProvider() as VisibilityDataProvider;
  const notify = useNotify();

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [periodPreset, setPeriodPreset] = useState("last_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  // Ny kund registrerad mitt i perioden → "föregående period" har bara
  // några dagars data och ger en missvisande jättesiffra. Hoppar då över
  // jämförelsen helt istället för att visa en falsk trend.
  const [skipComparison, setSkipComparison] = useState(false);
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [selectedUpsellService, setSelectedUpsellService] = useState("");
  const [ai, setAi] = useState<ReportAiContent>({
    greeting: "",
    summary: "",
    recommended_action: "",
    upsell_pitch: "",
  });
  // Auto-policyn (basen) + den editerbara effektiva policyn (bas ⊕ sparade val).
  const [presBase, setPresBase] = useState<PresentationPolicy | null>(null);
  const [presPolicy, setPresPolicy] = useState<PresentationPolicy | null>(null);

  // Initiera visningsreglagen när rapporten (om)laddas.
  useEffect(() => {
    const base = report?.view_model?.presentation ?? null;
    if (!base) {
      setPresBase(null);
      setPresPolicy(null);
      return;
    }
    setPresBase(base);
    setPresPolicy({ ...base, ...(report?.presentation_overrides ?? {}) });
  }, [report]);

  useEffect(() => {
    if (!open) return;
    if (!reportId) {
      setReport(null);
      setRecipientEmail("");
      if (initialPeriod?.start && initialPeriod.end) {
        setPeriodPreset("custom");
        setCustomFrom(initialPeriod.start.slice(0, 7));
        setCustomTo(initialPeriod.end.slice(0, 7));
      }
      return;
    }
    let active = true;
    dataProvider
      .getOne<MonthlyReport>("monthly_reports", { id: reportId })
      .then(({ data }) => {
        if (!active) return;
        setReport(data);
        setRecipientEmail(data.recipient_email ?? "");
        setSelectedUpsellService(
          data.ai_content?.recommended_service ??
            data.selected_upsells[0]?.service ??
            "",
        );
        if (data.ai_content) setAi(data.ai_content);
      })
      .catch((error) => {
        if (active) {
          notify(
            error instanceof Error
              ? error.message
              : "Kunde inte öppna rapporten",
            { type: "warning" },
          );
        }
      });
    return () => {
      active = false;
    };
  }, [
    dataProvider,
    initialPeriod?.end,
    initialPeriod?.start,
    notify,
    open,
    reportId,
  ]);

  const loadReport = async (id: number) => {
    const { data } = await dataProvider.getOne<MonthlyReport>(
      "monthly_reports",
      { id },
    );
    setReport(data);
    setRecipientEmail(data.recipient_email ?? "");
    setSelectedUpsellService(
      data.ai_content?.recommended_service ??
        data.selected_upsells[0]?.service ??
        "",
    );
    if (data.ai_content) setAi(data.ai_content);
    return data;
  };

  const handleGenerate = async (opts?: { force?: boolean }) => {
    // Omgenerering skriver helt ny AI-text (inkl. tömmer recommended_service)
    // — bevara ett manuellt val av "Rekommenderad huvudåtgärd" som gjordes
    // INNAN omgenereringen, så att det inte tyst försvinner när man tvingas
    // klicka "Generera om" för att låsa upp Skicka-knappen på en redan
    // skickad rapport.
    const priorRecommendedService =
      selectedUpsellService || ai.recommended_service;
    const reapplyPriorRecommendation = (data: MonthlyReport) => {
      if (!priorRecommendedService) return;
      const stillOffered = data.selected_upsells.find(
        (offer) => offer.service === priorRecommendedService,
      );
      if (!stillOffered) return;
      setSelectedUpsellService(stillOffered.service);
      setAi((current) => ({
        ...current,
        recommended_service: stillOffered.service,
        recommended_action: stillOffered.description,
        upsell_pitch: stillOffered.pitch,
      }));
    };
    // Vid omgenerering av en redan öppen rapport (t.ex. en redan skickad
    // period) används rapportens EGEN period — aldrig periodPreset-state,
    // som kan vara kvar från ett tidigare "ny rapport"-läge i samma modal.
    const period =
      opts?.force && report?.data_period_start && report?.data_period_end
        ? {
            period_start: report.data_period_start,
            period_end: report.data_period_end,
          }
        : computeReportPeriod(periodPreset, customFrom, customTo);
    if (!period) {
      notify(
        !customFrom || !customTo
          ? "Fyll i både från- och till-månad för eget intervall."
          : "Från-månaden måste vara samma som eller före till-månaden.",
        { type: "warning" },
      );
      return;
    }
    setIsGenerating(true);
    try {
      // Färska enmånadsrapporter med en ny analys av just den månaden. Förra
      // månaden använder edge-funktionens default (= föregående hela månad);
      // denna månad (hittills) kräver explicita datum för den pågående månaden,
      // precis som "Uppdatera (denna månad)" i Samlad synlighetsvy. Övriga
      // perioder aggregerar befintlig månadshistorik ("Hämta historik").
      // Forcerad omgenerering (redan skickad period) hämtar alltid färsk data
      // för samma period först — t.ex. en månad som skickades ofullständig.
      if (opts?.force || periodPreset === "this_month") {
        await dataProvider.analyzeWebsite(company.id, {
          window_kind: "calendar_month",
          start_date: period.period_start,
          end_date: period.period_end,
        });
      } else if (periodPreset === "last_month") {
        await dataProvider.analyzeWebsite(company.id, {
          window_kind: "calendar_month",
        });
      }
      const result = await dataProvider.generateMonthlyReport(company.id, {
        ...period,
        ...(opts?.force ? { force: true } : {}),
        ...(priorRecommendedService
          ? { recommended_service: priorRecommendedService }
          : {}),
        ...(skipComparison ? { skip_comparison: true } : {}),
      });
      if (result.status === "skipped_already_finalized" && result.report_id) {
        // Perioden är redan skickad — öppna den befintliga rapporten istället
        // för en död återvändsgränd. Varningsbannern + "Generera om med
        // aktuell data"-knappen (isFinalized-läget nedan) låter användaren
        // ändå skicka om, exakt som efterfrågat.
        notify(
          "En rapport för den här perioden finns redan och har skickats. Öppnar den — klicka 'Generera om med aktuell data' om du vill skicka en uppdaterad version.",
          { type: "warning" },
        );
        const data = await loadReport(result.report_id);
        reapplyPriorRecommendation(data);
        return;
      }
      if (!result.report_id || result.status.startsWith("skipped")) {
        notify(
          result.status === "skipped_no_snapshot"
            ? "Ingen månadsstatistik för perioden — kör 'Hämta historik' på Kund-fliken först."
            : `Rapporten kunde inte skapas (${result.status}).`,
          { type: "warning" },
        );
        return;
      }
      if (result.status.startsWith("failed")) {
        notify(
          "Kunde inte generera rapporttexten (AI-fel). Se rapportens felmeddelande eller försök igen.",
          { type: "error" },
        );
        return;
      }
      const data = await loadReport(result.report_id);
      reapplyPriorRecommendation(data);
      if (opts?.force) {
        notify("Rapporten omgenererad — granska och skicka igen.", {
          type: "info",
        });
      }
    } catch (error) {
      notify(
        `Fel: ${error instanceof Error ? error.message : "Kunde inte generera rapport"}`,
        { type: "error" },
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!report) return;
    try {
      const result = await dataProvider.getMonthlyReportPdf(report.id);
      window.open(result.signed_url, "_blank", "noopener,noreferrer");
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Kunde inte öppna PDF:en",
        { type: "warning" },
      );
    }
  };

  const handleCopyEmailText = async () => {
    if (!report) return;
    if (!report.generated_html) {
      notify(
        "Ingen förhandsvisning genererad än — klicka 'Uppdatera förhandsvisning' först.",
        { type: "warning" },
      );
      return;
    }
    const { subject, text, html } = buildEmailClipboard(company, report, ai);
    const clipboardText = `Ämne: ${subject}\n\n${text}`;
    try {
      if (typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": new Blob([clipboardText], { type: "text/plain" }),
            "text/html": new Blob([html], { type: "text/html" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(clipboardText);
      }
      notify(
        "Rapportmejlet kopierat — klistra in i Gmail, ändra ämne/text och bifoga PDF:en (Öppna PDF) själv.",
        { type: "info" },
      );
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Kunde inte kopiera rapportmejlet",
        { type: "warning" },
      );
    }
  };

  // Minimal override-payload (bara fält som avviker från auto-policyn).
  const presentationOverride =
    presBase && presPolicy ? diffPresentation(presBase, presPolicy) : undefined;

  const handlePreview = async () => {
    if (!report) return;
    setIsPreviewing(true);
    try {
      await dataProvider.previewMonthlyReport(report.id, {
        recipient_email: recipientEmail || undefined,
        ai_content: ai,
        presentation: presentationOverride,
      });
      await loadReport(report.id);
      notify("Förhandsvisning uppdaterad", { type: "info" });
    } catch (error) {
      notify(
        `Fel: ${error instanceof Error ? error.message : "Kunde inte uppdatera förhandsvisningen"}`,
        { type: "error" },
      );
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleSend = async () => {
    if (!report) return;
    if (!recipientEmail) {
      notify("Ange en mottagar-email innan du skickar.", { type: "warning" });
      return;
    }
    setIsSending(true);
    try {
      await dataProvider.sendMonthlyReport(report.id, {
        recipient_email: recipientEmail,
        ai_content: ai,
        presentation: presentationOverride,
      });
      notify(`Rapporten skickad till ${recipientEmail}`, { type: "success" });
      onSent?.();
      onOpenChange(false);
      setReport(null);
    } catch (error) {
      notify(
        `Fel: ${error instanceof Error ? error.message : "Kunde inte skicka rapporten"}`,
        { type: "error" },
      );
    } finally {
      setIsSending(false);
    }
  };

  const toneSelectValue =
    presPolicy && presBase && presPolicy.tone === presBase.tone
      ? "auto"
      : (presPolicy?.tone ?? "auto");

  const setToggle = (key: keyof PresentationPolicy, value: boolean) =>
    setPresPolicy((current) =>
      current ? { ...current, [key]: value } : current,
    );

  const setTone = (value: string) =>
    setPresPolicy((current) => {
      if (!current || !presBase) return current;
      return {
        ...current,
        tone:
          value === "auto"
            ? presBase.tone
            : (value as PresentationPolicy["tone"]),
      };
    });

  const upsell =
    report?.selected_upsells.find(
      (offer) => offer.service === selectedUpsellService,
    ) ?? report?.selected_upsells?.[0];
  const canSend = report?.status === "draft" || report?.status === "failed";
  const isFinalized =
    report?.status === "sent" || report?.status === "approved";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[640px] max-h-[90vh] grid-rows-[auto_1fr_auto] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Månadsrapport — {company.name}</DialogTitle>
          <DialogDescription>
            Generera, granska och skicka kundens månatliga synlighetsrapport.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto min-h-0 pr-1">
          {!report ? (
            <div className="flex flex-col gap-4 py-6">
              <div className="grid gap-2">
                <Label htmlFor="report-period">Rapportperiod</Label>
                <Select value={periodPreset} onValueChange={setPeriodPreset}>
                  <SelectTrigger id="report-period">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERIOD_PRESETS.map((preset) => (
                      <SelectItem key={preset.value} value={preset.value}>
                        {preset.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {periodPreset === "custom" ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="grid gap-1">
                      <Label htmlFor="period-from" className="text-xs">
                        Från månad
                      </Label>
                      <Input
                        id="period-from"
                        type="month"
                        value={customFrom}
                        onChange={(e) => setCustomFrom(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor="period-to" className="text-xs">
                        Till månad
                      </Label>
                      <Input
                        id="period-to"
                        type="month"
                        value={customTo}
                        onChange={(e) => setCustomTo(e.target.value)}
                      />
                    </div>
                  </div>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Flermånadersperioder summerar befintlig månadshistorik och
                  jämförs med föregående lika långa period. Saknas månader, kör
                  "Hämta historik" på Kund-fliken först.
                </p>
              </div>
              <div className="flex items-start gap-2">
                <Switch
                  id="skip-comparison"
                  checked={skipComparison}
                  onCheckedChange={setSkipComparison}
                />
                <Label
                  htmlFor="skip-comparison"
                  className="font-normal text-sm leading-tight"
                >
                  Ingen jämförelse mot föregående period — för nya kunder där
                  föregående period bara har ett par dagars data och annars ger
                  en missvisande jättesiffra.
                </Label>
              </div>
              <Button
                className="self-start"
                onClick={handleGenerate}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {isGenerating ? "Genererar (~1 min)…" : "Generera rapport"}
              </Button>
            </div>
          ) : (
            <div className="grid gap-5 py-4">
              {isFinalized ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  {report.status === "sent"
                    ? `Denna rapport skickades ${
                        report.sent_at
                          ? new Date(report.sent_at).toLocaleDateString("sv-SE")
                          : "tidigare"
                      } till ${report.recipient_email ?? "okänd mottagare"}. Generera om med aktuell data om du vill skicka en uppdaterad version.`
                    : "Rapporten behandlas just nu (godkänd, utskick pågår)."}
                </div>
              ) : null}
              <div className="grid gap-2">
                <Label htmlFor="report-recipient">Mottagare (e-post)</Label>
                <Input
                  id="report-recipient"
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="kontakt@kund.se"
                />
                {!recipientEmail && (
                  <p className="text-xs text-orange-600">
                    Ingen kontakt-email hittades automatiskt — ange en innan du
                    skickar.
                  </p>
                )}
              </div>

              {upsell && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">
                    Föreslagen upsell:
                  </span>
                  <Badge variant="outline">💡 {upsell.label}</Badge>
                </div>
              )}

              {report.selected_upsells.length > 0 ? (
                <div className="grid gap-2">
                  <Label htmlFor="report-recommendation">
                    Rekommenderad huvudåtgärd
                  </Label>
                  <Select
                    value={upsell?.service}
                    onValueChange={(service) => {
                      const selected = report.selected_upsells.find(
                        (offer) => offer.service === service,
                      );
                      if (!selected) return;
                      setSelectedUpsellService(service);
                      setAi((current) => ({
                        ...current,
                        recommended_action: selected.description,
                        upsell_pitch: selected.pitch,
                        recommended_service: selected.service,
                      }));
                    }}
                  >
                    <SelectTrigger id="report-recommendation">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {report.selected_upsells.map((offer) => (
                        <SelectItem key={offer.service} value={offer.service}>
                          {offer.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {report.view_model ? (
                <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                  <p className="font-medium">Rapportunderlag</p>
                  <p className="mt-1 text-muted-foreground">
                    Period {report.view_model.period.start}–{" "}
                    {report.view_model.period.end} ·{" "}
                    {report.view_model.coverage.available}/
                    {report.view_model.coverage.total} datakällor
                  </p>
                </div>
              ) : null}

              {report.view_model?.periodCoverage &&
              !report.view_model.periodCoverage.complete ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  Endast {report.view_model.periodCoverage.monthsFound} av{" "}
                  {report.view_model.periodCoverage.monthsRequested} månader i
                  perioden har mätdata — siffrorna nedan speglar INTE hela
                  perioden. Kör "Hämta historik" på Kund-fliken och generera om.
                </div>
              ) : null}

              <div className="grid gap-3 border-t pt-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Mail className="h-4 w-4" />
                  Mailtext (redigerbar)
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ai-greeting">Hälsning</Label>
                  <Input
                    id="ai-greeting"
                    value={ai.greeting}
                    onChange={(e) => setAi({ ...ai, greeting: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ai-summary">Sammanfattning</Label>
                  <Textarea
                    id="ai-summary"
                    rows={3}
                    value={ai.summary}
                    onChange={(e) => setAi({ ...ai, summary: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ai-action">Rekommenderad åtgärd</Label>
                  <Textarea
                    id="ai-action"
                    rows={2}
                    value={ai.recommended_action}
                    onChange={(e) =>
                      setAi({ ...ai, recommended_action: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ai-pitch">Motivering (upsell)</Label>
                  <Textarea
                    id="ai-pitch"
                    rows={2}
                    value={ai.upsell_pitch}
                    onChange={(e) =>
                      setAi({ ...ai, upsell_pitch: e.target.value })
                    }
                  />
                </div>
              </div>

              {presPolicy && presBase ? (
                <Accordion type="single" collapsible className="border-t pt-2">
                  <AccordionItem value="visningsregler" className="border-0">
                    <AccordionTrigger className="text-sm font-medium">
                      Visningsregler (avancerat)
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="grid gap-4 pt-1">
                        <p className="text-xs text-muted-foreground">
                          Reglerna är förinställda automatiskt — svaga,
                          Axona-ägda siffror döljs och rapporten leder med det
                          positiva. Justera vid behov och klicka "Uppdatera
                          förhandsvisning".
                        </p>
                        <div className="grid gap-2">
                          <Label htmlFor="report-tone">Ton</Label>
                          <Select
                            value={toneSelectValue}
                            onValueChange={setTone}
                          >
                            <SelectTrigger id="report-tone">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TONE_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {PRESENTATION_TOGGLES.map((toggle) => (
                            <div
                              key={toggle.key}
                              className="flex items-start justify-between gap-3 rounded-md border p-3"
                            >
                              <div className="grid gap-0.5">
                                <span className="text-sm font-medium">
                                  {toggle.label}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {toggle.hint}
                                </span>
                              </div>
                              <Switch
                                checked={Boolean(presPolicy[toggle.key])}
                                onCheckedChange={(value) =>
                                  setToggle(toggle.key, value)
                                }
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              ) : null}

              {report.generated_html && (
                <div className="grid gap-2 border-t pt-4">
                  <div className="flex items-center justify-between gap-2">
                    <Label>Förhandsvisning (draft)</Label>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleCopyEmailText}
                      >
                        <ClipboardCopy className="h-4 w-4" />
                        Kopiera rapportmejl
                      </Button>
                      {canSend ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handlePreview}
                          disabled={isPreviewing}
                        >
                          {isPreviewing ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                          Uppdatera förhandsvisning
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <iframe
                    title="Förhandsvisning av rapportmail"
                    srcDoc={report.generated_html}
                    className="w-full h-64 sm:h-80 rounded-md border bg-white"
                  />
                  <p className="text-xs text-muted-foreground">
                    Text- och visningsändringar tillämpas i förhandsvisningen
                    när du klickar "Uppdatera förhandsvisning", och alltid vid
                    utskick. "Kopiera rapportmejl" kopierar precis det som visas
                    ovan (rubrik, KPI-kort, layout) formaterat, så det klistras
                    in snyggt i t.ex. Gmail — bifoga PDF:en manuellt via "Öppna
                    PDF".
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {report && (
            <>
              {report.pdf_storage_path ? (
                <Button variant="outline" onClick={handleDownloadPdf}>
                  <Download className="h-4 w-4" />
                  Öppna PDF
                </Button>
              ) : null}
              {canSend ? (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => handleGenerate()}
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    Generera om
                  </Button>
                  <Button
                    onClick={handleSend}
                    disabled={isSending || !recipientEmail}
                  >
                    {isSending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Mail className="h-4 w-4" />
                    )}
                    {isSending ? "Skickar..." : "Skicka till kund"}
                  </Button>
                </>
              ) : report.status === "sent" ? (
                <>
                  <Badge variant="outline">Redan skickad</Badge>
                  <Button
                    variant="outline"
                    onClick={() => handleGenerate({ force: true })}
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    Generera om med aktuell data
                  </Button>
                </>
              ) : (
                <Badge variant="outline">Rapporten behandlas</Badge>
              )}
            </>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Stäng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
