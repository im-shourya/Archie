"use client";

import { forwardRef, useId, useState } from "react";
import { Unplug } from "lucide-react";
import {
  CATALOG,
  PartialPropsSchema,
  effectiveProps,
  type ArchNode,
  type Graph,
  type NodeProps,
  type Op,
  type SimResult,
} from "@archie/simulator";
import { KindIcon } from "@/components/icons/KindIcon";
import { compact, ms } from "@/lib/format";
import { useBoardStore } from "../store/board.store";
import styles from "./inspector.module.css";

/**
 * Inspector (FR-016, docs/33 Step 2). Shows the selected component's props, live metrics and
 * connections. Every edit is one op batch through the store's `apply`, so the op engine is the
 * only rulebook: bounds come from its schema, errors are its messages, and undo works for free.
 */

type NumericProp = Exclude<keyof NodeProps, "role" | "failover">;

interface FieldSpec {
  label: string;
  /** Display value = stored value × scale (hit rate is stored 0–1, edited as %). */
  scale?: number;
  unit?: string;
}

const FIELDS: Record<NumericProp, FieldSpec> = {
  replicas: { label: "Replicas" },
  shards: { label: "Shards" },
  hitRate: { label: "Hit rate (%)", scale: 100 },
  capacityRps: { label: "Capacity per replica", unit: "rps" },
  readCapacity: { label: "Read capacity per shard", unit: "rps" },
  writeCapacity: { label: "Write capacity per shard", unit: "rps" },
  latencyMs: { label: "Latency", unit: "ms" },
  costPerReplica: { label: "Cost per replica", unit: "$/mo" },
};

/** Props that reset to the catalog default when cleared (the op language's `null`). */
const NULLABLE = new Set<NumericProp>([
  "hitRate",
  "capacityRps",
  "readCapacity",
  "writeCapacity",
  "latencyMs",
  "costPerReplica",
]);

const TRAFFIC_LABEL = { all: "all traffic", read: "reads", write: "writes" } as const;

/** Bounds straight from the op schema, so the hint and the validator never disagree. */
function bounds(prop: NumericProp): { min?: number; max?: number; int: boolean } {
  let schema: unknown = PartialPropsSchema.shape[prop];
  while (schema && typeof (schema as { unwrap?: unknown }).unwrap === "function") {
    schema = (schema as { unwrap(): unknown }).unwrap();
  }
  const n = schema as { minValue?: number | null; maxValue?: number | null; isInt?: boolean };
  return { min: n.minValue ?? undefined, max: n.maxValue ?? undefined, int: !!n.isInt };
}

function rangeText(prop: NumericProp): string | null {
  const { min, max } = bounds(prop);
  const scale = FIELDS[prop].scale ?? 1;
  if (min === undefined || max === undefined) return null;
  return `${(min * scale).toLocaleString("en-US")}–${(max * scale).toLocaleString("en-US")}`;
}

/** "op (updateNode): props.replicas Too big: expected …" → "Too big: expected …". */
function opMessage(message: string): string {
  return message.replace(/^op \([^)]*\):\s*(?:props\.)?[\w.]*\s*/, "") || message;
}

function stored(node: ArchNode, prop: NumericProp): number {
  const value = effectiveProps(node)[prop];
  return typeof value === "number" ? value : 0;
}

function display(value: number, scale = 1): string {
  return String(Math.round(value * scale * 1000) / 1000);
}

interface Props {
  graph: Graph;
  sim: SimResult;
  node: ArchNode;
  /** Escape outside a pending edit: hand focus back to the canvas. */
  onEscape(): void;
}

export const Inspector = forwardRef<HTMLHeadingElement, Props>(function Inspector(
  { graph, sim, node, onEscape },
  headingRef,
) {
  const apply = useBoardStore((s) => s.apply);
  const notify = useBoardStore((s) => s.notify);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const metrics = sim.nodes[node.id];
  const entry = CATALOG[node.kind];
  const label = (id: string) => graph.nodes.find((n) => n.id === id)?.label ?? id;

  /** Apply one batch; report success as a toast with Undo, failure inline under `field`. */
  function edit(field: string, ops: Op[], summary: string): boolean {
    const result = apply(ops, { utterance: null, source: "inspector" });
    if (!result.ok) {
      const first = result.errors[0];
      setErrors((e) => ({
        ...e,
        [field]: first ? opMessage(first.message) : "That change isn’t valid.",
      }));
      return false;
    }
    setErrors(({ [field]: _cleared, ...rest }) => rest);
    notify(summary, true);
    return true;
  }

  const incoming = graph.edges.filter((e) => e.to === node.id);
  const outgoing = graph.edges.filter((e) => e.from === node.id);
  const rpsOut = outgoing.reduce((sum, e) => sum + (sim.edges[e.id]?.rps ?? 0), 0);
  const numeric = entry.allowedProps.filter((p): p is NumericProp => p in FIELDS);
  const down = node.status === "down";

  return (
    <section
      className={styles.inspector}
      role="region"
      aria-label="Inspector"
      data-testid="inspector"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onEscape();
        }
      }}
    >
      <header className={styles.head}>
        <span className={styles.glyph}>
          <KindIcon kind={node.kind} />
        </span>
        <div className={styles.headText}>
          <h3 id="inspector-title" ref={headingRef} tabIndex={-1} className={styles.title}>
            {node.label}
          </h3>
          <p className={styles.kind}>
            {entry.displayName} · <span data-down={down || undefined}>{down ? "down" : "up"}</span>
          </p>
        </div>
        <button
          type="button"
          className={down ? styles.button : styles.dangerButton}
          onClick={() =>
            edit(
              "status",
              [{ type: down ? "recover" : "fail", id: node.id }],
              down ? `Recovered ${node.label}` : `Took down ${node.label}`,
            )
          }
        >
          {down ? "Recover" : "Fail"}
        </button>
      </header>

      <div className={styles.fields}>
        <TextField
          key={`label-${node.id}-${node.label}`}
          label="Label"
          value={node.label}
          error={errors.label}
          maxLength={60}
          onCommit={(value) => {
            const next = value.trim();
            if (!next || next === node.label) return true;
            return edit(
              "label",
              [{ type: "updateNode", id: node.id, label: next }],
              `Renamed ${node.label} → ${next}`,
            );
          }}
        />

        {numeric.map((prop) => {
          const spec = FIELDS[prop];
          const value = stored(node, prop);
          const { min, max, int } = bounds(prop);
          const scale = spec.scale ?? 1;
          return (
            <NumberField
              key={`${prop}-${node.id}-${value}`}
              label={spec.label}
              unit={spec.unit}
              value={display(value, scale)}
              min={min !== undefined ? min * scale : undefined}
              max={max !== undefined ? max * scale : undefined}
              step={int ? 1 : "any"}
              range={rangeText(prop)}
              error={errors[prop]}
              onCommit={(raw) => {
                const trimmed = raw.trim();
                if (trimmed === display(value, scale)) return true;
                let next: number | null;
                if (trimmed === "") {
                  if (!NULLABLE.has(prop)) return false;
                  next = null;
                } else {
                  next = Number(trimmed) / scale;
                  if (!Number.isFinite(next)) {
                    setErrors((e) => ({ ...e, [prop]: "Enter a number." }));
                    return false;
                  }
                }
                const shown = next === null ? "default" : display(next, scale);
                return edit(
                  prop,
                  [{ type: "updateNode", id: node.id, props: { [prop]: next } }],
                  `${node.label} ${spec.label.replace(/ \(%\)$/, "").toLowerCase()} → ${shown}${spec.scale && next !== null ? "%" : ""}`,
                );
              }}
            />
          );
        })}

        {entry.allowedProps.includes("role") && (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Role</span>
            <select
              className={styles.input}
              value={node.props.role ?? "primary"}
              onChange={(e) => {
                const role = e.currentTarget.value as "primary" | "replica";
                edit(
                  "role",
                  [{ type: "updateNode", id: node.id, props: { role } }],
                  `${node.label} role → ${role}`,
                );
              }}
            >
              <option value="primary">primary</option>
              <option value="replica">replica</option>
            </select>
          </label>
        )}

        {entry.allowedProps.includes("failover") && (
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={node.props.failover ?? false}
              onChange={(e) => {
                const failover = e.currentTarget.checked;
                edit(
                  "failover",
                  [{ type: "updateNode", id: node.id, props: { failover } }],
                  `${node.label} failover ${failover ? "on" : "off"}`,
                );
              }}
            />
            Automatic failover
          </label>
        )}
        {errors.status && (
          <p className={styles.error} role="alert">
            {errors.status}
          </p>
        )}
      </div>

      {metrics && (
        <div className={styles.group}>
          <h4 className={styles.heading}>Live</h4>
          <dl className={styles.stats}>
            <div>
              <dt>ρ</dt>
              <dd data-state={metrics.status}>
                {node.kind === "client" ? "–" : metrics.rho.toFixed(2)}
              </dd>
            </div>
            <div>
              <dt>In</dt>
              <dd>{compact(metrics.lambdaRead + metrics.lambdaWrite)} rps</dd>
            </div>
            <div>
              <dt>Out</dt>
              <dd>{compact(rpsOut)} rps</dd>
            </div>
            <div>
              <dt>Mean</dt>
              <dd>{metrics.status === "saturated" ? "saturated" : ms(metrics.meanMs)}</dd>
            </div>
          </dl>
          <p className={styles.explain}>{metrics.explanation}</p>
        </div>
      )}

      <div className={styles.group}>
        <h4 className={styles.heading} id="inspector-connections">
          Connections
        </h4>
        <ul className={styles.edges} aria-labelledby="inspector-connections">
          {[
            ...incoming.map((e) => ({ e, dir: "from" as const, other: e.from })),
            ...outgoing.map((e) => ({ e, dir: "to" as const, other: e.to })),
          ].map(({ e, dir, other }) => (
            <li key={e.id} className={styles.edge}>
              <span>
                <span className={styles.dir}>{dir}</span> {label(other)}
                <span className={styles.edgeMeta}>
                  {" "}
                  · {e.kind === "call" ? "" : `${e.kind} · `}
                  {TRAFFIC_LABEL[e.traffic]} · {compact(sim.edges[e.id]?.rps ?? 0)} rps
                </span>
              </span>
              <button
                type="button"
                className={styles.iconButton}
                aria-label={`Disconnect ${label(e.from)} → ${label(e.to)}`}
                title="Disconnect"
                onClick={() =>
                  edit(
                    "edges",
                    [{ type: "disconnect", from: e.from, to: e.to }],
                    `Disconnected ${label(e.from)} → ${label(e.to)}`,
                  )
                }
              >
                <Unplug size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        {incoming.length + outgoing.length === 0 && (
          <p className={styles.hint}>Not connected. Say “connect the API to {node.label}”.</p>
        )}
        {errors.edges && (
          <p className={styles.error} role="alert">
            {errors.edges}
          </p>
        )}
      </div>
    </section>
  );
});

/** Commit on Enter or blur; Escape reverts. `onCommit` returns false to keep the draft (invalid). */
function useDraft(value: string, onCommit: (value: string) => boolean) {
  const [draft, setDraft] = useState(value);
  return {
    value: draft,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.currentTarget.value),
    onBlur: () => void onCommit(draft),
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onCommit(e.currentTarget.value);
      } else if (e.key === "Escape" && draft !== value) {
        // Revert only; a second Escape leaves the Inspector.
        e.stopPropagation();
        setDraft(value);
      }
    },
  };
}

function TextField(props: {
  label: string;
  value: string;
  error?: string;
  maxLength: number;
  onCommit(v: string): boolean;
}) {
  const draft = useDraft(props.value, props.onCommit);
  const errorId = useId();
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{props.label}</span>
      <input
        className={styles.input}
        type="text"
        maxLength={props.maxLength}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={props.error ? errorId : undefined}
        {...draft}
      />
      {props.error && (
        <span id={errorId} className={styles.error} role="alert">
          {props.error}
        </span>
      )}
    </label>
  );
}

function NumberField(props: {
  label: string;
  unit?: string;
  value: string;
  min?: number;
  max?: number;
  step: number | "any";
  range: string | null;
  error?: string;
  onCommit(v: string): boolean;
}) {
  const draft = useDraft(props.value, props.onCommit);
  const errorId = useId();
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>
        {props.label}
        {props.unit && <span className={styles.unit}> · {props.unit}</span>}
      </span>
      <input
        className={styles.input}
        type="number"
        inputMode="decimal"
        min={props.min}
        max={props.max}
        step={props.step}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={props.error ? errorId : undefined}
        {...draft}
      />
      {props.error && (
        <span id={errorId} className={styles.error} role="alert">
          {props.error}
          {props.range ? ` Allowed: ${props.range}.` : ""}
        </span>
      )}
    </label>
  );
}
