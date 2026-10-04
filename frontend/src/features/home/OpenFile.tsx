"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { decodeBoardFile, MAX_BOARD_FILE_BYTES } from "@archie/database";
import { createBoardFromGraph } from "@/lib/boards";
import styles from "./home.module.css";

/** Open file: import an Export → JSON file as a new board (FR-043, docs/28 · backups). */
export function OpenFile() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function open(file: File) {
    setError(null);
    if (file.size > MAX_BOARD_FILE_BYTES) return setError("That file is larger than 1 MB.");
    setBusy(true);
    const decoded = decodeBoardFile(await file.text());
    if (!decoded.ok) {
      setBusy(false);
      return setError(decoded.error);
    }
    try {
      router.push(`/b/${await createBoardFromGraph(decoded.value.name, decoded.value.graph)}`);
    } catch (err) {
      console.error(err);
      setError("Couldn’t save the board in this browser.");
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={styles.inlineLink} onClick={() => input.current?.click()} disabled={busy}>
        {busy ? "opening…" : "open a saved board file"}
      </button>
      .
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        hidden
        data-testid="open-file"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (file) void open(file);
        }}
      />
      {error && (
        <span className={styles.fileError} role="alert">
          {error}
        </span>
      )}
    </>
  );
}
