"use client";

import { useEffect, useRef } from "react";
import styles from "./commandbar.module.css";

/** Destructive AI edits wait here (docs/14 G-03). Confirm applies the held ops locally. */
export function ConfirmDialog({
  message,
  count,
  onConfirm,
  onCancel,
}: {
  message: string;
  count: number;
  onConfirm(): void;
  onCancel(): void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      role="alertdialog"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-message"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <h2 id="confirm-title" className={styles.dialogTitle}>
        Apply {count} change{count === 1 ? "" : "s"}?
      </h2>
      <p id="confirm-message" className={styles.dialogText}>
        {message}
      </p>
      <div className={styles.dialogActions}>
        <button type="button" className={styles.secondaryButton} onClick={onCancel} autoFocus>
          Cancel
        </button>
        <button type="button" className={styles.dangerButton} onClick={onConfirm}>
          Confirm
        </button>
      </div>
    </dialog>
  );
}
