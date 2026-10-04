"use client";

import { useCallback, useState } from "react";
import { sloChecks, type Problem } from "@archie/simulator";
import { useBoardStore } from "../store/board.store";
import { readInterview, type Scorecard } from "./state";

/** Finish → one /api/interview/score call → the scorecard is saved on the board (FR-053). */

export type ScoreState = "idle" | "scoring" | "error" | "done";

function accessCode(): string | null {
  try {
    return sessionStorage.getItem("archie.accessCode");
  } catch {
    return null;
  }
}

export function useScore(problem: Problem) {
  const setInterview = useBoardStore((s) => s.setInterview);
  const [state, setState] = useState<ScoreState>("idle");

  const score = useCallback(async () => {
    const board = useBoardStore.getState().board;
    const interview = readInterview(board?.interview);
    if (!board || !interview) return;
    setState("scoring");
    try {
      const code = accessCode();
      const res = await fetch("/api/interview/score", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(code ? { "X-Archie-Code": code } : {}) },
        body: JSON.stringify({
          problemId: problem.id,
          graph: board.graph,
          transcript: interview.transcript
            .slice(-20)
            .map((t) => ({ role: t.role, text: t.text.slice(0, 1000) })),
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`score ${res.status}`);
      const data = (await res.json()) as Omit<Scorecard, "at">;
      // The checks are this board's, computed here with the same pure function the server uses.
      const checks = sloChecks(board.graph, problem);
      const card: Scorecard = {
        checks,
        rubric: data.rubric,
        overall: data.overall,
        summary: data.summary,
        at: Date.now(),
      };
      const latest = readInterview(useBoardStore.getState().board?.interview) ?? interview;
      setInterview({ ...latest, scorecard: card });
      setState("done");
    } catch {
      setState("error");
    }
  }, [problem, setInterview]);

  return { state, score };
}
