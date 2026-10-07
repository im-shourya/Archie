"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { isTemplateId, PROBLEM_IDS, type ProblemId } from "@archie/simulator";
import { createBoard, createInterviewBoard } from "@/lib/boards";

export function NewBoard() {
  const router = useRouter();
  const params = useSearchParams();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Guard against React StrictMode running the effect twice (would create two boards).
    if (started.current) return;
    started.current = true;
    const template = params.get("template");
    const problem = params.get("problem");
    const create = (PROBLEM_IDS as readonly string[]).includes(problem ?? "")
      ? createInterviewBoard(problem as ProblemId)
      : createBoard(isTemplateId(template) ? template : undefined);
    create
      .then((id) => router.replace(`/b/${id}`))
      .catch((err) => {
        console.error(err);
        setError("Couldn’t create a board in this browser.");
      });
  }, [params, router]);

  return (
    <main style={{ display: "grid", placeContent: "center", minHeight: "100dvh", padding: 16 }}>
      <p style={{ color: "var(--color-text-secondary)" }}>{error ?? "Creating board…"}</p>
    </main>
  );
}
