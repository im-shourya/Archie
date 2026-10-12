import { z } from "zod";
import { GraphSchema, MAX_OPS_PER_BATCH, NodeIdSchema, OpSchema, type Op } from "@archie/simulator";

/**
 * Contracts for the command route (docs/12 · Data contracts). Must stay in sync with
 * specs/command-schema.json → CommandRequest, CommandResult, CommandResponse.
 */

export const MAX_UTTERANCE = 4000;
export const MAX_MESSAGE = 600;
export const MAX_OPTIONS = 4;
export const MAX_OPTION_CHARS = 40;
export const MAX_FOCUS = 20;
/** Chat turns sent back as context (docs/12 · Conversation memory). */
export const MAX_CONVERSATION = 10;
export const MAX_TURN_CHARS = 600;

export const CommandKindSchema = z.enum(["ops", "clarify", "confirm", "answer", "noop"]);
export type CommandKind = z.infer<typeof CommandKindSchema>;

export const CommandRequestSchema = z.strictObject({
  utterance: z.string().trim().min(1).max(MAX_UTTERANCE),
  graph: GraphSchema,
  baseVersion: z.number().int().min(0),
  selection: z.array(NodeIdSchema).max(50).optional(),
  history: z.array(z.string().max(MAX_UTTERANCE)).max(5).optional(),
  conversation: z
    .array(z.strictObject({ role: z.enum(["user", "assistant"]), text: z.string().max(MAX_TURN_CHARS) }))
    .max(MAX_CONVERSATION)
    .optional(),
  mode: z.enum(["design", "interview"]).optional(),
});
export type CommandRequest = z.infer<typeof CommandRequestSchema>;

/** What the harness returns to the route (before the server adds meta fields). */
export const CommandResultSchema = z.strictObject({
  kind: CommandKindSchema,
  ops: z.array(OpSchema).max(MAX_OPS_PER_BATCH),
  message: z.string().max(MAX_MESSAGE),
  options: z.array(z.string().max(MAX_OPTION_CHARS)).max(MAX_OPTIONS),
  focusNodeIds: z.array(NodeIdSchema).max(MAX_FOCUS),
});
export type CommandResult = z.infer<typeof CommandResultSchema>;

export interface CommandTimings {
  contextMs: number;
  llmMs: number;
  validateMs: number;
  totalMs: number;
}

export interface CommandUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface CommandResponse extends CommandResult {
  baseVersion: number;
  attempts: 1 | 2;
  model: string;
  timings: CommandTimings;
  usage: CommandUsage;
}

/**
 * Wire format for the model's structured output (docs/32 · Schema shape).
 *
 * The SDK moves `enum`/`const` into descriptions and validates client-side, so a strict op union
 * can't be enforced by the API and one bad op would fail the whole parse. That would skip the
 * repair loop. Instead the model fills a flat, lenient `WireOp` (every field present, unused ones
 * null), and `toOps` + `validateBatch` do the real validation, with repair-friendly errors.
 */
const str = z.string().nullable();
const num = z.number().nullable();

export const WirePropsSchema = z.strictObject({
  replicas: num,
  shards: num,
  capacityRps: num,
  readCapacity: num,
  writeCapacity: num,
  latencyMs: num,
  hitRate: num,
  role: str,
  failover: z.boolean().nullable(),
  costPerReplica: num,
});

export const WireNodeSchema = z.strictObject({
  id: str,
  kind: str,
  label: str,
  props: WirePropsSchema.nullable(),
});

export const WireOpSchema = z.strictObject({
  type: z.string(),
  id: str,
  /** Node kind for addNode; edge kind (call | async | replication) for connect. */
  kind: str,
  label: str,
  props: WirePropsSchema.nullable(),
  from: str,
  to: str,
  traffic: str,
  weight: num,
  replicas: num,
  node: WireNodeSchema.nullable(),
  rps: num,
  readRatio: num,
  peakMultiplier: num,
});

export const WireResultSchema = z.strictObject({
  kind: CommandKindSchema,
  ops: z.array(WireOpSchema),
  message: z.string(),
  options: z.array(z.string()),
  focusNodeIds: z.array(z.string()),
});

export type WireProps = z.infer<typeof WirePropsSchema>;
export type WireOp = z.infer<typeof WireOpSchema>;
export type WireResult = z.infer<typeof WireResultSchema>;

/** Fields each op type accepts (docs/08). Anything else on the wire op is dropped. */
const OP_FIELDS: Record<Op["type"], readonly (keyof WireOp)[]> = {
  addNode: ["id", "kind", "label", "props"],
  removeNode: ["id"],
  updateNode: ["id", "label", "props"],
  connect: ["from", "to", "kind", "traffic", "weight"],
  disconnect: ["from", "to"],
  replicate: ["id", "replicas"],
  insertBetween: ["from", "to", "node"],
  setWorkload: ["rps", "readRatio", "peakMultiplier"],
  fail: ["id"],
  recover: ["id"],
};

function compact<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined)) as Partial<T>;
}

function toNode(node: z.infer<typeof WireNodeSchema>): Record<string, unknown> {
  const out: Record<string, unknown> = compact({ id: node.id, kind: node.kind, label: node.label });
  const props = node.props ? compact(node.props) : {};
  if (Object.keys(props).length > 0) out.props = props;
  return out;
}

/**
 * Wire op → op-language object. The result is *unvalidated*: callers pass it to
 * `validateBatch`, which reports schema problems as repairable errors. Unknown op types are
 * kept as-is so validation names them.
 */
export function toOp(wire: WireOp): unknown {
  const fields = OP_FIELDS[wire.type as Op["type"]];
  if (!fields) return compact(wire);
  const op: Record<string, unknown> = { type: wire.type };
  for (const key of fields) {
    const value = wire[key];
    if (value === null) continue;
    if (key === "props") {
      const props = compact(value as WireProps);
      if (Object.keys(props).length > 0) op.props = props;
    } else if (key === "node") {
      op.node = toNode(value as z.infer<typeof WireNodeSchema>);
    } else {
      op[key] = value;
    }
  }
  return op;
}

export function toOps(wire: readonly WireOp[]): unknown[] {
  return wire.map(toOp);
}
