import { describe, expect, it } from "vitest";
import { app } from "./app";

type ErrorResponse = { error: { code: string; message: string } };

describe("backend app", () => {
  it("GET /api/health reports status without calling the LLM", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; llm: string };
    expect(body).toMatchObject({ ok: true, model: expect.any(String), version: expect.any(String) });
    expect(["configured", "missing-key"]).toContain(body.llm);
  });

  it("echoes or generates X-Request-Id", async () => {
    const res = await app.request("/api/health", { headers: { "X-Request-Id": "abc-123" } });
    expect(res.headers.get("X-Request-Id")).toBe("abc-123");
    const generated = await app.request("/api/health");
    expect(generated.headers.get("X-Request-Id")).toBeTruthy();
  });

  it("returns the standard error shape for unknown routes", async () => {
    const res = await app.request("/api/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: "NOT_FOUND", message: "No route for GET /api/nope" },
    });
  });

  it("rejects bodies over 256 KB with PAYLOAD_TOO_LARGE", async () => {
    const res = await app.request("/api/health", {
      method: "POST",
      body: "x".repeat(256 * 1024 + 1),
      headers: { "Content-Type": "text/plain" },
    });
    expect(res.status).toBe(413);
    expect(((await res.json()) as ErrorResponse).error.code).toBe("PAYLOAD_TOO_LARGE");
  });
});
