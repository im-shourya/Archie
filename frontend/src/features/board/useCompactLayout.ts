"use client";

import { useSyncExternalStore } from "react";

/**
 * Phone layout (doc 06 · Responsive): under 768 px wide, or a phone in landscape (short
 * viewport). `vertical`: portrait phones and tablets lay the graph out top → bottom, so wide
 * graphs stay legible in a tall canvas.
 */
const COMPACT = "(max-width: 767px), (max-height: 500px)";
const VERTICAL = "(orientation: portrait) and (max-width: 1279px)";

function subscribe(onChange: () => void) {
  const queries = [COMPACT, VERTICAL].map((q) => window.matchMedia(q));
  queries.forEach((mq) => mq.addEventListener("change", onChange));
  return () => queries.forEach((mq) => mq.removeEventListener("change", onChange));
}

// One string snapshot so useSyncExternalStore compares by value.
function snapshot(): string {
  return `${window.matchMedia(COMPACT).matches ? 1 : 0}${window.matchMedia(VERTICAL).matches ? 1 : 0}`;
}

export function useCompactLayout(): { compact: boolean; vertical: boolean } {
  const value = useSyncExternalStore(subscribe, snapshot, () => "00");
  return { compact: value[0] === "1", vertical: value[1] === "1" };
}
