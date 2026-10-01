import { applyBatch, type ArchNode, type Graph, type OpError } from "@archie/simulator";
import { MAX_FOCUS, MAX_MESSAGE, MAX_OPTION_CHARS, MAX_OPTIONS, type CommandResult } from "./schemas";

/**
 * Post-checks on a validated result (docs/14). Enforced in code, not just asked for in the prompt.
 * Pure: graph + result in, result out.
 */

/** G-03: more than this many removals needs a confirmation. */
export const MAX_SILENT_REMOVALS = 3;

const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);

function removedIds(result: CommandResult): string[] {
  return result.ops.flatMap((op) => (op.type === "removeNode" ? [op.id] : []));
}

/** G-03: > 3 removals, or removing half the board or more. */
export function isDestructive(result: CommandResult, graph: Graph): boolean {
  const removed = new Set(removedIds(result)).size;
  if (removed === 0) return false;
  return removed > MAX_SILENT_REMOVALS || removed * 2 >= graph.nodes.length;
}

function labelsFor(ids: readonly string[], graph: Graph): string {
  const names = ids.map((id) => graph.nodes.find((n) => n.id === id)?.label ?? id);
  const shown = names.slice(0, 5).join(", ");
  return names.length > 5 ? `${shown} and ${names.length - 5} more` : shown;
}

const DEFAULT_MESSAGE: Record<CommandResult["kind"], string> = {
  ops: "Done.",
  clarify: "Can you say a bit more about what you mean?",
  confirm: "This is a big change. Go ahead?",
  answer: "I don't have enough information on the board to answer that.",
  noop: "I can only help with the design on this board.",
};

/**
 * Apply the guardrails to a result whose ops already passed validateBatch.
 * - G-12 `ops`/`confirm` with no ops → `noop`
 * - G-03 destructive `ops` → `confirm`
 * - G-08 focus ids limited to nodes that exist (before or after the edit)
 * - fields that don't belong to the kind are cleared, and the spec limits are enforced
 */
export function applyGuardrails(result: CommandResult, graph: Graph): CommandResult {
  let { kind, message } = result;
  let ops = kind === "ops" || kind === "confirm" ? result.ops : [];

  if ((kind === "ops" || kind === "confirm") && ops.length === 0) {
    kind = "noop";
  } else if (kind === "ops" && isDestructive({ ...result, ops }, graph)) {
    const removed = [...new Set(removedIds({ ...result, ops }))];
    kind = "confirm";
    message = `This removes ${removed.length} component${removed.length === 1 ? "" : "s"} (${labelsFor(removed, graph)}). Go ahead?`;
  }

  const after = ops.length > 0 ? applyBatch(graph, ops) : null;
  const known = new Set(graph.nodes.map((n) => n.id));
  if (after?.ok) for (const n of after.graph.nodes) known.add(n.id);
  const focusNodeIds = [...new Set(result.focusNodeIds)].filter((id) => known.has(id)).slice(0, MAX_FOCUS);

  const options =
    kind === "clarify"
      ? result.options
          .map((o) => o.trim())
          .filter(Boolean)
          .slice(0, MAX_OPTIONS)
          .map((o) => clip(o, MAX_OPTION_CHARS))
      : [];

  if (kind !== "ops" && kind !== "confirm") ops = [];
  message = clip(message.trim() || DEFAULT_MESSAGE[kind], MAX_MESSAGE);
  return { kind, ops, message, options, focusNodeIds };
}

/** Plain edit distance; ids and labels are short, so O(n·m) is fine. */
export function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length]!;
}

/** Nodes closest to a missing id, by id/label similarity (G-02). */
export function closestNodes(missing: string, graph: Graph, limit = MAX_OPTIONS): ArchNode[] {
  const target = missing.toLowerCase();
  const score = (n: ArchNode) => {
    const label = n.label.toLowerCase();
    const contains = label.includes(target) || target.includes(n.id) || n.id.includes(target) ? 0 : 1;
    return contains * 100 + Math.min(editDistance(target, n.id), editDistance(target, label));
  };
  return graph.nodes
    .filter((n) => n.kind !== "client")
    .map((n) => ({ n, s: score(n) }))
    .sort((a, b) => a.s - b.s || a.n.id.localeCompare(b.n.id))
    .slice(0, limit)
    .map(({ n }) => n);
}

/** The edit still fails after one repair turn: ask instead of acting (G-02, G-05, G-06). */
export function clarifyFromErrors(errors: readonly OpError[], graph: Graph): CommandResult {
  const tooMany = errors.find((e) => e.code === "TOO_MANY_OPS");
  if (tooMany) {
    return {
      kind: "clarify",
      ops: [],
      message: "That's a lot at once. Can we do it in parts?",
      options: [],
      focusNodeIds: [],
    };
  }
  const unknown = errors.find((e) => e.code === "UNKNOWN_NODE" && e.nodeId);
  if (unknown?.nodeId) {
    const near = closestNodes(unknown.nodeId, graph);
    return {
      kind: "clarify",
      ops: [],
      message: near.length
        ? `I couldn't find "${unknown.nodeId}" on the board. Which one did you mean?`
        : `I couldn't find "${unknown.nodeId}" on the board. Can you add it first or name an existing component?`,
      options: near.map((n) => clip(n.label, MAX_OPTION_CHARS)),
      focusNodeIds: near.map((n) => n.id),
    };
  }
  const first = errors[0];
  const reason = first ? first.message.replace(/^op \d* ?\([^)]*\): /, "") : "the change isn't valid";
  return {
    kind: "clarify",
    ops: [],
    message: clip(`I couldn't make that change: ${reason}. Can you rephrase it?`, MAX_MESSAGE),
    options: [],
    focusNodeIds: first?.nodeId && graph.nodes.some((n) => n.id === first.nodeId) ? [first.nodeId] : [],
  };
}

/** The repair turn (docs/15 · Repair message). */
export function repairMessage(errors: readonly OpError[], graph: Graph): string {
  const ids = graph.nodes.map((n) => `"${n.id}"`).join(", ") || "none (the board is empty)";
  return [
    "Your ops failed validation. Fix them and return a complete CommandResult.",
    ...errors.map((e) => `- ${e.message}`),
    `Existing node ids: ${ids}.`,
    "Return the corrected full list of ops, not a diff. If you can't tell what the user meant, return kind \"clarify\" instead.",
  ].join("\n");
}
