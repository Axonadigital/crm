import { describe, expect, it } from "vitest";
import {
  buildPipelineStepViews,
  formatDurationMs,
  humanizeStepName,
  PIPELINE_STEP_ORDER,
  type RawPipelineStepRow,
  summarizePipeline,
} from "./quotePipeline";

function makeRow(
  overrides: Partial<RawPipelineStepRow> & {
    step_name: string;
    status: RawPipelineStepRow["status"];
    started_at: string;
  },
): RawPipelineStepRow {
  return {
    id: 1,
    quote_id: 42,
    completed_at: null,
    duration_ms: null,
    error_message: null,
    error_details: null,
    metadata: null,
    ...overrides,
  };
}

describe("humanizeStepName", () => {
  it("returns the known label for a canonical step", () => {
    expect(humanizeStepName("generate_text")).toBe("Generate AI text");
  });

  it("falls back to capitalized snake_case for unknown steps", () => {
    expect(humanizeStepName("future_new_step")).toBe("Future New Step");
  });
});

describe("buildPipelineStepViews", () => {
  it("returns every canonical step as pending when there are no rows", () => {
    const views = buildPipelineStepViews([]);
    expect(views).toHaveLength(PIPELINE_STEP_ORDER.length);
    expect(views.every((v) => v.status === "pending")).toBe(true);
    expect(views[0].stepName).toBe(PIPELINE_STEP_ORDER[0]);
  });

  it("maps a single row to the matching step view", () => {
    const views = buildPipelineStepViews([
      makeRow({
        step_name: "generate_text",
        status: "success",
        started_at: "2026-04-15T10:00:00.000Z",
        completed_at: "2026-04-15T10:00:08.000Z",
        duration_ms: 8200,
      }),
    ]);
    const generateText = views.find((v) => v.stepName === "generate_text")!;
    expect(generateText.status).toBe("success");
    expect(generateText.durationMs).toBe(8200);
    expect(generateText.attemptCount).toBe(1);
  });

  it("collapses multiple attempts to the latest started_at", () => {
    const views = buildPipelineStepViews([
      makeRow({
        id: 1,
        step_name: "docuseal_submit",
        status: "failed",
        started_at: "2026-04-15T10:00:00.000Z",
        error_message: "first attempt failed",
      }),
      makeRow({
        id: 2,
        step_name: "docuseal_submit",
        status: "success",
        started_at: "2026-04-15T10:05:00.000Z",
        duration_ms: 1200,
      }),
    ]);
    const submit = views.find((v) => v.stepName === "docuseal_submit")!;
    expect(submit.status).toBe("success");
    expect(submit.durationMs).toBe(1200);
    expect(submit.attemptCount).toBe(2);
    expect(submit.errorMessage).toBeNull();
  });

  it("preserves canonical order regardless of row insert order", () => {
    const views = buildPipelineStepViews([
      makeRow({
        step_name: "send_email",
        status: "success",
        started_at: "2026-04-15T11:00:00.000Z",
      }),
      makeRow({
        step_name: "validate_deal",
        status: "success",
        started_at: "2026-04-15T10:00:00.000Z",
      }),
    ]);
    const names = views.map((v) => v.stepName);
    expect(names.indexOf("validate_deal")).toBeLessThan(
      names.indexOf("send_email"),
    );
  });

  it("appends unknown step names at the end for forward compatibility", () => {
    const views = buildPipelineStepViews([
      makeRow({
        step_name: "future_unknown_step",
        status: "success",
        started_at: "2026-04-15T10:00:00.000Z",
      }),
    ]);
    const last = views[views.length - 1];
    expect(last.stepName).toBe("future_unknown_step");
    expect(last.status).toBe("success");
  });

  it("captures error_message and error_details on failed steps", () => {
    const views = buildPipelineStepViews([
      makeRow({
        step_name: "generate_pdf",
        status: "failed",
        started_at: "2026-04-15T10:00:00.000Z",
        error_message: "Storage upload failed",
        error_details: { stack: "Error: ECONNRESET\n  at fetch" },
      }),
    ]);
    const pdf = views.find((v) => v.stepName === "generate_pdf")!;
    expect(pdf.status).toBe("failed");
    expect(pdf.errorMessage).toBe("Storage upload failed");
    expect(pdf.errorDetails).toEqual({
      stack: "Error: ECONNRESET\n  at fetch",
    });
  });
});

describe("summarizePipeline", () => {
  it("reports no activity when every step is pending", () => {
    const views = buildPipelineStepViews([]);
    const summary = summarizePipeline(views);
    expect(summary.isRunning).toBe(false);
    expect(summary.failedStep).toBeNull();
    expect(summary.runningStep).toBeNull();
    expect(summary.latestCompletedStep).toBeNull();
    expect(summary.headline).toBe("No pipeline activity yet");
  });

  it("prioritizes failed over running over success", () => {
    const views = buildPipelineStepViews([
      makeRow({
        step_name: "generate_text",
        status: "success",
        started_at: "2026-04-15T10:00:00.000Z",
        completed_at: "2026-04-15T10:00:05.000Z",
      }),
      makeRow({
        step_name: "generate_pdf",
        status: "failed",
        started_at: "2026-04-15T10:01:00.000Z",
        error_message: "boom",
      }),
      makeRow({
        step_name: "docuseal_submit",
        status: "running",
        started_at: "2026-04-15T10:02:00.000Z",
      }),
    ]);
    const summary = summarizePipeline(views);
    expect(summary.failedStep?.stepName).toBe("generate_pdf");
    expect(summary.runningStep?.stepName).toBe("docuseal_submit");
    expect(summary.headline).toBe("Failed at Generate PDF");
  });

  it("headline shows running step when nothing has failed yet", () => {
    const views = buildPipelineStepViews([
      makeRow({
        step_name: "validate_deal",
        status: "success",
        started_at: "2026-04-15T10:00:00.000Z",
      }),
      makeRow({
        step_name: "generate_text",
        status: "running",
        started_at: "2026-04-15T10:00:05.000Z",
      }),
    ]);
    const summary = summarizePipeline(views);
    expect(summary.isRunning).toBe(true);
    expect(summary.headline).toBe("Running: Generate AI text");
  });

  it("headline shows step count when everything has completed", () => {
    const views = buildPipelineStepViews([
      makeRow({
        step_name: "validate_deal",
        status: "success",
        started_at: "2026-04-15T10:00:00.000Z",
        completed_at: "2026-04-15T10:00:01.000Z",
      }),
      makeRow({
        step_name: "generate_text",
        status: "success",
        started_at: "2026-04-15T10:00:02.000Z",
        completed_at: "2026-04-15T10:00:10.000Z",
      }),
    ]);
    const summary = summarizePipeline(views);
    expect(summary.isRunning).toBe(false);
    expect(summary.failedStep).toBeNull();
    expect(summary.latestCompletedStep?.stepName).toBe("generate_text");
    expect(summary.headline).toBe("2 steps complete");
  });

  it("headline singular vs plural is correct", () => {
    const views = buildPipelineStepViews([
      makeRow({
        step_name: "validate_deal",
        status: "success",
        started_at: "2026-04-15T10:00:00.000Z",
        completed_at: "2026-04-15T10:00:01.000Z",
      }),
    ]);
    const summary = summarizePipeline(views);
    expect(summary.headline).toBe("1 step complete");
  });
});

describe("formatDurationMs", () => {
  it("renders em dash when null", () => {
    expect(formatDurationMs(null)).toBe("—");
  });

  it("uses milliseconds under 1 second", () => {
    expect(formatDurationMs(500)).toBe("500 ms");
  });

  it("uses seconds under 1 minute", () => {
    expect(formatDurationMs(8200)).toBe("8.2 s");
  });

  it("uses minutes for durations over 60 seconds", () => {
    expect(formatDurationMs(90_000)).toBe("1.5 min");
  });
});
