"use client";

import { MessageSquareText, X } from "lucide-react";
import styles from "./commandbar.module.css";

/** An AI answer about the board. Hover or focus highlights the nodes it refers to. */
export function AnswerCard({
  message,
  focus,
  onHighlight,
  onDismiss,
}: {
  message: string;
  focus: string[];
  onHighlight(ids: string[]): void;
  onDismiss(): void;
}) {
  const on = () => onHighlight(focus);
  const off = () => onHighlight([]);
  return (
    <section
      className={styles.panel}
      aria-label="Answer"
      data-testid="answer"
      tabIndex={focus.length > 0 ? 0 : undefined}
      onMouseEnter={on}
      onMouseLeave={off}
      onFocus={on}
      onBlur={off}
    >
      <div className={styles.panelHead}>
        <MessageSquareText className={styles.panelIcon} size={16} aria-hidden />
        <p className={styles.panelText}>{message}</p>
        <button type="button" className={styles.iconButton} onClick={onDismiss} aria-label="Dismiss answer">
          <X size={16} aria-hidden />
        </button>
      </div>
    </section>
  );
}
