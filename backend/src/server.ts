// Standalone backend for evals and integration work: http://localhost:8787/api
import { serve } from "@hono/node-server";
import { app } from "./app";

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => console.log(`backend listening on :${port}/api`));
