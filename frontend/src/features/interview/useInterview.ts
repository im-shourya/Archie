"use client";

import { useCallback, useRef, useState } from "react";
import { fallbackQuestion, type Problem, type SloCheck } from "@archie/simulator";
import { useBoardStore } from "../store/board.store";
import { INTERVIEW_TURN_CAP, readInterview, type InterviewState, type Turn } from "./state";

/**
 * Interview turn lifecycle (FR-052, docs/34 Step 6). The board's interview state is the source of
 * truth; this hook appends turns and asks the server for the next question. When the AI is
 * unavailable it asks the same deterministic question the server would ("offline question"), so
 * the interview never stalls. Questions are asked only on demand, capped at INTERVIEW_TURN_CAP.
 */

const MAX_SENT_TURNS = 20;
const ABORT_MS = 25_000;

function accessCode(): string | null {
  try {
    return sessionStorage.getItem("archie.accessCode");
  } catch {
    return null;
  }
}

export type AskState =
  { phase: "idle" } | { phase: "thinking"; slow: boolean } | { phase: "error"; message: string };

export function useInterview(problem: Problem, checks: readonly SloCheck[]) {
  const setInterview = useBoardStore((s) => s.setInterview);
  const [ask, setAsk] = useState<AskState>({ phase: "idle" });
  const inflight = useRef<AbortController | null>(null);

  const current = useCallback(
    (): InterviewState | null => readInterview(useBoardStore.getState().board?.interview),
    [],
  );

  const save = useCallback(
    (update: (s: InterviewState) => InterviewState) => {
      const state = current();
      if (state) setInterview(update(state));
    },
    [current, setInterview],
  );

  /** Utterances since the last interviewer question: what the candidate changed meanwhile. */
  const changesSince = useCallback((at: number) => {
    const events = useBoardStore.getState().events;
    return events
      .filter((e) => e.at > at && e.utterance)
      .map((e) => e.utterance!.slice(0, 200))
      .slice(-10);
  }, []);

  const askNext = useCallback(async () => {
    const state = current();
    const graph = useBoardStore.getState().board?.graph;
    if (!state || !graph || state.turnsUsed >= INTERVIEW_TURN_CAP) return;
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;
    setAsk({ phase: "thinking", slow: false });
    const slow = setTimeout(
      () => setAsk((a) => (a.phase === "thinking" ? { phase: "thinking", slow: true } : a)),
      4000,
    );
    const timeout = setTimeout(() => controller.abort(), ABORT_MS);
    const lastQuestion = [...state.transcript].reverse().find((t) => t.role === "interviewer");
    const offline = () => {
      const fallback = fallbackQuestion(problem, checks, state.transcript);
      const turn: Turn = {
        role: "interviewer",
        text: fallback.question,
        at: Date.now(),
        source: "offline",
        focusNodeIds: fallback.focusNodeIds,
      };
      save((s) => ({ ...s, transcript: [...s.transcript, turn] }));
    };
    try {
      const code = accessCode();
      const res = await fetch("/api/interview/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(code ? { "X-Archie-Code": code } : {}) },
        body: JSON.stringify({
          problemId: problem.id,
          graph,
          transcript: state.transcript
            .slice(-MAX_SENT_TURNS)
            .map((t) => ({ role: t.role, text: t.text.slice(0, 1000) })),
          changes: changesSince(lastQuestion?.at ?? state.startedAt),
        }),
        signal: controller.signal,
      });
      if (inflight.current !== controller) return;
      if (!res.ok) {
        offline();
        setAsk({ phase: "idle" });
        return;
      }
      const data = (await res.json()) as {
        question: string;
        focusNodeIds: string[];
        source: "ai" | "fallback";
      };
      const turn: Turn = {
        role: "interviewer",
        text: data.question,
        at: Date.now(),
        source: data.source === "ai" ? "ai" : "hint",
        focusNodeIds: data.focusNodeIds,
      };
      save((s) => ({ ...s, transcript: [...s.transcript, turn], turnsUsed: s.turnsUsed + 1 }));
      setAsk({ phase: "idle" });
    } catch {
      if (inflight.current !== controller) return;
      offline();
      setAsk({ phase: "idle" });
    } finally {
      clearTimeout(slow);
      clearTimeout(timeout);
      if (inflight.current === controller) inflight.current = null;
    }
  }, [current, problem, checks, save, changesSince]);

  /** Record the candidate's answer, then ask the next question (one call). */
  const answer = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      save((s) => ({
        ...s,
        transcript: [
          ...s.transcript,
          { role: "candidate", text: trimmed.slice(0, 1000), at: Date.now() },
        ],
      }));
      await askNext();
    },
    [save, askNext],
  );

  return { ask, askNext, answer };
}
