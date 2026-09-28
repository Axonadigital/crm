/**
 * Validation failure reporter for the quote pipeline.
 *
 * Phase 3: every Zod schema check in the pipeline writes through this
 * helper when validation fails. The reporter persists the failure to
 * `public.quote_validation_failures` (created by migration
 * 20260415150000) and optionally pings a Discord alert callback for
 * boundaries where the alert is part of the policy (AI output).
 *
 * The reporter NEVER throws. Logging failures are swallowed so a flaky
 * DB or offline Discord cannot break the primary control flow —
 * boundaries that want to reject the caller (fail-fast policy) still
 * throw their own error after the reporter returns.
 */

type PipelineBoundary =
  | "ai_output"
  | "save_quote_content_payload"
  | "save_quote_edits_payload"
  | "docuseal_webhook"
  | "docuseal_outgoing_payload";

type ValidationPolicy = "quarantine" | "fail_fast";

interface MinimalSupabaseClient {
  from(table: string): {
    insert(values: unknown): Promise<{ data: unknown; error: unknown }>;
  };
}

export interface ReportValidationFailureInput {
  supabase: MinimalSupabaseClient;
  /** Numeric quote id, or null when the failure happened before a quote
   *  row was resolvable (e.g. malformed incoming webhook). */
  quoteId: number | null;
  boundary: PipelineBoundary;
  /** Name of the Zod schema that failed — matches the export name in
   *  `_shared/quoteWorkflow/schemas.ts` so logs can be grepped. */
  schemaName: string;
  policy: ValidationPolicy;
  /** The raw input that failed validation. Stored as jsonb — callers
   *  should pass a serializable value. Strings are wrapped so the
   *  column never ends up with a non-JSON scalar. */
  rawInput: unknown;
  /** Human-readable validation error summary (usually
   *  `zodError.issues.map(i => i.path.join('.') + ': ' + i.message).join('; ')`
   *  from the caller side). */
  validationError: string;
  /** Optional structured Zod issues array for the dev dashboard. */
  errorDetails?: Record<string, unknown>;
  /** Optional Discord alert callback. Called only when policy is
   *  'quarantine' — fail-fast boundaries surface to the caller, not to
   *  Discord. The callback is invoked after the DB row is written so
   *  an alert drop does not lose the persisted record. */
  notifyDiscord?: (summary: {
    boundary: PipelineBoundary;
    schemaName: string;
    quoteId: number | null;
    validationError: string;
  }) => Promise<void>;
}

function wrapRawInput(value: unknown): unknown {
  // jsonb columns accept primitives, but we want every row to be an
  // object so downstream queries can consistently do `raw_input ->> 'foo'`.
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { value };
  }
  return value;
}

export async function reportValidationFailure(
  input: ReportValidationFailureInput,
): Promise<void> {
  const {
    supabase,
    quoteId,
    boundary,
    schemaName,
    policy,
    rawInput,
    validationError,
    errorDetails,
    notifyDiscord,
  } = input;

  try {
    const { error: insertError } = await supabase
      .from("quote_validation_failures")
      .insert({
        quote_id: quoteId,
        schema_name: schemaName,
        boundary,
        policy,
        raw_input: wrapRawInput(rawInput),
        validation_error: validationError,
        error_details: errorDetails ?? {},
      });
    if (insertError) {
      console.warn(
        "reportValidationFailure: insert returned error (continuing):",
        insertError,
      );
    }
  } catch (insertError) {
    console.warn(
      "reportValidationFailure: insert threw (continuing):",
      insertError,
    );
  }

  // Always log to console.warn so the signal is visible in edge
  // function logs even if the DB write was swallowed.
  console.warn("validation failure", {
    boundary,
    schemaName,
    policy,
    quoteId,
    validationError,
  });

  if (policy === "quarantine" && notifyDiscord) {
    try {
      await notifyDiscord({
        boundary,
        schemaName,
        quoteId,
        validationError,
      });
    } catch (alertError) {
      console.warn(
        "reportValidationFailure: Discord alert failed (continuing):",
        alertError,
      );
    }
  }
}

/**
 * Convenience helper — turns a Zod error into a short one-line summary
 * suitable for the `validation_error` column. Callers can also roll
 * their own message if they want a different shape; this is just a
 * sensible default.
 */
export function summarizeZodError(error: {
  issues: ReadonlyArray<{ path: Array<string | number>; message: string }>;
}): string {
  if (!error.issues || error.issues.length === 0) {
    return "unknown validation error";
  }
  return error.issues
    .slice(0, 5)
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

/**
 * Minimal Discord dev-channel alert helper. Takes a title and message
 * and posts to the `DISCORD_WEBHOOK_URL` environment variable (or the
 * `get_discord_webhook_url` RPC as a fallback, matching the pattern
 * orchestrate_proposal already uses).
 *
 * Intentionally thin — this helper exists so every boundary that needs
 * to ping Discord on a quarantine event can share the same transport
 * without importing orchestrate_proposal's larger notifyDiscord
 * implementation (which builds full embeds with bot-API buttons).
 *
 * Never throws. All failures are logged and swallowed so a missing
 * webhook URL or offline Discord cannot break the primary flow.
 */
export async function postDevDiscordAlert(params: {
  supabase?: {
    rpc(
      name: string,
      args?: Record<string, unknown>,
    ): Promise<{
      data: unknown;
      error: unknown;
    }>;
  };
  title: string;
  message: string;
}): Promise<void> {
  try {
    let webhookUrl = "";
    try {
      webhookUrl =
        (
          globalThis as {
            Deno?: { env: { get(k: string): string | undefined } };
          }
        ).Deno?.env.get("DISCORD_WEBHOOK_URL") || "";
    } catch {
      webhookUrl = "";
    }

    if (!webhookUrl && params.supabase) {
      try {
        const { data } = await params.supabase.rpc("get_discord_webhook_url");
        if (typeof data === "string") webhookUrl = data;
      } catch {
        // fall through to the no-webhook path
      }
    }

    if (!webhookUrl) {
      console.warn(
        "postDevDiscordAlert: no DISCORD_WEBHOOK_URL configured, skipping",
      );
      return;
    }

    const embed = {
      title: params.title,
      description: params.message.slice(0, 1900),
      color: 15105570, // amber — not as severe as a red error
      timestamp: new Date().toISOString(),
    };

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });
    if (!res.ok) {
      console.warn(
        "postDevDiscordAlert: Discord webhook returned non-ok:",
        res.status,
      );
    }
  } catch (alertError) {
    console.warn(
      "postDevDiscordAlert: swallowed alert error (continuing):",
      alertError,
    );
  }
}
