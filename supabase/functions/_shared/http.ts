import { createErrorResponse } from "./utils.ts";

export class HttpError extends Error {
  status: number;
  code?: string;
  details?: Record<string, unknown>;

  constructor(
    status: number,
    message: string,
    options: {
      code?: string;
      details?: Record<string, unknown>;
    } = {},
  ) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = options.code;
    this.details = options.details;
  }
}

export function errorResponseFromUnknown(error: unknown) {
  if (error instanceof HttpError) {
    return createErrorResponse(error.status, error.message, {
      ...(error.code ? { code: error.code } : {}),
      ...(error.details ? { details: error.details } : {}),
    });
  }

  return createErrorResponse(500, "Internal Server Error", {
    code: "internal_error",
  });
}

export async function parseOptionalJsonBody(
  req: Request,
): Promise<Record<string, unknown> | undefined> {
  const rawBody = await req.text();

  if (rawBody.trim().length === 0) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new HttpError(400, "Invalid JSON body", {
      code: "invalid_json",
    });
  }

  return ensurePlainObject(parsed);
}

export async function parseRequiredJsonBody(req: Request) {
  const body = await parseOptionalJsonBody(req);

  if (!body) {
    throw new HttpError(400, "Request body is required", {
      code: "missing_body",
    });
  }

  return body;
}

export function ensurePlainObject(
  value: unknown,
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new HttpError(400, "Request body must be a JSON object", {
      code: "invalid_body",
    });
  }

  return value as Record<string, unknown>;
}

export function getPositiveIntegerField(
  body: Record<string, unknown>,
  field: string,
  options: { required?: boolean } = {},
) {
  const value = body[field];

  if (value === undefined || value === null) {
    if (options.required) {
      throw new HttpError(400, `${field} is required`, {
        code: "missing_field",
        details: { field },
      });
    }

    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new HttpError(400, `${field} must be a positive integer`, {
      code: "invalid_field",
      details: { field },
    });
  }

  return value;
}

export function getOptionalStringField(
  body: Record<string, unknown>,
  field: string,
): string | undefined {
  const value = body[field];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new HttpError(400, `${field} must be a string`, {
      code: "invalid_field",
      details: { field },
    });
  }

  return value;
}

export function getRequiredStringField(
  body: Record<string, unknown>,
  field: string,
  options: { minLength?: number } = {},
) {
  const value = getOptionalStringField(body, field);

  if (value === undefined) {
    throw new HttpError(400, `${field} is required`, {
      code: "missing_field",
      details: { field },
    });
  }

  if (options.minLength && value.trim().length < options.minLength) {
    throw new HttpError(
      400,
      `${field} must be at least ${options.minLength} characters`,
      {
        code: "invalid_field",
        details: { field },
      },
    );
  }

  return value;
}

export function getEnumField<T extends string>(
  body: Record<string, unknown>,
  field: string,
  values: readonly T[],
  options: { required?: boolean } = {},
): T | undefined {
  const value = body[field];

  if (value === undefined || value === null) {
    if (options.required) {
      throw new HttpError(400, `${field} is required`, {
        code: "missing_field",
        details: { field },
      });
    }

    return undefined;
  }

  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new HttpError(400, `${field} must be one of: ${values.join(", ")}`, {
      code: "invalid_field",
      details: { field, allowed_values: values },
    });
  }

  return value as T;
}

export function getOptionalBooleanField(
  body: Record<string, unknown>,
  field: string,
) {
  const value = body[field];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new HttpError(400, `${field} must be a boolean`, {
      code: "invalid_field",
      details: { field },
    });
  }

  return value;
}

export function isValidDateString(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}
