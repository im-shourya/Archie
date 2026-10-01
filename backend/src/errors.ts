import type { ContentfulStatusCode } from "hono/utils/http-status";

/** Error codes returned to clients. Must match specs/openapi.yaml → Error.code. */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "ACCESS_CODE_REQUIRED"
  | "NOT_FOUND"
  | "PAYLOAD_TOO_LARGE"
  | "LLM_REFUSED"
  | "RATE_LIMITED"
  | "DAILY_CAP_REACHED"
  | "LLM_UPSTREAM"
  | "LLM_UNAVAILABLE"
  | "INTERNAL";

const STATUS: Record<ErrorCode, ContentfulStatusCode> = {
  VALIDATION_ERROR: 400,
  ACCESS_CODE_REQUIRED: 401,
  NOT_FOUND: 404,
  PAYLOAD_TOO_LARGE: 413,
  LLM_REFUSED: 422,
  RATE_LIMITED: 429,
  DAILY_CAP_REACHED: 429,
  LLM_UPSTREAM: 502,
  LLM_UNAVAILABLE: 503,
  INTERNAL: 500,
};

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }

  get status(): ContentfulStatusCode {
    return STATUS[this.code];
  }
}

export function errorBody(code: ErrorCode, message: string, details?: Record<string, unknown>) {
  return { error: { code, message, ...(details ? { details } : {}) } };
}
