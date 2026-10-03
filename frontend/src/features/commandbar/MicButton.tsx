"use client";

import { Mic } from "lucide-react";
import styles from "./commandbar.module.css";

/** Browser-speech toggle (FR-062). Rendered only where the Web Speech API exists. */
export function MicButton({ listening, onToggle }: { listening: boolean; onToggle(): void }) {
  return (
    <button
      type="button"
      className={styles.micButton}
      aria-pressed={listening}
      aria-label="Dictate with the browser"
      title="Dictate with the browser’s speech recognition. Wispr Flow is the main way to talk to Archie."
      onClick={onToggle}
    >
      <Mic size={18} strokeWidth={1.75} aria-hidden />
    </button>
  );
}
