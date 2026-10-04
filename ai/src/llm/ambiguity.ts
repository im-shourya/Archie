import type { ArchNode, Graph, Op } from "@archie/simulator";
import { isKindWord, resolveRef } from "../fastpath/resolve";

/**
 * G-13 (docs/14): "the database" on a board with two databases is ambiguous. The prompt asks the
 * model to clarify, but it sometimes guesses (ambiguity-08 in the final test split), so the check
 * is also enforced in code with the fast path's resolver: same rules, including treating a SQL
 * primary and its read replicas as one cluster.
 */

export interface AmbiguousRef {
  /** The kind word as spoken, e.g. "database". */
  phrase: string;
  candidates: ArchNode[];
}

/** "the" + a pure kind word (database, service, cache…), never a name ("the orders database"). */
const DEFINITE = /\bthe ([a-z]+(?: [a-z]+)?)\b/g;

export function ambiguousRefs(utterance: string, graph: Graph): AmbiguousRef[] {
  const text = utterance.toLowerCase().replace(/[^a-z0-9 ]+/g, " ");
  const found = new Map<string, AmbiguousRef>();
  for (const match of text.matchAll(DEFINITE)) {
    const words = match[1]!.split(" ");
    // "the load balancer" is a two-word kind; "the users database" is a name (a word, then a kind
    // word), so its first word isn't a reference on its own; "the database to…" is one word.
    const phrase = isKindWord(words.join(" "))
      ? words.join(" ")
      : words.length === 2 && isKindWord(words[1]!)
        ? null
        : isKindWord(words[0]!)
          ? words[0]!
          : null;
    if (!phrase || found.has(phrase)) continue;
    const r = resolveRef(phrase, graph);
    if (r.kind === "ambiguous") found.set(phrase, { phrase, candidates: r.candidates });
  }
  return [...found.values()];
}

/** Node ids an op touches. */
export function touchedIds(ops: readonly Op[]): Set<string> {
  const ids = new Set<string>();
  for (const op of ops) {
    if ("id" in op && op.id) ids.add(op.id);
    if ("from" in op) ids.add(op.from).add(op.to);
  }
  return ids;
}

/** The first ambiguous reference where the edit picked some candidates but not all of them. */
export function guessedRef(utterance: string, graph: Graph, ops: readonly Op[]): AmbiguousRef | null {
  const touched = touchedIds(ops);
  for (const ref of ambiguousRefs(utterance, graph)) {
    const hit = ref.candidates.filter((n) => touched.has(n.id)).length;
    if (hit > 0 && hit < ref.candidates.length) return ref;
  }
  return null;
}
