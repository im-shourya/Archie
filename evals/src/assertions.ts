import { simulate, type ArchEdge, type ArchNode, type Graph, type SimResult } from "@archie/simulator";

/**
 * Structural graph assertions (docs/22 · Assertions). They check intent, not one exact op list,
 * so different-but-correct edits pass.
 *
 * Beyond the doc's list: `reachable` (a path exists, for inline inserts that may add hops),
 * `optionsMention` (clarify options name the candidates), `loadDrops` (the simulator shows a
 * node's load fall, e.g. a cache taking DB reads), and `role` on `nodeCount`.
 */

type Props = Record<string, unknown>;

export interface NodeMatch {
  id?: string;
  kind?: string;
  role?: "primary" | "replica";
  labelIncludes?: string;
  props?: Props;
}

export interface EdgeMatch {
  from?: string;
  to?: string;
  fromKind?: string;
  toKind?: string;
  kind?: ArchEdge["kind"];
  traffic?: ArchEdge["traffic"];
}

export type Assertion =
  | { nodeExists: NodeMatch }
  | { node: string; props: Props }
  | { edgeExists: EdgeMatch }
  | { edgeAbsent: EdgeMatch }
  | { reachable: EdgeMatch }
  | { nodeCount: NodeMatch & { kind: string; eq?: number; gte?: number } }
  | { workload: Partial<Graph["workload"]> }
  | { status: { node: string; eq: "up" | "down" } }
  | { unchanged: true }
  | { answerMentions: string[] }
  | { focusIncludes: string[] }
  | { optionsMention: string[] }
  | { loadDrops: { node: string; class: "read" | "write" } };

export interface Outcome {
  before: Graph;
  /** The board after the result was applied (equal to `before` unless kind is "ops"). */
  after: Graph;
  kind: string;
  message: string;
  options: string[];
  focusNodeIds: string[];
}

const near = (a: unknown, b: unknown) =>
  typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < 1e-6 : a === b;

function propsMatch(actual: Props, expected: Props): boolean {
  return Object.entries(expected).every(([k, v]) => near(actual[k], v));
}

function nodeMatches(n: ArchNode, m: NodeMatch): boolean {
  if (m.id !== undefined && n.id !== m.id) return false;
  if (m.kind !== undefined && n.kind !== m.kind) return false;
  if (m.role !== undefined && (n.props.role ?? (n.kind === "sql" ? "primary" : undefined)) !== m.role) return false;
  if (m.labelIncludes !== undefined && !n.label.toLowerCase().includes(m.labelIncludes.toLowerCase())) return false;
  if (m.props && !propsMatch(n.props, m.props)) return false;
  return true;
}

function edgeMatches(e: ArchEdge, m: EdgeMatch, g: Graph): boolean {
  const kindOf = (id: string) => g.nodes.find((n) => n.id === id)?.kind;
  if (m.from !== undefined && e.from !== m.from) return false;
  if (m.to !== undefined && e.to !== m.to) return false;
  if (m.fromKind !== undefined && kindOf(e.from) !== m.fromKind) return false;
  if (m.toKind !== undefined && kindOf(e.to) !== m.toKind) return false;
  if (m.kind !== undefined && e.kind !== m.kind) return false;
  if (m.traffic !== undefined && e.traffic !== m.traffic) return false;
  return true;
}

function endpointMatches(n: ArchNode, id: string | undefined, kind: string | undefined): boolean {
  return (id === undefined || n.id === id) && (kind === undefined || n.kind === kind);
}

/** Any path (any edge kind) from a node matching from/fromKind to one matching to/toKind. */
function reachable(g: Graph, m: EdgeMatch): boolean {
  const starts = g.nodes.filter((n) => endpointMatches(n, m.from, m.fromKind)).map((n) => n.id);
  const targets = new Set(g.nodes.filter((n) => endpointMatches(n, m.to, m.toKind)).map((n) => n.id));
  const seen = new Set<string>();
  const stack = starts.flatMap((s) => g.edges.filter((e) => e.from === s).map((e) => e.to));
  while (stack.length) {
    const id = stack.pop()!;
    if (targets.has(id)) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of g.edges) if (e.from === id) stack.push(e.to);
  }
  return false;
}

/** Graph content without the version counter. */
function shape(g: Graph): string {
  return JSON.stringify({ nodes: g.nodes, edges: g.edges, workload: g.workload });
}

const simCache = new WeakMap<Graph, SimResult>();
function sim(g: Graph): SimResult {
  let s = simCache.get(g);
  if (!s) simCache.set(g, (s = simulate(g)));
  return s;
}

const show = (a: Assertion) => JSON.stringify(a);

/** null when the assertion holds, else a short reason. */
export function check(a: Assertion, o: Outcome): string | null {
  const { after } = o;
  const fail = (why: string) => `${show(a)}: ${why}`;

  if ("nodeExists" in a) {
    return after.nodes.some((n) => nodeMatches(n, a.nodeExists)) ? null : fail("no matching node");
  }
  if ("node" in a) {
    const n = after.nodes.find((x) => x.id === a.node);
    if (!n) return fail(`node "${a.node}" missing`);
    return propsMatch(n.props, a.props) ? null : fail(`props are ${JSON.stringify(n.props)}`);
  }
  if ("edgeExists" in a) {
    return after.edges.some((e) => edgeMatches(e, a.edgeExists, after)) ? null : fail("no matching edge");
  }
  if ("edgeAbsent" in a) {
    return after.edges.some((e) => edgeMatches(e, a.edgeAbsent, after)) ? fail("edge still present") : null;
  }
  if ("reachable" in a) {
    return reachable(after, a.reachable) ? null : fail("no path");
  }
  if ("nodeCount" in a) {
    const { eq, gte, ...match } = a.nodeCount;
    const count = after.nodes.filter((n) => nodeMatches(n, match)).length;
    if (eq !== undefined && count !== eq) return fail(`count is ${count}`);
    if (gte !== undefined && count < gte) return fail(`count is ${count}`);
    return null;
  }
  if ("workload" in a) {
    return propsMatch(after.workload, a.workload) ? null : fail(`workload is ${JSON.stringify(after.workload)}`);
  }
  if ("status" in a) {
    const n = after.nodes.find((x) => x.id === a.status.node);
    if (!n) return fail(`node "${a.status.node}" missing`);
    return n.status === a.status.eq ? null : fail(`status is ${n.status}`);
  }
  if ("unchanged" in a) {
    return shape(o.before) === shape(after) ? null : fail("the board changed");
  }
  if ("answerMentions" in a) {
    const text = o.message.toLowerCase();
    const missing = a.answerMentions.filter((s) => !text.includes(s.toLowerCase()));
    return missing.length ? fail(`message lacks ${missing.join(", ")}`) : null;
  }
  if ("focusIncludes" in a) {
    const missing = a.focusIncludes.filter((id) => !o.focusNodeIds.includes(id));
    return missing.length ? fail(`focus lacks ${missing.join(", ")}`) : null;
  }
  if ("optionsMention" in a) {
    const opts = o.options.map((x) => x.toLowerCase());
    const missing = a.optionsMention.filter((s) => !opts.some((x) => x.includes(s.toLowerCase())));
    return missing.length ? fail(`options ${JSON.stringify(o.options)} lack ${missing.join(", ")}`) : null;
  }
  if ("loadDrops" in a) {
    const key = a.loadDrops.class === "read" ? "lambdaRead" : "lambdaWrite";
    const b = sim(o.before).nodes[a.loadDrops.node]?.[key];
    const c = sim(after).nodes[a.loadDrops.node]?.[key];
    if (b === undefined || c === undefined) return fail("node missing in sim");
    return c < b ? null : fail(`${key} ${b} → ${c}`);
  }
  return `unknown assertion ${show(a)}`;
}

export function checkAll(assertions: readonly Assertion[], o: Outcome): string[] {
  return assertions.map((a) => check(a, o)).filter((r): r is string => r !== null);
}

/** Every number in an answer appears in the context it was given (docs/22 · Answer groundedness). */
export function grounded(message: string, context: string): boolean {
  const norm = (s: string) => s.replace(/(\d),(?=\d{3})/g, "$1");
  const ctx = norm(context);
  const numbers = norm(message).match(/\d+(?:\.\d+)?/g) ?? [];
  return numbers.every((n) => ctx.includes(n) || ctx.includes(String(Number(n))));
}
