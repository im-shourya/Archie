"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./commandbar.module.css";

/**
 * Demo access code (docs/18 · Optional access code flow). Shown on a 401 ACCESS_CODE_REQUIRED;
 * the held utterance is re-sent with the code. After too many wrong codes the server answers
 * 429 and the dialog counts down instead.
 */
export function AccessCodeDialog({
  error,
  retryAt,
  onSubmit,
  onCancel,
}: {
  error: string | null;
  retryAt: number | null;
  onSubmit(code: string): void;
  onCancel(): void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [code, setCode] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const wait = retryAt ? Math.max(0, Math.ceil((retryAt - now) / 1000)) : 0;

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  useEffect(() => {
    if (!retryAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [retryAt]);

  const message = wait > 0 ? `Too many tries. Try again in ${wait} s.` : error;

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="code-title"
      aria-describedby="code-text"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim() && wait === 0) onSubmit(code);
        }}
      >
        <h2 id="code-title" className={styles.dialogTitle}>
          This demo needs an access code
        </h2>
        <p id="code-text" className={styles.dialogText}>
          AI commands are limited to people with the code. Local commands like “kill redis” work
          without it. The code is kept for this tab only.
        </p>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Access code</span>
          <input
            className={styles.fieldInput}
            type="password"
            autoComplete="off"
            autoFocus
            required
            value={code}
            aria-invalid={message ? true : undefined}
            aria-describedby={message ? "code-error" : undefined}
            onChange={(e) => setCode(e.currentTarget.value)}
          />
        </label>
        {message && (
          <p id="code-error" className={styles.fieldError} role="alert">
            {message}
          </p>
        )}
        <div className={styles.dialogActions}>
          <button type="button" className={styles.secondaryButton} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="submit"
            className={styles.primaryButton}
            disabled={wait > 0 || !code.trim()}
          >
            Continue
          </button>
        </div>
      </form>
    </dialog>
  );
}
