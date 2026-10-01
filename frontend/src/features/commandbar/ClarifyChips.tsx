"use client";

import { X } from "lucide-react";
import styles from "./commandbar.module.css";

/** Clarifying question with tappable answers (docs/13 §6). Keys 1–4 pick an option. */
export function ClarifyChips({
  message,
  options,
  onChoose,
  onDismiss,
}: {
  message: string;
  options: string[];
  onChoose(option: string): void;
  onDismiss(): void;
}) {
  return (
    <section className={styles.panel} aria-label="Clarifying question" data-testid="clarify">
      <div className={styles.panelHead}>
        <p className={styles.panelText}>{message}</p>
        <button type="button" className={styles.iconButton} onClick={onDismiss} aria-label="Dismiss question">
          <X size={16} aria-hidden />
        </button>
      </div>
      {options.length > 0 && (
        <div className={styles.chips}>
          {options.map((option, i) => (
            <button key={option} type="button" className={styles.chip} onClick={() => onChoose(option)}>
              <kbd className={styles.chipKey} aria-hidden>
                {i + 1}
              </kbd>
              {option}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
