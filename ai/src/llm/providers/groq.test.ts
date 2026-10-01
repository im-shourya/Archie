import Groq from "groq-sdk";
import { describe, expect, it, vi } from "vitest";
import { createGroqProvider, GROQ_DEFAULT_MODEL, type ChatClient } from "./groq";

const body = JSON.stringify({ kind: "noop", ops: [], message: "ok", options: [], focusNodeIds: [] });
const req = { system: "SYS", turns: [{ role: "user" as const, text: "u1" }, { role: "assistant" as const, text: "a1", raw: [{ ignored: true }] }, { role: "user" as const, text: "fix" }], tokenScale: 2 as const, signal: new AbortController().signal };

function mock(result: unknown) {
  const create = vi.fn(result instanceof Error ? () => Promise.reject(result) : () => Promise.resolve(result));
  return { provider: createGroqProvider({ client: { chat: { completions: { create } } } as unknown as ChatClient }), create };
}

describe("groq provider", () => {
  it("sends system + text turns with strict JSON schema and low reasoning", async () => {
    const { provider, create } = mock({
      model: GROQ_DEFAULT_MODEL,
      choices: [{ finish_reason: "stop", message: { content: body } }],
      usage: { prompt_tokens: 6149, completion_tokens: 804, prompt_tokens_details: { cached_tokens: 6000 } },
    });
    const res = await provider.complete(req);
    const [params, opts] = create.mock.calls[0]! as unknown as [Record<string, unknown>, { signal: AbortSignal }];
    expect(params).toMatchObject({ model: GROQ_DEFAULT_MODEL, max_completion_tokens: 8000, reasoning_effort: "low" });
    expect(params.messages).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "fix" },
    ]);
    expect(params.response_format).toMatchObject({ type: "json_schema", json_schema: { name: "command_result", strict: true } });
    expect(opts.signal).toBe(req.signal);
    expect(res).toMatchObject({ text: body, stop: "end", usage: { inputTokens: 149, outputTokens: 804, cacheReadTokens: 6000 } });
  });

  it("maps finish_reason length to max_tokens", async () => {
    const { provider } = mock({ model: "m", choices: [{ finish_reason: "length", message: { content: "{" } }], usage: {} });
    expect((await provider.complete(req)).stop).toBe("max_tokens");
  });

  it.each([
    ["429 with retry-after", new Groq.RateLimitError(429, undefined, "slow", new Headers({ "retry-after": "7" })), { kind: "rate_limit", retryAfterMs: 7000 }],
    ["500", new Groq.InternalServerError(500, undefined, "x", new Headers()), { kind: "overloaded" }],
    ["timeout", new Groq.APIConnectionTimeoutError(), { kind: "aborted" }],
    ["network", new Groq.APIConnectionError({ message: "down" }), { kind: "connection" }],
    ["400 schema", new Groq.BadRequestError(400, undefined, "json_validate_failed", new Headers()), { kind: "upstream" }],
  ] as const)("classifies %s", async (_n, error, expected) => {
    const { provider } = mock(error);
    await expect(provider.complete(req)).rejects.toMatchObject(expected);
  });
});
