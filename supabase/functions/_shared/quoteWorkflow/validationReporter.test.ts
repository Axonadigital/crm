import { describe, expect, it, vi } from "vitest";
import {
  reportValidationFailure,
  summarizeZodError,
} from "./validationReporter.ts";

interface RecordedInsert {
  quote_id: number | null;
  schema_name: string;
  boundary: string;
  policy: string;
  raw_input: unknown;
  validation_error: string;
  error_details: unknown;
}

function makeSupabaseStub(options: {
  insertError?: unknown;
  throwOnInsert?: boolean;
}) {
  const recordedInserts: RecordedInsert[] = [];

  const client = {
    from: (_table: string) => ({
      insert: async (values: RecordedInsert) => {
        if (options.throwOnInsert) {
          throw new Error("simulated DB throw");
        }
        recordedInserts.push(values);
        return {
          data: null,
          error: options.insertError ?? null,
        };
      },
    }),
  };

  return { client, recordedInserts };
}

describe("summarizeZodError", () => {
  it("joins the first issues in path: message form", () => {
    const summary = summarizeZodError({
      issues: [
        { path: ["summary_pitch"], message: "Required" },
        { path: ["proposal_body"], message: "Required" },
      ],
    });
    expect(summary).toBe("summary_pitch: Required; proposal_body: Required");
  });

  it("renders <root> when path is empty", () => {
    const summary = summarizeZodError({
      issues: [{ path: [], message: "Expected object" }],
    });
    expect(summary).toBe("<root>: Expected object");
  });

  it("caps at 5 issues to keep rows readable", () => {
    const issues = Array.from({ length: 10 }, (_, i) => ({
      path: [`f${i}`],
      message: "x",
    }));
    const summary = summarizeZodError({ issues });
    expect(summary.split(";")).toHaveLength(5);
  });

  it("returns a fallback string for empty issues", () => {
    const summary = summarizeZodError({ issues: [] });
    expect(summary).toBe("unknown validation error");
  });
});

describe("reportValidationFailure", () => {
  it("writes a row with all input fields into quote_validation_failures", async () => {
    const { client, recordedInserts } = makeSupabaseStub({});

    await reportValidationFailure({
      supabase: client,
      quoteId: 42,
      boundary: "ai_output",
      schemaName: "generatedSectionsSchema",
      policy: "quarantine",
      rawInput: { summary_pitch: "x" },
      validationError: "proposal_body: Required",
      errorDetails: {
        issues: [{ path: ["proposal_body"], message: "Required" }],
      },
    });

    expect(recordedInserts).toHaveLength(1);
    const row = recordedInserts[0];
    expect(row.quote_id).toBe(42);
    expect(row.boundary).toBe("ai_output");
    expect(row.schema_name).toBe("generatedSectionsSchema");
    expect(row.policy).toBe("quarantine");
    expect(row.raw_input).toEqual({ summary_pitch: "x" });
    expect(row.validation_error).toBe("proposal_body: Required");
  });

  it("wraps scalar raw_input into an object so jsonb queries stay uniform", async () => {
    const { client, recordedInserts } = makeSupabaseStub({});
    await reportValidationFailure({
      supabase: client,
      quoteId: null,
      boundary: "docuseal_webhook",
      schemaName: "docuSealWebhookPayloadSchema",
      policy: "quarantine",
      rawInput: "just a string",
      validationError: "expected object",
    });
    expect(recordedInserts[0].raw_input).toEqual({ value: "just a string" });
  });

  it("wraps arrays into an object (jsonb column is object-shaped)", async () => {
    const { client, recordedInserts } = makeSupabaseStub({});
    await reportValidationFailure({
      supabase: client,
      quoteId: null,
      boundary: "docuseal_webhook",
      schemaName: "docuSealWebhookPayloadSchema",
      policy: "quarantine",
      rawInput: [1, 2, 3],
      validationError: "expected object",
    });
    expect(recordedInserts[0].raw_input).toEqual({ value: [1, 2, 3] });
  });

  it("invokes notifyDiscord for quarantine policy after the DB write", async () => {
    const { client } = makeSupabaseStub({});
    const notifyDiscord = vi.fn().mockResolvedValue(undefined);

    await reportValidationFailure({
      supabase: client,
      quoteId: 42,
      boundary: "ai_output",
      schemaName: "generatedSectionsSchema",
      policy: "quarantine",
      rawInput: {},
      validationError: "summary_pitch: Required",
      notifyDiscord,
    });

    expect(notifyDiscord).toHaveBeenCalledWith({
      boundary: "ai_output",
      schemaName: "generatedSectionsSchema",
      quoteId: 42,
      validationError: "summary_pitch: Required",
    });
  });

  it("does NOT invoke notifyDiscord for fail_fast policy", async () => {
    const { client } = makeSupabaseStub({});
    const notifyDiscord = vi.fn().mockResolvedValue(undefined);

    await reportValidationFailure({
      supabase: client,
      quoteId: 42,
      boundary: "save_quote_content_payload",
      schemaName: "saveQuoteContentPayloadSchema",
      policy: "fail_fast",
      rawInput: {},
      validationError: "sections: Required",
      notifyDiscord,
    });

    expect(notifyDiscord).not.toHaveBeenCalled();
  });

  it("swallows a thrown DB insert without throwing to the caller", async () => {
    const { client } = makeSupabaseStub({ throwOnInsert: true });
    await expect(
      reportValidationFailure({
        supabase: client,
        quoteId: 42,
        boundary: "ai_output",
        schemaName: "generatedSectionsSchema",
        policy: "quarantine",
        rawInput: {},
        validationError: "boom",
      }),
    ).resolves.toBeUndefined();
  });

  it("swallows a failing Discord callback without throwing", async () => {
    const { client } = makeSupabaseStub({});
    const notifyDiscord = vi.fn().mockRejectedValue(new Error("discord down"));

    await expect(
      reportValidationFailure({
        supabase: client,
        quoteId: 42,
        boundary: "ai_output",
        schemaName: "generatedSectionsSchema",
        policy: "quarantine",
        rawInput: {},
        validationError: "x",
        notifyDiscord,
      }),
    ).resolves.toBeUndefined();
    expect(notifyDiscord).toHaveBeenCalled();
  });
});
