/**
 * Phase 7 helpers for the QuotePipelineView UI.
 *
 * Keeps pure data-shaping logic out of the React component so it can be
 * unit tested in isolation. The component imports everything from here
 * and stays focused on rendering.
 */

export type PipelineStepStatus =
  | "running"
  | "success"
  | "failed"
  | "skipped"
  | "pending";

export interface RawPipelineStepRow {
  id: number;
  quote_id: number;
  step_name: string;
  status: "running" | "success" | "failed" | "skipped";
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  error_details: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}

export interface PipelineStepView {
  /** Canonical step identifier from constants.PIPELINE_STEP. */
  stepName: string;
  /** Human-readable label rendered in the UI. */
  label: string;
  /** Latest status for this step across all logged rows. */
  status: PipelineStepStatus;
  /** Latest duration in ms, or null when the step has not completed. */
  durationMs: number | null;
  /** ISO timestamp of the latest `started_at` for this step. */
  startedAt: string | null;
  /** ISO timestamp of the latest `completed_at`, or null when still running. */
  completedAt: string | null;
  /** Latest error message string if status is failed. */
  errorMessage: string | null;
  /** Latest error_details JSON if status is failed. */
  errorDetails: Record<string, unknown> | null;
  /** Latest metadata JSON for the step (may include trigger source, etc.). */
  metadata: Record<string, unknown> | null;
  /** Number of attempts logged for this step. Useful to show retry count. */
  attemptCount: number;
}

/**
 * Canonical ordering of pipeline steps in the UI. Mirrors PIPELINE_STEP
 * from the backend constants — if a step exists in the DB but not here,
 * it still renders (appended at the end) so future steps surface
 * automatically without a UI change.
 */
export const PIPELINE_STEP_ORDER: readonly string[] = [
  "validate_deal",
  "create_quote",
  "generate_text",
  "normalize_sections",
  "generate_pdf",
  "discord_notify",
  "approve_proposal",
  "docuseal_submit",
  "send_email",
  "webhook_signed",
];

/** Human-readable labels. Falls back to a capitalized step_name. */
export const PIPELINE_STEP_LABELS: Record<string, string> = {
  validate_deal: "Validate deal",
  create_quote: "Create quote",
  generate_text: "Generate AI text",
  normalize_sections: "Normalize sections",
  generate_pdf: "Generate PDF",
  discord_notify: "Notify Discord",
  approve_proposal: "Approve proposal",
  docuseal_submit: "DocuSeal submit",
  send_email: "Send email",
  webhook_signed: "Webhook: signed",
};

export function humanizeStepName(stepName: string): string {
  return (
    PIPELINE_STEP_LABELS[stepName] ??
    stepName.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/**
 * Collapse raw rows (one per attempt) into one view per step_name.
 *
 * The latest row per step_name wins. Steps present in the canonical
 * PIPELINE_STEP_ORDER but missing from the raw rows are rendered with
 * status="pending" so the UI shows the full expected flow rather than
 * only the subset that has run so far.
 */
export function buildPipelineStepViews(
  rows: readonly RawPipelineStepRow[],
): PipelineStepView[] {
  // Group rows by step_name and pick the latest started_at per group.
  const byStep = new Map<string, RawPipelineStepRow[]>();
  for (const row of rows) {
    const bucket = byStep.get(row.step_name);
    if (bucket) {
      bucket.push(row);
    } else {
      byStep.set(row.step_name, [row]);
    }
  }

  function latestOf(stepRows: RawPipelineStepRow[]): RawPipelineStepRow {
    return stepRows.reduce((latest, row) =>
      row.started_at > latest.started_at ? row : latest,
    );
  }

  function toView(
    stepName: string,
    stepRows: RawPipelineStepRow[] | undefined,
  ): PipelineStepView {
    if (!stepRows || stepRows.length === 0) {
      return {
        stepName,
        label: humanizeStepName(stepName),
        status: "pending",
        durationMs: null,
        startedAt: null,
        completedAt: null,
        errorMessage: null,
        errorDetails: null,
        metadata: null,
        attemptCount: 0,
      };
    }
    const latest = latestOf(stepRows);
    return {
      stepName,
      label: humanizeStepName(stepName),
      status: latest.status as PipelineStepStatus,
      durationMs: latest.duration_ms,
      startedAt: latest.started_at,
      completedAt: latest.completed_at,
      errorMessage: latest.error_message,
      errorDetails: latest.error_details,
      metadata: latest.metadata,
      attemptCount: stepRows.length,
    };
  }

  const orderedViews: PipelineStepView[] = PIPELINE_STEP_ORDER.map((stepName) =>
    toView(stepName, byStep.get(stepName)),
  );

  // Append any DB-only step names we did not know about at build time
  // (forward compatibility for new steps added by future phases).
  for (const [stepName, stepRows] of byStep.entries()) {
    if (!PIPELINE_STEP_ORDER.includes(stepName)) {
      orderedViews.push(toView(stepName, stepRows));
    }
  }

  return orderedViews;
}

export interface PipelineSummary {
  /** True if any step is currently running. Controls polling. */
  isRunning: boolean;
  /** Aggregate status shown in the collapsed header. */
  headline: string;
  /** First failed step, if any. Takes priority in the headline. */
  failedStep: PipelineStepView | null;
  /** Currently running step, if any. */
  runningStep: PipelineStepView | null;
  /** Latest successfully completed step, if nothing is running/failing. */
  latestCompletedStep: PipelineStepView | null;
}

/**
 * Derive the one-line header the collapsed pipeline section shows.
 * Priority order: failed > running > latest success > pending.
 */
export function summarizePipeline(
  views: readonly PipelineStepView[],
): PipelineSummary {
  const failedStep = views.find((v) => v.status === "failed") ?? null;
  const runningStep = views.find((v) => v.status === "running") ?? null;

  const successSteps = views.filter((v) => v.status === "success");
  const latestCompletedStep =
    successSteps.length > 0
      ? successSteps.reduce((latest, v) => {
          if (!latest.completedAt) return v;
          if (!v.completedAt) return latest;
          return v.completedAt > latest.completedAt ? v : latest;
        })
      : null;

  let headline: string;
  if (failedStep) {
    headline = `Failed at ${failedStep.label}`;
  } else if (runningStep) {
    headline = `Running: ${runningStep.label}`;
  } else if (latestCompletedStep) {
    const successCount = successSteps.length;
    headline = `${successCount} step${successCount === 1 ? "" : "s"} complete`;
  } else {
    headline = "No pipeline activity yet";
  }

  return {
    isRunning: runningStep != null,
    headline,
    failedStep,
    runningStep,
    latestCompletedStep,
  };
}

export function formatDurationMs(durationMs: number | null): string {
  if (durationMs == null) return "—";
  if (durationMs < 1000) return `${durationMs} ms`;
  const seconds = durationMs / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = seconds / 60;
  return `${minutes.toFixed(1)} min`;
}
