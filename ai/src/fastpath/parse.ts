import { validateBatch, type ArchNode, type Graph, type Op } from "@archie/simulator";
import { normalize } from "./normalize";
import { resolveRef, type ResolveContext } from "./resolve";

/**
 * Tier-1 command parser (docs/13 §2–4, ADR-006). Deterministic and local.
 * Contract: return a result only when the whole utterance matched a pattern, every reference
 * resolved to exactly one node, and the ops validate. Otherwise return null: never guess.
 */

export type FastPathAction = "undo" | "redo" | "fit" | "zoomIn" | "zoomOut";

export type FastPathResult =
  | { kind: "ops"; ops: Op[]; summary: string; normalized: string }
  | { kind: "action"; action: FastPathAction; summary: string; normalized: string };

type Builder = (m: Record<string, string>, graph: Graph, ctx: ResolveContext) => Built | null;
type Built = { ops: Op[]; summary: string } | { action: FastPathAction; summary: string };

interface Rule {
  name: string;
  pattern: RegExp;
  build: Builder;
}

const NUM = String.raw`(?<n>\d+(?:\.\d+)?)`;
const REPLICA_WORD = String.raw`(?:replicas?|servers?|instances?|copies|nodes|boxes|machines)`;

function ref(span: string | undefined, graph: Graph, ctx: ResolveContext): ArchNode | null {
  if (!span) return null;
  const r = resolveRef(span, graph, ctx);
  return r.kind === "ok" ? r.node : null;
}

function int(value: string | undefined): number | null {
  if (value === undefined) return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

const fmt = (n: number) => n.toLocaleString("en-US");

function workload(m: Record<string, string>): Built | null {
  const rps = m.n !== undefined ? Number(m.n) : undefined;
  let readRatio: number | undefined;
  if (m.p !== undefined) {
    const pct = Number(m.p) / 100;
    readRatio = m.rw?.startsWith("write") ? 1 - pct : pct;
    readRatio = Math.round(readRatio * 1000) / 1000;
  }
  if (rps === undefined && readRatio === undefined) return null;
  const parts = [
    rps !== undefined ? `${fmt(rps)} rps` : null,
    readRatio !== undefined ? `${Math.round(readRatio * 100)}% reads` : null,
  ].filter(Boolean);
  return {
    ops: [{ type: "setWorkload", ...(rps !== undefined ? { rps } : {}), ...(readRatio !== undefined ? { readRatio } : {}) }],
    summary: `Workload: ${parts.join(" · ")}`,
  };
}

const MIX = String.raw`(?:,? ?(?:with |and |at )?(?<p>\d+(?:\.\d+)?)% (?<rw>reads?|writes?))?`;

export const RULES: readonly Rule[] = [
  { name: "undo", pattern: /^(?:undo(?: that| it| the last change)?|go back)$/, build: () => ({ action: "undo", summary: "Undo" }) },
  { name: "redo", pattern: /^redo(?: that| it)?$/, build: () => ({ action: "redo", summary: "Redo" }) },
  {
    name: "fit",
    pattern: /^(?:fit|fit (?:the )?view|fit to screen|zoom to fit|show (?:me )?everything|show all|center)$/,
    build: () => ({ action: "fit", summary: "Fit to view" }),
  },
  { name: "zoom", pattern: /^zoom (?<dir>in|out)$/, build: (m) => ({ action: m.dir === "in" ? "zoomIn" : "zoomOut", summary: `Zoom ${m.dir}` }) },
  {
    name: "fail",
    pattern: /^(?:kill|take down|take out|fail|crash|turn off|shut down|knock out|break) (?<a>.+)$/,
    build: (m, g, c) => {
      const node = ref(m.a, g, c);
      return node && { ops: [{ type: "fail", id: node.id }], summary: `Took down ${node.label}` };
    },
  },
  {
    name: "fail-suffix",
    pattern: /^(?:take|knock|shut) (?<a>.+?) (?:down|out|off)$/,
    build: (m, g, c) => {
      const node = ref(m.a, g, c);
      return node && { ops: [{ type: "fail", id: node.id }], summary: `Took down ${node.label}` };
    },
  },
  {
    name: "recover",
    pattern: /^(?:bring back|recover|restart|restore|revive|turn on|heal|fix) (?<a>.+)$/,
    build: (m, g, c) => {
      const node = ref(m.a, g, c);
      return node && { ops: [{ type: "recover", id: node.id }], summary: `Brought back ${node.label}` };
    },
  },
  {
    name: "recover-suffix",
    pattern: /^bring (?<a>.+?) (?:back|back up|online)$/,
    build: (m, g, c) => {
      const node = ref(m.a, g, c);
      return node && { ops: [{ type: "recover", id: node.id }], summary: `Brought back ${node.label}` };
    },
  },
  {
    name: "remove",
    pattern: /^(?:delete|remove|drop|get rid of|kill off) (?<a>.+)$/,
    build: (m, g, c) => {
      if (/^(?:the )?(?:connection|edge|link|arrow)s? /.test(m.a ?? "")) return null;
      const node = ref(m.a, g, c);
      return node && { ops: [{ type: "removeNode", id: node.id }], summary: `Removed ${node.label}` };
    },
  },
  {
    name: "disconnect",
    pattern:
      /^(?:disconnect (?<a>.+?) (?:from|and) (?<b>.+)|(?:remove|delete|cut|drop) the (?:connection|edge|link|arrow) (?:from|between) (?<a2>.+?) (?:to|and) (?<b2>.+))$/,
    build: (m, g, c) => {
      const a = ref(m.a ?? m.a2, g, c);
      const b = ref(m.b ?? m.b2, g, c);
      if (!a || !b) return null;
      // "disconnect X from Y" may be spoken in either direction; only the existing edge counts.
      const [from, to] = g.edges.some((e) => e.from === a.id && e.to === b.id) ? [a, b] : [b, a];
      return { ops: [{ type: "disconnect", from: from.id, to: to.id }], summary: `Disconnected ${from.label} → ${to.label}` };
    },
  },
  {
    name: "connect",
    pattern: /^(?:connect|link|wire|hook up) (?<a>.+?) (?:to|with|into) (?<b>.+)$/,
    build: (m, g, c) => connectOp(m.a, m.b, "all", g, c),
  },
  {
    name: "connect-verb",
    pattern: /^(?<a>.+?) (?<verb>calls|talks to|reads from|writes to|depends on|sends to|uses|hits) (?<b>.+)$/,
    build: (m, g, c) => {
      const traffic = m.verb === "reads from" ? "read" : m.verb === "writes to" ? "write" : "all";
      return connectOp(m.a, m.b, traffic, g, c);
    },
  },
  {
    name: "replicas",
    pattern: new RegExp(
      String.raw`^(?:(?:use|run|give me|set|make it) )?${NUM} ${REPLICA_WORD} (?:of|for|on) (?<a>.+)$` +
        String.raw`|^(?:scale|resize|set) (?<a2>.+?) (?:to|at) (?<n2>\d+)(?: ${REPLICA_WORD})?$` +
        String.raw`|^give (?<a3>.+?) (?<n3>\d+) ${REPLICA_WORD}$` +
        String.raw`|^(?<n4>\d+) (?<a4>.+?) ${REPLICA_WORD}$`,
    ),
    build: (m, g, c) => {
      const node = ref(m.a ?? m.a2 ?? m.a3 ?? m.a4, g, c);
      const replicas = int(m.n ?? m.n2 ?? m.n3 ?? m.n4);
      if (!node || replicas === null) return null;
      return {
        ops: [{ type: "replicate", id: node.id, replicas }],
        summary: `Scaled ${node.label} to ${replicas} replica${replicas === 1 ? "" : "s"}`,
      };
    },
  },
  {
    name: "shards",
    pattern: /^shard (?<a>.+?) (?:into|to|across|in) (?<n>\d+)(?: shards| ways| pieces| partitions)?$/,
    build: (m, g, c) => {
      const node = ref(m.a, g, c);
      const shards = int(m.n);
      if (!node || shards === null) return null;
      return { ops: [{ type: "updateNode", id: node.id, props: { shards } }], summary: `Sharded ${node.label} into ${shards}` };
    },
  },
  {
    name: "hit-rate",
    pattern: /^(?:set )?(?<a>.+?) (?:cache )?hit (?:rate|ratio) (?:to |is |at |of )?(?<p>\d+(?:\.\d+)?)%$/,
    build: (m, g, c) => {
      const node = ref(m.a, g, c);
      if (!node || m.p === undefined) return null;
      const hitRate = Number(m.p) / 100;
      return { ops: [{ type: "updateNode", id: node.id, props: { hitRate } }], summary: `${node.label} hit rate ${m.p}%` };
    },
  },
  {
    name: "workload",
    pattern: new RegExp(
      String.raw`^(?:send|set (?:the )?(?:traffic|load|workload|rps) to|run|push|simulate|throw|hit it with|try|give it)? ?${NUM} rps${MIX}$`,
    ),
    build: workload,
  },
  {
    name: "read-mix",
    pattern: /^(?:make it |set (?:it )?to |use )?(?<p>\d+(?:\.\d+)?)% (?<rw>reads?|writes?)$/,
    build: workload,
  },
  {
    name: "peak",
    pattern: /^(?:set )?(?:the )?peak(?: multiplier)? (?:is |of |at |to )?(?<m>\d+(?:\.\d+)?)x$|^(?<m2>\d+(?:\.\d+)?)x peak$/,
    build: (m) => {
      const peakMultiplier = Number(m.m ?? m.m2);
      return { ops: [{ type: "setWorkload", peakMultiplier }], summary: `Peak ${peakMultiplier}× average` };
    },
  },
];

function connectOp(
  aSpan: string | undefined,
  bSpan: string | undefined,
  traffic: "all" | "read" | "write",
  graph: Graph,
  ctx: ResolveContext,
): Built | null {
  const a = ref(aSpan, graph, ctx);
  const b = ref(bSpan, graph, ctx);
  if (!a || !b) return null;
  return {
    ops: [{ type: "connect", from: a.id, to: b.id, ...(traffic !== "all" ? { traffic } : {}) }],
    summary: `Connected ${a.label} → ${b.label}${traffic !== "all" ? ` (${traffic})` : ""}`,
  };
}

/**
 * Parse an utterance against the current graph. Returns null when unsure; the caller then
 * defers to the AI tier (Phase 4).
 */
export function parseCommand(utterance: string, graph: Graph, ctx: ResolveContext = {}): FastPathResult | null {
  const normalized = normalize(utterance);
  if (!normalized) return null;
  for (const rule of RULES) {
    const match = rule.pattern.exec(normalized);
    if (!match) continue;
    const groups = Object.fromEntries(
      Object.entries(match.groups ?? {}).filter((entry): entry is [string, string] => entry[1] !== undefined),
    );
    const built = rule.build(groups, graph, ctx);
    if (!built) continue; // another rule may still match the whole utterance
    if ("action" in built) return { kind: "action", ...built, normalized };
    if (validateBatch(graph, built.ops).length > 0) return null;
    return { kind: "ops", ...built, normalized };
  }
  return null;
}
