import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { requestId } from "hono/request-id";
import { AppError, errorBody } from "./errors";
import { logger } from "./middleware/logger";
import { health } from "./routes/health";

const MAX_BODY_BYTES = 256 * 1024;

export const app = new Hono().basePath("/api");

app.use(requestId());
app.use(logger);
app.use(
  bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) => c.json(errorBody("PAYLOAD_TOO_LARGE", "Request body exceeds 256 KB"), 413),
  }),
);

app.route("/health", health);

app.notFound((c) => c.json(errorBody("NOT_FOUND", `No route for ${c.req.method} ${c.req.path}`), 404));

app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json(errorBody(err.code, err.message, err.details), err.status);
  }
  if (err instanceof HTTPException) {
    return c.json(errorBody("VALIDATION_ERROR", err.message), 400);
  }
  console.error(JSON.stringify({ level: "error", requestId: c.get("requestId"), err: String(err) }));
  return c.json(errorBody("INTERNAL", "Something went wrong"), 500);
});

export type App = typeof app;
