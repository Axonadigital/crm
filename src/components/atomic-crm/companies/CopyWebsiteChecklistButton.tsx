import { Button } from "@/components/ui/button";
import { ClipboardCheck, Loader2 } from "lucide-react";
import { useState } from "react";
import { useNotify } from "ra-core";

import type { WebsiteSnapshot } from "../types";
import { buildWebsiteChecklist } from "./buildWebsiteChecklist";

/**
 * Copies a full website action checklist (all snapshot statistics + prioritised,
 * concrete remediation steps + raw JSON) as markdown to the clipboard — meant to
 * be pasted into Claude with the customer's website repo open to fix the issues.
 * The snapshot is already loaded by WebsiteStatsSection, so the build is sync.
 */
export const CopyWebsiteChecklistButton = ({
  companyName,
  websiteUrl,
  snapshot,
  previousSnapshot,
}: {
  companyName: string;
  websiteUrl?: string | null;
  snapshot: WebsiteSnapshot | null | undefined;
  previousSnapshot?: WebsiteSnapshot | null;
}) => {
  const notify = useNotify();
  const [loading, setLoading] = useState(false);

  const hasFindings = Boolean(snapshot?.findings?.length);

  const handleCopy = async () => {
    if (!snapshot) return;
    setLoading(true);
    try {
      const markdown = buildWebsiteChecklist({
        companyName,
        websiteUrl,
        snapshot,
        previousSnapshot,
      });
      await navigator.clipboard.writeText(markdown);
      notify("Åtgärdschecklista kopierad — klistra in i Claude", {
        type: "info",
      });
    } catch (error) {
      console.error("Could not copy website checklist:", error);
      notify("Kunde inte kopiera åtgärdschecklistan", { type: "warning" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      onClick={handleCopy}
      disabled={loading || !hasFindings}
      title={
        hasFindings
          ? "Kopierar all statistik + konkreta åtgärder som markdown för Claude"
          : "Ingen analys med brister att bygga checklista av ännu"
      }
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <ClipboardCheck className="size-4" />
      )}
      Åtgärdschecklista
    </Button>
  );
};
