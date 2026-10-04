/** Display formatting for metrics (compact, tabular-friendly). */

export function compact(n: number): string {
  if (!Number.isFinite(n)) return "–";
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${trim(n / 1e6)}M`;
  if (abs >= 1e3) return `${trim(n / 1e3)}k`;
  return trim(n);
}

function trim(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

export function ms(value: number | null): string {
  if (value === null) return "–";
  if (value < 10) return `${value.toFixed(1)} ms`;
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(2)} s`;
}

export function percent(fraction: number): string {
  const p = fraction * 100;
  if (p === 100 || p === 0) return `${p}%`;
  if (p > 99.9) return `${p.toFixed(2)}%`;
  return `${p.toFixed(1)}%`;
}

export function usd(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/** An op error for people: "op (updateNode): props.replicas Too big: …" → "Too big: …". */
export function opMessage(message: string): string {
  return message.replace(/^op \([^)]*\):\s*(?:props\.)?[\w.]*\s*/, "") || message;
}
