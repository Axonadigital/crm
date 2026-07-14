/**
 * Fortnox returns errors in an `ErrorInformation` envelope, but the casing of
 * the inner keys is inconsistent between endpoints (some return `Message`,
 * others `message`). Normalise both here so callers get one shape.
 */

export class FortnoxError extends Error {
  readonly status: number;
  readonly code?: number;
  readonly retryable: boolean;
  readonly body?: string;

  constructor(
    status: number,
    message: string,
    options: { code?: number; retryable?: boolean; body?: string } = {},
  ) {
    super(message);
    this.name = "FortnoxError";
    this.status = status;
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.body = options.body;
  }
}

export type ParsedFortnoxError = {
  message: string;
  code?: number;
};

function pick(source: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) {
      return source[key];
    }
  }
  return undefined;
}

export function parseFortnoxError(rawBody: string): ParsedFortnoxError {
  const fallback = rawBody.trim().slice(0, 500) || "Unknown Fortnox error";

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { message: fallback };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { message: fallback };
  }

  const envelope = pick(
    parsed as Record<string, unknown>,
    "ErrorInformation",
    "errorInformation",
  );

  const source =
    typeof envelope === "object" && envelope !== null
      ? (envelope as Record<string, unknown>)
      : (parsed as Record<string, unknown>);

  const message = pick(source, "Message", "message", "error_description");
  const code = pick(source, "Code", "code");

  return {
    message:
      typeof message === "string" && message.length > 0 ? message : fallback,
    code: typeof code === "number" ? code : undefined,
  };
}

/**
 * 429 is the documented rate-limit response. 5xx and network failures are
 * transient. Everything else (400/403/404) is a bug in our payload and must
 * surface immediately rather than being retried into the rate limit.
 */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}
