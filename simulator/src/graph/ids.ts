const MAX_ID = 40;

/** "Postgres (primary)" → "postgres-primary" (docs/07 · Ids & naming). */
export function slugify(label: string): string {
  let slug = label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) slug = "node";
  if (!/^[a-z]/.test(slug)) slug = `n-${slug}`;
  return slug.slice(0, MAX_ID).replace(/-+$/, "");
}

/** First free id among base, base-2, base-3, … */
export function uniqueId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, MAX_ID - suffix.length).replace(/-+$/, "")}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export function edgeId(from: string, to: string): string {
  return `${from}->${to}`;
}

/**
 * A label no other component on the board uses ("Redis" → "Redis 2"), so a new component can be
 * referred to by voice and isn't confused with an existing one. Shared by voice and the Add menu.
 */
export function uniqueLabel(label: string, labels: Iterable<string>): string {
  const taken = new Set([...labels].map((l) => l.toLowerCase()));
  if (!taken.has(label.toLowerCase())) return label;
  for (let n = 2; ; n++) if (!taken.has(`${label} ${n}`.toLowerCase())) return `${label} ${n}`;
}
