/**
 * Pipeline step logging for the quote workflow.
 *
 * Writes structured step rows to public.quote_pipeline_steps so we can
 * reconstruct the execution history of any quote for debugging and, in
 * future phases, for a visual pipeline view in the CRM.
 *
 * Phase 1 scope: additive logging only. Call sites wrap each logical step
 * in `withPipelineStep(...)` and the helper handles start/finish/failure.
 * No orchestration behavior is changed by logging — if the table is
 * unavailable (e.g. service role misconfigured) we swallow the logging
 * error and let the wrapped function run anyway.
 */

import type { PipelineStepName } from "./constants.ts";

/**
 * Minimal structural type for the Supabase client. Using a narrow local
 * type avoids the dependency mismatch between Deno edge runtime and
 * npm-installed supabase-js that the Vitest test config already bridges.
 */
interface MinimalSupabaseClient {
  from(table: string): {
    insert(values: unknown): {
      select(): {
        single(): Promise<{ data: { id: number } | null; error: unknown }>;
      };
    };
    update(values: unknown): {
      eq(
        column: string,
        value: unknown,
      ): Promise<{ data: unknown; error: unknown }>;
    };
  };
}

export interface PipelineStepOptions {
  supabase: MinimalSupabaseClient;
  quoteId: number | null;
  stepName: PipelineStepName | string;
  metadata?: Record<string, unknown>;
}

/**
 * Wrap an async step in structured pipeline logging. Records a `running`
 * row on entry, updates it to `success` on resolve or `failed` on throw.
 * The original promise value (or thrown error) is always forwarded to the
 * caller — logging never changes control flow.
 *
 * If `quoteId` is null (e.g. before the quote row has been created), the
 * step is executed normally but no pipeline row is written. Phase 2 will
 * add a "pre-quote" bucket if we need pre-creation observability.
 */
export async function withPipelineStep<T>(
  opts: PipelineStepOptions,
  fn: () => Promise<T>,
): Promise<T> {
  if (opts.quoteId == null) {
    return fn();
  }

  const startedAt = new Date();
  let rowId: number | null = null;

  try {
    const { data } = await opts.supabase
      .from("quote_pipeline_steps")
      .insert({
        quote_id: opts.quoteId,
        step_name: opts.stepName,
        status: "running",
        started_at: startedAt.toISOString(),
        metadata: opts.metadata ?? {},
      })
      .select()
      .single();
    rowId = data?.id ?? null;
  } catch (insertError) {
    console.warn(
      "pipelineLogger: failed to insert running row, continuing without logging:",
      insertError,
    );
  }

  try {
    const result = await fn();
    if (rowId != null) {
      const completedAt = new Date();
      try {
        await opts.supabase
          .from("quote_pipeline_steps")
          .update({
            status: "success",
            completed_at: completedAt.toISOString(),
            duration_ms: completedAt.getTime() - startedAt.getTime(),
          })
          .eq("id", rowId);
      } catch (updateError) {
        console.warn(
          "pipelineLogger: failed to update success row:",
          updateError,
        );
      }
    }
    return result;
  } catch (err) {
    if (rowId != null) {
      const completedAt = new Date();
      const message = err instanceof Error ? err.message : String(err);
      try {
        await opts.supabase
          .from("quote_pipeline_steps")
          .update({
            status: "failed",
            completed_at: completedAt.toISOString(),
            duration_ms: completedAt.getTime() - startedAt.getTime(),
            error_message: message,
            error_details: {
              stack: err instanceof Error ? err.stack : undefined,
              name: err instanceof Error ? err.name : undefined,
            },
          })
          .eq("id", rowId);
      } catch (updateError) {
        console.warn(
          "pipelineLogger: failed to update failed row:",
          updateError,
        );
      }
    }
    throw err;
  }
}
