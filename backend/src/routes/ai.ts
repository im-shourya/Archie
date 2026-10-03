import type { Context } from "hono";
import { HarnessError } from "@archie/ai/llm";
import { AppError, errorBody } from "../errors";

/** Shared by the AI routes (docs/16): the 400 shape for invalid bodies, and HarnessError → AppError. */

interface ValidationResult {
  success: boolean;
  error?: { issues: readonly { path: readonly PropertyKey[]; message: string }[] };
}

export function validationHook(result: ValidationResult, c: Context) {
  if (!result.success) {
    const issue = result.error?.issues[0];
    const where = issue?.path.length ? `${issue.path.map(String).join(".")}: ` : "";
    return c.json(
      errorBody("VALIDATION_ERROR", `${where}${issue?.message ?? "invalid request"}`),
      400,
    );
  }
}

export function toAppError(err: unknown, c: Context): never {
  if (!(err instanceof HarnessError)) throw err;
  c.set("logFields", { errorCode: err.code });
  if (err.cause && process.env.NODE_ENV !== "test") {
    // Provider details stay server-side, keyed by request id (docs/15).
    console.error(
      JSON.stringify({
        level: "error",
        requestId: c.get("requestId"),
        code: err.code,
        cause: String(err.cause),
      }),
    );
  }
  throw new AppError(
    err.code,
    err.message,
    err.retryAfterSeconds ? { retryAfterSeconds: err.retryAfterSeconds } : undefined,
  );
}
