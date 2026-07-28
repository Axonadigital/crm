import { Radar, ExternalLink } from "lucide-react";
import { useNotify, useRecordContext, useRefresh } from "ra-core";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { supabase } from "../providers/supabase/supabase";
import type { Company } from "../types";

/**
 * "Scanna hemsida" — kör Axona Scanner (separat Vercel-app) mot företagets
 * sajt och öppnar den delbara rapporten. Scannern autentiserar CRM-användarens
 * JWT mot vår Supabase, så ingen hemlighet behövs i frontend.
 * Resultatet landar i scanner_scans + companies.website_score.
 */
const SCANNER_URL =
  import.meta.env.VITE_SCANNER_URL ?? "https://axona-scanner.vercel.app";

export const ScanWebsiteButton = () => {
  const record = useRecordContext<Company>();
  const notify = useNotify();
  const refresh = useRefresh();

  const { data: latestScan } = useQuery({
    queryKey: ["scanner_scans", record?.id],
    enabled: record?.id != null,
    queryFn: async () => {
      const { data } = await supabase
        .from("scanner_scans")
        .select("report_slug, total_score, scanned_at")
        .eq("company_id", record!.id)
        .order("scanned_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ?? null;
    },
  });

  const { mutate: scan, isPending } = useMutation({
    mutationFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Ingen inloggad session");
      const response = await fetch(`${SCANNER_URL}/api/scan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ company_id: record!.id }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `HTTP ${response.status}`);
      }
      return (await response.json()) as {
        total_score: number;
        report_url: string;
      };
    },
    onSuccess: (result) => {
      notify(`Scan klar: ${result.total_score}/100`, { type: "success" });
      window.open(result.report_url, "_blank", "noopener");
      refresh();
    },
    onError: (error: Error) => {
      notify(`Scan misslyckades: ${error.message}`, { type: "error" });
    },
  });

  if (!record?.website) return null;

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        disabled={isPending}
        onClick={() => scan()}
      >
        <Radar className="w-4 h-4 mr-1.5" />
        {isPending ? "Scannar… (tar ~1 min)" : "Scanna hemsida"}
      </Button>
      {latestScan && (
        <a
          href={`${SCANNER_URL}/r/${latestScan.report_slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-muted-foreground underline hover:no-underline"
        >
          <ExternalLink className="w-3 h-3" />
          Rapport {latestScan.scanned_at.slice(0, 10)} (
          {latestScan.total_score}/100)
        </a>
      )}
    </div>
  );
};
