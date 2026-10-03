"use client";

import { useSyncExternalStore } from "react";

/**
 * Phone layout (doc 06 · Responsive): under 768 px wide, or a phone in landscape (short
 * viewport). `portrait` picks a top → bottom graph layout so wide graphs stay legible.
 */
const COMPACT = "(max-width: 767px), (max-height: 500px)";
const PORTRAIT = "(orientation: portrait)";

function subscribe(onChange: () => void) {
  const queries = [COMPACT, PORTRAIT].map((q) => window.matchMedia(q));
  queries.forEach((mq) => mq.addEventListener("change", onChange));
  return () => queries.forEach((mq) => mq.removeEventListener("change", onChange));
}

// One string snapshot so useSyncExternalStore compares by value.
function snapshot(): string {
  return `${window.matchMedia(COMPACT).matches ? 1 : 0}${window.matchMedia(PORTRAIT).matches ? 1 : 0}`;
}

export function useCompactLayout(): { compact: boolean; portrait: boolean } {
  const value = useSyncExternalStore(subscribe, snapshot, () => "00");
  return { compact: value[0] === "1", portrait: value[1] === "1" };
}
