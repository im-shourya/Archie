"use client";

import { CloudSlash } from "@phosphor-icons/react/dist/ssr";
import styles from "./commandbar.module.css";

/** Shown after repeated AI failures (docs/15 · Degraded mode, NFR-016). */
export function DegradedBanner() {
  return (
    <p className={styles.banner} role="status" data-testid="degraded-banner">
      <CloudSlash size={16} aria-hidden />
      AI is unavailable. Local commands, simulation, undo and export still work.
    </p>
  );
}
