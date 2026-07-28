import { useRef, useState } from "react";
import { Radar, Square } from "lucide-react";
import { useNotify, useRefresh } from "ra-core";
import { Button } from "@/components/ui/button";
import { supabase } from "../providers/supabase/supabase";

/**
 * "Scanna alla" — batch-scannar alla företag med hemsida som saknar en scan
 * nyare än 30 dagar, direkt från CRM:et (inget terminal-/CLI-steg). Kör
 * sekventiellt mot Axona Scanners /api/scan med användarens JWT; varje scan
 * tar ~1 minut och fliken måste vara öppen tills batchen är klar (eller
 * stoppas — omstart fortsätter där den slutade, dedupe sköts av urvalet).
 * Cronen (var 10:e min) tar annars backloggen automatiskt.
 */
const SCANNER_URL =
  import.meta.env.VITE_SCANNER_URL ?? "https://axona-scanner.vercel.app";
const FRESH_DAYS = 30;

export const BatchScanButton = () => {
  const notify = useNotify();
  const refresh = useRefresh();
  const [progress, setProgress] = useState<string | null>(null);
  const stopRef = useRef(false);

  const run = async () => {
    setProgress("Hämtar lista…");
    stopRef.current = false;
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Ingen inloggad session");

      const since = new Date(
        Date.now() - FRESH_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();
      const [{ data: companies, error: companiesError }, { data: fresh }] =
        await Promise.all([
          supabase
            .from("companies")
            .select("id, name")
            .not("website", "is", null)
            .order("created_at", { ascending: false })
            .limit(500),
          supabase
            .from("scanner_scans")
            .select("company_id")
            .gte("scanned_at", since),
        ]);
      if (companiesError) throw companiesError;

      const freshIds = new Set(
        (fresh ?? []).map((row) => row.company_id).filter(Boolean),
      );
      const queue = (companies ?? []).filter(
        (company) => !freshIds.has(company.id),
      );
      if (queue.length === 0) {
        notify("Alla företag har redan färska scans", { type: "info" });
        setProgress(null);
        return;
      }

      let done = 0;
      let failed = 0;
      for (const company of queue) {
        if (stopRef.current) break;
        setProgress(`${done + failed + 1}/${queue.length}: ${company.name}`);
        try {
          const response = await fetch(`${SCANNER_URL}/api/scan`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ company_id: company.id }),
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          done++;
        } catch {
          failed++;
        }
      }

      notify(
        stopRef.current
          ? `Batch stoppad: ${done} scannade, ${failed} fel — klicka igen för att fortsätta`
          : `Batch klar: ${done} scannade${failed ? `, ${failed} fel` : ""}`,
        { type: failed > done ? "warning" : "success" },
      );
      refresh();
    } catch (error) {
      notify(
        `Batch misslyckades: ${error instanceof Error ? error.message : error}`,
        { type: "error" },
      );
    } finally {
      setProgress(null);
    }
  };

  if (progress) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          stopRef.current = true;
        }}
      >
        <Square className="w-4 h-4 mr-1.5" />
        {progress} — stoppa
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={run}>
      <Radar className="w-4 h-4 mr-1.5" />
      Scanna alla
    </Button>
  );
};
