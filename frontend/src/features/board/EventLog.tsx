"use client";

import type { BoardEvent } from "@archie/simulator";
import styles from "./board.module.css";

const SOURCE_LABEL: Record<BoardEvent["source"], string> = {
  fastpath: "⚡ local",
  ai: "✦ AI",
  inspector: "edit",
  "review-fix": "review fix",
  undo: "undo",
  redo: "redo",
  template: "template",
};

function describe(event: BoardEvent): string {
  if (event.utterance) return event.utterance;
  if (event.source === "undo") return "Undid last change";
  if (event.source === "redo") return "Redid change";
  if (event.source === "template") return "Started from a template";
  return `${event.ops.length} change${event.ops.length === 1 ? "" : "s"}`;
}

export function EventLog({ events }: { events: BoardEvent[] }) {
  if (events.length === 0) {
    return <p className={styles.muted}>No changes yet.</p>;
  }
  return (
    <ol className={styles.log} aria-label="Change history">
      {[...events].reverse().map((event) => (
        <li key={event.id}>
          <span className={styles.logText}>{describe(event)}</span>
          <span className={styles.logMeta}>
            {SOURCE_LABEL[event.source]} · v{event.versionAfter} ·{" "}
            {new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </li>
      ))}
    </ol>
  );
}
