"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getRepository, type BoardSummary } from "@archie/database";
import styles from "./home.module.css";

function timeAgo(ms: number): string {
  const minutes = Math.round((Date.now() - ms) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(ms).toLocaleDateString();
}

export function RecentBoards() {
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [persistent, setPersistent] = useState(true);

  const refresh = useCallback(async () => {
    const repo = await getRepository();
    setPersistent(repo.persistent);
    setBoards(await repo.listBoards());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function remove(board: BoardSummary) {
    if (!window.confirm(`Delete “${board.name}”? This can’t be undone.`)) return;
    await (await getRepository()).deleteBoard(board.id);
    await refresh();
  }

  return (
    <section aria-labelledby="recent-heading" className={styles.section}>
      <h2 id="recent-heading" className={styles.sectionTitle}>
        Recent boards
      </h2>
      {!persistent && (
        <p className={styles.banner} role="status">
          This browser won’t save boards between visits.
        </p>
      )}
      {boards === null ? (
        <p className={styles.muted} aria-busy="true">
          Loading…
        </p>
      ) : boards.length === 0 ? (
        <p className={styles.muted}>No boards yet. Start with a template.</p>
      ) : (
        <ul className={styles.list}>
          {boards.map((b) => (
            <li key={b.id} className={styles.row}>
              <Link href={`/b/${b.id}`} className={styles.rowLink}>
                <span className={styles.rowName}>{b.name}</span>
                <span className={styles.muted}>
                  {b.nodeCount} component{b.nodeCount === 1 ? "" : "s"} · {timeAgo(b.updatedAt)}
                </span>
              </Link>
              <button type="button" className={styles.ghost} onClick={() => void remove(b)} aria-label={`Delete ${b.name}`}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
