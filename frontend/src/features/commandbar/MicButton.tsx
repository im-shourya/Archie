"use client";

import { Microphone } from "@phosphor-icons/react/dist/ssr";
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
      <Microphone size={18} aria-hidden />
    </button>
  );
}
