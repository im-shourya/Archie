"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { validateBatch, type Op } from "@archie/simulator";
import { useBoardStore } from "../store/board.store";

/**
 * AI tier of the command bar (docs/13 §5–6, docs/15 · Client-side recovery, docs/16).
 * Only called when the fast path returns null. Owns the request lifecycle: "thinking…",
 * "still thinking…" after 4 s, abort at 25 s, latest submit wins, stale-board re-validation,
 * and degraded mode after 2 consecutive 502/503s.
 */

export const SLOW_MS = 4_000;
export const ABORT_MS = 25_000;
const DEGRADE_AFTER = 2;
const HEALTH_POLL_MS = 30_000;
const ACCESS_CODE_KEY = "archie.accessCode";

/** Response of POST /api/command (specs/command-schema.json → CommandResponse). */
export interface AiResponse {
  kind: "ops" | "clarify" | "confirm" | "answer" | "noop";
  ops: Op[];
  message: string;
  options: string[];
  focusNodeIds: string[];
  baseVersion: number;
  attempts: number;
  model: string;
  timings: { totalMs: number; llmMs?: number };
}

export type AiState =
  | { phase: "idle" }
  | { phase: "thinking"; utterance: string; slow: boolean }
  | { phase: "clarify"; utterance: string; message: string; options: string[] }
  | { phase: "confirm"; utterance: string; message: string; ops: Op[]; baseVersion: number; llmMs?: number; ms: number }
  | { phase: "answer"; message: string; focus: string[] };

export type AiOutcome =
  | { type: "applied"; message: string; ms: number }
  | { type: "noop"; message: string }
  | { type: "stale" }
  | { type: "error"; message: string; requestId: string | null; retry: string | null };

interface RunContext {
  selection: string[];
  history: string[];
}

function accessCode(): string | null {
  try {
    return sessionStorage.getItem(ACCESS_CODE_KEY);
  } catch {
    return null;
  }
}

function errorMessage(status: number, code: string | undefined, message: string | undefined, retryAfter: string | null) {
  switch (code) {
    case "RATE_LIMITED":
      return `Too many requests. Try again in ${retryAfter ?? "a few"} seconds.`;
    case "DAILY_CAP_REACHED":
      return "The AI's daily limit is used up. Local commands still work.";
    case "ACCESS_CODE_REQUIRED":
      return "This demo needs an access code for AI commands.";
    case "LLM_REFUSED":
      return "I can’t help with that one.";
    case "PAYLOAD_TOO_LARGE":
      return "This board is too large for the AI (200 components max).";
    default:
      return message || (status >= 500 ? "The AI is unavailable right now." : "Something went wrong.");
  }
}

export function useCommand(onOutcome: (outcome: AiOutcome) => void) {
  const apply = useBoardStore((s) => s.apply);
  const setFocus = useBoardStore((s) => s.setFocus);
  const [state, setState] = useState<AiState>({ phase: "idle" });
  const [degraded, setDegraded] = useState(false);
  const inflight = useRef<AbortController | null>(null);
  const failures = useRef(0);
  const outcome = useRef(onOutcome);
  useEffect(() => {
    outcome.current = onOutcome;
  }, [onOutcome]);

  /** Move to a state that shows no highlighted nodes. */
  const settle = useCallback(
    (next: AiState) => {
      setState(next);
      setFocus([]);
    },
    [setFocus],
  );

  /** Apply AI ops, re-validating when the board changed while the AI was thinking (G-09). */
  const applyOps = useCallback(
    (ops: Op[], baseVersion: number, utterance: string, message: string, ms: number, llmMs?: number) => {
      const graph = useBoardStore.getState().board?.graph;
      if (!graph || (graph.version !== baseVersion && validateBatch(graph, ops).length > 0)) {
        outcome.current({ type: "stale" });
        return;
      }
      const timings = { totalMs: Math.round(ms), ...(llmMs !== undefined ? { llmMs: Math.round(llmMs) } : {}) };
      const result = apply(ops, { utterance, source: "ai", timings });
      outcome.current(result.ok ? { type: "applied", message, ms } : { type: "stale" });
    },
    [apply],
  );

  const fail = useCallback((message: string, requestId: string | null, retry: string | null, countsAsOutage: boolean) => {
    if (countsAsOutage) {
      failures.current += 1;
      if (failures.current >= DEGRADE_AFTER) setDegraded(true);
    }
    outcome.current({ type: "error", message, requestId, retry });
  }, []);

  const run = useCallback(
    async (utterance: string, ctx: RunContext) => {
      const graph = useBoardStore.getState().board?.graph;
      if (!graph) return;
      inflight.current?.abort();
      const controller = new AbortController();
      inflight.current = controller;
      const isCurrent = () => inflight.current === controller;

      settle({ phase: "thinking", utterance, slow: false });
      const started = performance.now();
      let timedOut = false;
      const slowTimer = setTimeout(() => {
        if (isCurrent()) setState({ phase: "thinking", utterance, slow: true });
      }, SLOW_MS);
      const abortTimer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, ABORT_MS);

      try {
        const code = accessCode();
        const res = await fetch("/api/command", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(code ? { "X-Archie-Code": code } : {}) },
          body: JSON.stringify({
            utterance,
            graph,
            baseVersion: graph.version,
            selection: ctx.selection.slice(0, 50),
            history: ctx.history.slice(-5),
          }),
          signal: controller.signal,
        });
        if (!isCurrent()) return;
        const requestId = res.headers.get("X-Request-Id");

        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
          const errCode = body?.error?.code;
          settle({ phase: "idle" });
          if (errCode === "DAILY_CAP_REACHED") setDegraded(true);
          const retryable = res.status >= 500 || res.status === 429;
          fail(
            errorMessage(res.status, errCode, body?.error?.message, res.headers.get("Retry-After")),
            requestId,
            retryable && errCode !== "DAILY_CAP_REACHED" ? utterance : null,
            res.status === 502 || res.status === 503,
          );
          return;
        }

        const data = (await res.json()) as AiResponse;
        if (!isCurrent()) return;
        failures.current = 0;
        setDegraded(false);
        const ms = performance.now() - started;

        switch (data.kind) {
          case "ops":
            settle({ phase: "idle" });
            applyOps(data.ops, data.baseVersion, utterance, data.message, ms, data.timings.llmMs);
            break;
          case "clarify":
            setState({ phase: "clarify", utterance, message: data.message, options: data.options });
            setFocus(data.focusNodeIds);
            break;
          case "confirm":
            setState({
              phase: "confirm",
              utterance,
              message: data.message,
              ops: data.ops,
              baseVersion: data.baseVersion,
              llmMs: data.timings.llmMs,
              ms,
            });
            setFocus(data.focusNodeIds);
            break;
          case "answer":
            setState({ phase: "answer", message: data.message, focus: data.focusNodeIds });
            setFocus([]);
            break;
          case "noop":
            settle({ phase: "idle" });
            outcome.current({ type: "noop", message: data.message });
            break;
        }
      } catch {
        // A newer submit aborted this one: it owns the UI now.
        if (!isCurrent()) return;
        settle({ phase: "idle" });
        fail(
          timedOut ? "The AI took too long. Try again." : "Couldn’t reach the server. Check your connection.",
          null,
          utterance,
          true,
        );
      } finally {
        clearTimeout(slowTimer);
        clearTimeout(abortTimer);
        if (isCurrent()) inflight.current = null;
      }
    },
    [applyOps, fail, setFocus, settle],
  );

  /** Clarify round-trip (docs/13 §6): re-send the original with the choice appended. */
  const choose = useCallback(
    (option: string, ctx: RunContext) => {
      if (state.phase !== "clarify") return;
      void run(`${state.utterance} (answer: ${option})`, ctx);
    },
    [run, state],
  );

  /** Apply the held ops locally. No second AI call. */
  const confirm = useCallback(() => {
    if (state.phase !== "confirm") return;
    settle({ phase: "idle" });
    applyOps(state.ops, state.baseVersion, state.utterance, state.message, state.ms, state.llmMs);
  }, [applyOps, settle, state]);

  const cancel = useCallback(() => {
    if (state.phase === "thinking") inflight.current?.abort();
    inflight.current = null;
    settle({ phase: "idle" });
  }, [settle, state.phase]);

  // Degraded mode clears when the API is healthy again (docs/15 · Degraded mode).
  useEffect(() => {
    if (!degraded) return;
    const id = setInterval(() => {
      void fetch("/api/health")
        .then((r) => (r.ok ? (r.json() as Promise<{ llm?: string }>) : null))
        .then((h) => {
          if (h?.llm === "configured") {
            failures.current = 0;
            setDegraded(false);
          }
        })
        .catch(() => {});
    }, HEALTH_POLL_MS);
    return () => clearInterval(id);
  }, [degraded]);

  useEffect(() => () => inflight.current?.abort(), []);

  // Stable identity, so callers can list it in effect deps without re-running on every render.
  return useMemo(
    () => ({ state, degraded, run, choose, confirm, cancel, setFocus }),
    [state, degraded, run, choose, confirm, cancel, setFocus],
  );
}
