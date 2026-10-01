/** Locale-independent number formatting for explanations (deterministic across machines). */

export function int(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function rho(n: number): string {
  return n.toFixed(2);
}

/** 0.2857 → "28.6", 0.2 → "20" */
export function pct(fraction: number): string {
  return String(Math.round(fraction * 1000) / 10);
}

export function plural(n: number, word: string): string {
  return `${int(n)} ${word}${Math.round(n) === 1 ? "" : "s"}`;
}
