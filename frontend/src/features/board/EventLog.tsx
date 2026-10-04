"use client";

import Link from "next/link";
import { ClockCounterClockwise } from "@phosphor-icons/react/dist/ssr";
import type { BoardEvent } from "@archie/simulator";
import { useBoardStore } from "../store/board.store";
import styles from "./board.module.css";

const SOURCE_LABEL: Record<BoardEvent["source"], string> = {
  fastpath: "voice · local",
  ai: "voice · AI",
  inspector: "edit",
  "review-fix": "review fix",
  undo: "undo",
  redo: "redo",
  template: "template",
};

export function describeEvent(event: BoardEvent): string {
  if (event.utterance) return event.utterance;
  if (event.source === "undo") return "Undid last change";
  if (event.source === "redo") return "Redid change";
  if (event.source === "template") return "Started from a template";
  return `${event.ops.length} change${event.ops.length === 1 ? "" : "s"}`;
}

export function EventLog({ events }: { events: BoardEvent[] }) {
  const boardId = useBoardStore((s) => s.board?.id);
  if (events.length === 0) {
    return <p className={styles.muted}>No changes yet.</p>;
  }
  return (
    <>
      {boardId && (
        <Link href={`/b/${boardId}/replay`} className={styles.replayLink}>
          <ClockCounterClockwise size={16} aria-hidden /> Replay this session
        </Link>
      )}
      <ol className={styles.log} aria-label="Change history">
        {[...events].reverse().map((event) => (
          <li key={event.id}>
            <span className={styles.logText}>{describeEvent(event)}</span>
            <span className={styles.logMeta}>
              {SOURCE_LABEL[event.source]} · v{event.versionAfter} ·{" "}
              {new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}
