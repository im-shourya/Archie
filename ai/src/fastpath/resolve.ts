import { CATALOG, NODE_KINDS, type ArchNode, type Graph, type NodeKind } from "@archie/simulator";

/**
 * Resolve a spoken reference ("redis", "the db", "it", "postgres replica 1") to exactly one
 * node, or report it as ambiguous / unknown (docs/13 §3). The fast path never guesses: only a
 * single candidate counts as resolved.
 */

export interface ResolveContext {
  /** Node ids currently selected on the canvas. */
  selection?: readonly string[];
  /** Node ids touched by the most recent change (for "it", "bring it back"). */
  recent?: readonly string[];
}

export type Resolution =
  | { kind: "ok"; node: ArchNode }
  | { kind: "ambiguous"; candidates: ArchNode[] }
  | { kind: "none" };

const PRONOUNS = new Set(["it", "that", "this", "them", "those"]);
const ARTICLES = new Set(["the", "a", "an", "my", "our", "that", "this", "its"]);
const GENERIC_SUFFIXES = new Set(["node", "component", "box", "instance"]);

/** Words that mean "a datastore" without naming the engine. */
const GENERIC_KIND_WORDS: Record<string, readonly NodeKind[]> = {
  database: ["sql", "nosql"],
  db: ["sql", "nosql"],
  datastore: ["sql", "nosql"],
  storage: ["objectstore", "sql", "nosql"],
};

const stem = (word: string) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word);

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map(stem);
}

/** Kind-word → kinds, built once from the catalog aliases. */
const KIND_WORDS: Map<string, readonly NodeKind[]> = (() => {
  const map = new Map<string, NodeKind[]>();
  for (const kind of NODE_KINDS) {
    for (const alias of [kind, ...CATALOG[kind].aliases]) {
      const key = tokens(alias).join(" ");
      map.set(key, [...(map.get(key) ?? []), kind]);
    }
  }
  for (const [word, kinds] of Object.entries(GENERIC_KIND_WORDS)) map.set(stem(word), [...kinds]);
  return map;
})();

/** A word or two that names a kind of component ("database", "load balancer", "kafka"), not a node. */
export function isKindWord(phrase: string): boolean {
  return KIND_WORDS.has(tokens(phrase).join(" "));
}

/** The kinds a kind word can mean: "redis" → cache; "database" → sql or nosql. */
export function kindsOf(phrase: string): readonly NodeKind[] {
  // A kind is listed under its own name and as an alias ("cache"), so de-duplicate.
  return [...new Set(KIND_WORDS.get(tokens(phrase).join(" ")) ?? [])];
}

function decide(candidates: ArchNode[], spanTokens: readonly string[]): Resolution | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return { kind: "ok", node: candidates[0]! };
  // A SQL primary and its read replicas are one cluster: "postgres" / "the database" means the
  // primary unless the user said "replica". Deterministic, not a guess (docs/13 §3).
  if (!spanTokens.includes("replica")) {
    const primaries = candidates.filter((n) => !(n.kind === "sql" && n.props.role === "replica"));
    if (primaries.length === 1) return { kind: "ok", node: primaries[0]! };
    // Report clusters, not every replica, so a clarifying question lists real choices.
    if (primaries.length > 1) return { kind: "ambiguous", candidates: primaries };
  }
  return { kind: "ambiguous", candidates };
}

export function resolveRef(span: string, graph: Graph, ctx: ResolveContext = {}): Resolution {
  const raw = span.trim().toLowerCase();
  if (!raw) return { kind: "none" };
  // Conjunctions inside a reference mean two things were named: never pick one.
  if (/\b(and|or|plus|then)\b/.test(raw)) return { kind: "none" };

  // 1. Pronouns: the single selected node, else the single node touched last.
  if (PRONOUNS.has(raw) || raw === "that one" || raw === "this one") {
    const byId = (ids: readonly string[] = []) =>
      ids.map((id) => graph.nodes.find((n) => n.id === id)).filter((n): n is ArchNode => !!n);
    const selected = byId(ctx.selection);
    if (selected.length === 1) return { kind: "ok", node: selected[0]! };
    if (selected.length > 1) return { kind: "ambiguous", candidates: selected };
    const recent = byId(ctx.recent);
    return decide(recent, []) ?? { kind: "none" };
  }

  let words = raw.split(" ");
  while (words.length > 1 && ARTICLES.has(words[0]!)) words = words.slice(1);
  while (words.length > 1 && GENERIC_SUFFIXES.has(words[words.length - 1]!)) words = words.slice(0, -1);
  const phrase = words.join(" ");
  const spanTokens = tokens(phrase);
  if (spanTokens.length === 0) return { kind: "none" };
  const key = spanTokens.join(" ");

  // 2. Exact id or label.
  const exact = graph.nodes.filter(
    (n) => n.id === phrase || n.id === words.join("-") || tokens(n.label).join(" ") === key,
  );
  const exactResult = decide(exact, spanTokens);
  if (exactResult) return exactResult;

  // 3. Every spoken word appears in the label or id ("chat" → "Chat service").
  const contains = graph.nodes.filter((n) => {
    const nodeTokens = new Set([...tokens(n.label), ...tokens(n.id)]);
    return spanTokens.every((t) => nodeTokens.has(t));
  });
  const containsResult = decide(contains, spanTokens);
  if (containsResult) return containsResult;

  // 4. Kind words and aliases ("the cache", "the load balancer", "kafka").
  const kinds = KIND_WORDS.get(key);
  if (kinds) {
    const byKind = graph.nodes.filter((n) => kinds.includes(n.kind));
    const kindResult = decide(byKind, spanTokens);
    if (kindResult) return kindResult;
  }

  return { kind: "none" };
}
