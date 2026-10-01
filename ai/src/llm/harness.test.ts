import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { applyBatch, buildTemplate, type Graph, type Op } from "@archie/simulator";
import { COMMAND_SYSTEM_PROMPT } from "./prompts/command";
import { HarnessError, runCommand } from "./harness";
import { ANTHROPIC_MAX_TOKENS as COMMAND_MAX_TOKENS, createAnthropicProvider, type MessagesClient } from "./providers/anthropic";
import type { CommandKind, WireOp } from "./schemas";

const threeTier = buildTemplate("three-tier");

/** Compact op → full wire op (every field present, unused ones null), as the model returns it. */
function toWire(op: Record<string, unknown>): WireOp {
  const props = (p: unknown) =>
    p
      ? {
          replicas: null,
          shards: null,
          capacityRps: null,
          readCapacity: null,
          writeCapacity: null,
          latencyMs: null,
          hitRate: null,
          role: null,
          failover: null,
          costPerReplica: null,
          ...(p as object),
        }
      : null;
  const node = op.node as Record<string, unknown> | undefined;
  return {
    type: String(op.type),
    id: (op.id as string) ?? null,
    kind: (op.kind as string) ?? null,
    label: (op.label as string) ?? null,
    props: props(op.props),
    from: (op.from as string) ?? null,
    to: (op.to as string) ?? null,
    traffic: (op.traffic as string) ?? null,
    weight: (op.weight as number) ?? null,
    replicas: (op.replicas as number) ?? null,
    node: node
      ? { id: (node.id as string) ?? null, kind: (node.kind as string) ?? null, label: (node.label as string) ?? null, props: props(node.props) }
      : null,
    rps: (op.rps as number) ?? null,
    readRatio: (op.readRatio as number) ?? null,
    peakMultiplier: (op.peakMultiplier as number) ?? null,
  };
}

interface Out {
  kind: CommandKind;
  ops?: Record<string, unknown>[];
  message?: string;
  options?: string[];
  focusNodeIds?: string[];
}

function reply(out: Out | string, extra: Partial<Anthropic.Beta.BetaMessage> = {}): Anthropic.Beta.BetaMessage {
  const text =
    typeof out === "string"
      ? out
      : JSON.stringify({
          kind: out.kind,
          ops: (out.ops ?? []).map(toWire),
          message: out.message ?? "ok",
          options: out.options ?? [],
          focusNodeIds: out.focusNodeIds ?? [],
        });
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [{ type: "text", text, citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 900, output_tokens: 120, cache_read_input_tokens: 5000, cache_creation_input_tokens: 0 },
    ...extra,
  } as unknown as Anthropic.Beta.BetaMessage;
}

/** A mock client whose create() returns (or throws) the given replies in order. */
function mockClient(...replies: (Anthropic.Beta.BetaMessage | Error)[]) {
  const create = vi.fn();
  for (const r of replies) {
    if (r instanceof Error) create.mockRejectedValueOnce(r);
    else create.mockResolvedValueOnce(r);
  }
  const client = createAnthropicProvider({ client: { beta: { messages: { create } } } as unknown as MessagesClient });
  return { client, create };
}

const request = (utterance: string, graph: Graph = threeTier) => ({ utterance, graph, baseVersion: graph.version });

async function harnessError(promise: Promise<unknown>): Promise<HarnessError> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(HarnessError);
  return err as HarnessError;
}

describe("runCommand: happy path", () => {
  it("returns validated ops with meta fields", async () => {
    const ops = [
      { type: "addNode", id: "kafka", kind: "queue", label: "Kafka" },
      { type: "replicate", id: "api", replicas: 5 },
    ];
    const { client, create } = mockClient(reply({ kind: "ops", ops, message: "Added Kafka.", focusNodeIds: ["kafka", "api"] }));
    const res = await runCommand(request("add kafka and five api servers"), { provider: client });

    expect(res.kind).toBe("ops");
    expect(res.ops).toEqual(ops);
    expect(res.focusNodeIds).toEqual(["kafka", "api"]);
    expect(res).toMatchObject({ baseVersion: 0, attempts: 1, model: "claude-opus-5-5" });
    expect(res.usage).toEqual({ inputTokens: 900, outputTokens: 120, cacheReadTokens: 5000, cacheWriteTokens: 0 });
    expect(res.timings.totalMs).toBeGreaterThanOrEqual(res.timings.llmMs);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("sends the cached static system prompt, effort low, structured output and the refusal fallback", async () => {
    const { client, create } = mockClient(reply({ kind: "noop" }));
    await runCommand({ ...request("hello"), history: ["kill redis"], selection: ["api"] }, { provider: client, requestId: "req-1" });
    const [params, opts] = create.mock.calls[0]!;
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.max_tokens).toBe(COMMAND_MAX_TOKENS);
    expect(params.system).toEqual([{ type: "text", text: COMMAND_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }]);
    expect(params.output_config.effort).toBe("low");
    expect(params.output_config.format.type).toBe("json_schema");
    expect(params.fallbacks).toBe("default");
    expect(params.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(params).not.toHaveProperty("thinking");
    expect(params.messages).toHaveLength(1);
    expect(params.messages[0].content).toContain("<history>kill redis</history>");
    expect(params.messages[0].content).toContain("<selection>api</selection>");
    expect(opts.headers).toEqual({ "X-Request-Id": "req-1" });
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });

  it("passes answers through with focus ids", async () => {
    const { client } = mockClient(reply({ kind: "answer", message: "pg is at ρ=0.83.", focusNodeIds: ["pg"] }));
    const res = await runCommand(request("why is it slow?"), { provider: client });
    expect(res).toMatchObject({ kind: "answer", ops: [], message: "pg is at ρ=0.83.", focusNodeIds: ["pg"] });
  });

  it("reports the model that actually served the request", async () => {
    const { client } = mockClient(reply({ kind: "noop" }, { model: "claude-opus-4-8" }));
    expect((await runCommand(request("hi"), { provider: client })).model).toBe("claude-opus-4-8");
  });

  it("reads the text after the last fallback hop", async () => {
    const msg = reply({ kind: "noop", message: "final" });
    msg.content = [
      { type: "text", text: "{\"partial", citations: null },
      { type: "fallback" } as unknown as Anthropic.Beta.BetaContentBlock,
      ...msg.content,
    ];
    const { client } = mockClient(msg);
    expect((await runCommand(request("hi"), { provider: client })).message).toBe("final");
  });
});

describe("runCommand: repair loop", () => {
  it("repairs invalid ops on attempt 2", async () => {
    const bad = reply({ kind: "ops", ops: [{ type: "connect", from: "api", to: "postgres" }] });
    const good = reply({ kind: "ops", ops: [{ type: "connect", from: "lb", to: "redis" }] });
    const { client, create } = mockClient(bad, good);
    const res = await runCommand(request("connect the lb to the cache"), { provider: client });

    expect(res.attempts).toBe(2);
    expect(res.ops).toEqual([{ type: "connect", from: "lb", to: "redis" }]);
    expect(res.usage.inputTokens).toBe(1800);
    const repair = create.mock.calls[1]![0].messages;
    expect(repair).toHaveLength(3);
    expect(repair[2].content).toContain('node "postgres" not found');
    expect(repair[2].content).toContain('"pg"');
  });

  it("keeps the repair turn append-only: earlier messages are untouched", async () => {
    const bad = reply({ kind: "ops", ops: [{ type: "replicate", id: "ghost", replicas: 2 }] });
    const { client, create } = mockClient(bad, reply({ kind: "noop" }));
    await runCommand(request("scale the ghost"), { provider: client });

    const firstCall = create.mock.calls[0]![0].messages;
    const secondCall = create.mock.calls[1]![0].messages;
    expect(firstCall).toHaveLength(1);
    expect(secondCall[0]).toEqual({ role: "user", content: expect.stringContaining("<utterance>scale the ghost</utterance>") });
    expect(secondCall[1]).toEqual({ role: "assistant", content: bad.content });
    expect(secondCall[1].content).toBe(bad.content);
    expect(secondCall[2].role).toBe("user");
    expect(secondCall[0]).toEqual(firstCall[0]);
  });

  it("falls back to clarify naming the closest ids when the repair also fails", async () => {
    const twoDbs = applyBatch(threeTier, [
      { type: "addNode", id: "orders-db", kind: "sql", label: "Orders DB" },
      { type: "connect", from: "api", to: "orders-db" },
    ] satisfies Op[]);
    if (!twoDbs.ok) throw new Error("fixture");
    const bad = () => reply({ kind: "ops", ops: [{ type: "connect", from: "api", to: "orders" }] });
    const { client } = mockClient(bad(), bad());
    const res = await runCommand(request("connect the api to orders", twoDbs.graph), { provider: client });

    expect(res.kind).toBe("clarify");
    expect(res.attempts).toBe(2);
    expect(res.ops).toEqual([]);
    expect(res.message).toContain('"orders"');
    expect(res.focusNodeIds[0]).toBe("orders-db");
    expect(res.options[0]).toBe("Orders DB");
  });

  it("asks to split a batch over 25 ops without a repair turn (G-06)", async () => {
    const ops = Array.from({ length: 26 }, (_, i) => ({ type: "addNode", kind: "service", label: `svc ${i}` }));
    const { client, create } = mockClient(reply({ kind: "ops", ops }));
    const res = await runCommand(request("add 26 services"), { provider: client });
    expect(res).toMatchObject({ kind: "clarify", attempts: 1, message: "That's a lot at once. Can we do it in parts?" });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("states the limit when numbers stay out of bounds (G-05)", async () => {
    const bad = () => reply({ kind: "ops", ops: [{ type: "replicate", id: "api", replicas: 5000 }] });
    const { client } = mockClient(bad(), bad());
    const res = await runCommand(request("five thousand api servers"), { provider: client });
    expect(res.kind).toBe("clarify");
    expect(res.message).toMatch(/1000/);
  });
});

describe("runCommand: guardrails", () => {
  it("turns destructive ops into confirm (G-03)", async () => {
    const ops = ["redis", "pg", "pg-r1", "pg-r2"].map((id) => ({ type: "removeNode", id }));
    const { client } = mockClient(reply({ kind: "ops", ops, message: "Removed." }));
    const res = await runCommand(request("drop the data tier"), { provider: client });
    expect(res.kind).toBe("confirm");
    expect(res.ops).toHaveLength(4);
    expect(res.message).toMatch(/^This removes 4 components \(Redis, Postgres \(primary\), .*\)\. Go ahead\?$/);
  });

  it("confirms removing half the board even with few nodes", async () => {
    const small = applyBatch(threeTier, [
      ...["lb", "redis", "pg", "pg-r1", "pg-r2"].map((id) => ({ type: "removeNode" as const, id })),
    ]);
    if (!small.ok) throw new Error("fixture");
    const { client } = mockClient(reply({ kind: "ops", ops: [{ type: "removeNode", id: "api" }] }));
    expect((await runCommand(request("remove the api", small.graph), { provider: client })).kind).toBe("confirm");
  });

  it("drops unknown focus ids (G-08) but keeps ids the ops create", async () => {
    const { client } = mockClient(
      reply({
        kind: "ops",
        ops: [{ type: "addNode", id: "cdn", kind: "cdn", label: "CDN" }],
        focusNodeIds: ["cdn", "nope", "api", "cdn"],
      }),
    );
    expect((await runCommand(request("add a cdn"), { provider: client })).focusNodeIds).toEqual(["cdn", "api"]);
  });

  it("downgrades empty ops to noop (G-12)", async () => {
    const { client } = mockClient(reply({ kind: "ops", ops: [], message: "Nothing to change." }));
    const res = await runCommand(request("make it better"), { provider: client });
    expect(res).toMatchObject({ kind: "noop", message: "Nothing to change.", ops: [] });
  });

  it("clears ops on non-edit kinds and trims options to the limits", async () => {
    const { client } = mockClient(
      reply({
        kind: "clarify",
        ops: [{ type: "removeNode", id: "pg" }],
        options: ["a", "b", "c", "d", "e", "x".repeat(60)],
      }),
    );
    const res = await runCommand(request("hmm"), { provider: client });
    expect(res.ops).toEqual([]);
    expect(res.options).toEqual(["a", "b", "c", "d"]);
  });
});

describe("runCommand: errors", () => {
  it("maps a refusal to LLM_REFUSED (G-10)", async () => {
    const { client } = mockClient(reply("", { stop_reason: "refusal", content: [] }));
    expect((await harnessError(runCommand(request("x"), { provider: client }))).code).toBe("LLM_REFUSED");
  });

  it("retries once with 2× max_tokens on truncation (G-11)", async () => {
    const { client, create } = mockClient(
      reply("{\"kind\":\"ops\",\"ops\":[", { stop_reason: "max_tokens" }),
      reply({ kind: "noop" }),
    );
    const res = await runCommand(request("big design"), { provider: client });
    expect(res.kind).toBe("noop");
    expect(res.attempts).toBe(1);
    expect(create.mock.calls.map((c) => c[0].max_tokens)).toEqual([COMMAND_MAX_TOKENS, COMMAND_MAX_TOKENS * 2]);
  });

  it("gives up after the second truncation with LLM_UPSTREAM", async () => {
    const cut = () => reply("{", { stop_reason: "max_tokens" });
    const { client } = mockClient(cut(), cut());
    expect((await harnessError(runCommand(request("x"), { provider: client }))).code).toBe("LLM_UPSTREAM");
  });

  it("maps unparseable output to LLM_UPSTREAM", async () => {
    const { client } = mockClient(reply("not json"));
    expect((await harnessError(runCommand(request("x"), { provider: client }))).code).toBe("LLM_UPSTREAM");
  });

  it("maps a rate limit (after SDK retries) to LLM_UNAVAILABLE", async () => {
    const { client } = mockClient(new Anthropic.RateLimitError(429, undefined, "slow down", new Headers()));
    const err = await harnessError(runCommand(request("x"), { provider: client }));
    expect(err.code).toBe("LLM_UNAVAILABLE");
    expect(err.message).not.toContain("slow down");
  });

  it("maps a connection timeout to LLM_UNAVAILABLE", async () => {
    const { client } = mockClient(new Anthropic.APIConnectionTimeoutError());
    expect((await harnessError(runCommand(request("x"), { provider: client }))).code).toBe("LLM_UNAVAILABLE");
  });

  it("maps other API errors to LLM_UPSTREAM without leaking provider text", async () => {
    const { client } = mockClient(new Anthropic.InternalServerError(500, undefined, "secret upstream detail", new Headers()));
    const err = await harnessError(runCommand(request("x"), { provider: client }));
    expect(err.code).toBe("LLM_UPSTREAM");
    expect(err.message).not.toContain("secret");
  });

  it("aborts at the total budget with LLM_UNAVAILABLE", async () => {
    const create = vi.fn(
      (_params: unknown, opts: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener("abort", () => reject(new Anthropic.APIUserAbortError()));
        }),
    );
    const client = createAnthropicProvider({ client: { beta: { messages: { create } } } as unknown as MessagesClient });
    const err = await harnessError(runCommand(request("x"), { provider: client, budgetMs: 20 }));
    expect(err.code).toBe("LLM_UNAVAILABLE");
    expect(err.message).toMatch(/too long/);
  });

  it("fails fast with LLM_UNAVAILABLE when no API key is configured", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    try {
      const err = await harnessError(runCommand(request("x")));
      expect(err.code).toBe("LLM_UNAVAILABLE");
      expect(err.message).toMatch(/configured/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("rejects an invalid request before calling the model", async () => {
    const { client, create } = mockClient();
    const err = await harnessError(runCommand({ utterance: "", graph: threeTier, baseVersion: 0 }, { provider: client }));
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(create).not.toHaveBeenCalled();
  });
});
