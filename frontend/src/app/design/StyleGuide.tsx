"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  BookOpen,
  CircleCheck,
  CircleX,
  Ellipsis,
  Flag,
  GraduationCap,
  Info,
  Mic,
  OctagonAlert,
  ScanSearch,
  ShieldAlert,
  SkipForward,
  Sparkles,
  TriangleAlert,
  Volume2,
  Wrench,
} from "lucide-react";
import { NODE_KINDS, type ArchNode, type NodeMetrics } from "@archie/simulator";
import { LogoMark, Wordmark } from "@/components/brand/LogoMark";
import { KindIcon } from "@/components/icons/KindIcon";
import { ArchNodeCard, type ArchFlowNode } from "@/features/board/ArchNodeCard";
import { SloChecklist } from "@/features/interview/InterviewPanel";
import { RubricBar } from "@/features/interview/Scorecard";
import { FindingCard } from "@/features/review/ReviewPanel";
import interview from "@/features/interview/interview.module.css";
import review from "@/features/review/review.module.css";
import {
  failedSim,
  sampleChecks,
  sampleFindings,
  sampleGraph,
  sampleRubric,
  sampleSim,
  SHORTCUTS,
  TOKENS,
  TYPE_SCALE,
  unsupportedRubric,
} from "./samples";
import styles from "./design.module.css";

/**
 * Living style guide (docs/design §8). Real components and the live tokens, in whichever theme
 * the system uses; the axe gate audits it in light and dark. Static samples only.
 */

function luminance(raw: string): number | null {
  // Minified CSS may report #fff for #ffffff.
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(raw.trim());
  const hex = short
    ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`
    : raw.trim();
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const channel = (i: number) => {
    const c = parseInt(m[1]!.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

function contrast(a: string, b: string): number | null {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Current token values, read from the live CSS (so the page shows what the theme really uses). */
function useTokenValues(): Record<string, string> {
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    const read = () => {
      const style = getComputedStyle(document.documentElement);
      setValues(
        Object.fromEntries(TOKENS.map((t) => [t.name, style.getPropertyValue(t.name).trim()])),
      );
    };
    read();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, []);
  return values;
}

function Ratio({ value }: { value: number | null }) {
  if (value === null) return <span className={styles.ratio}>–</span>;
  const ok = value >= 4.5;
  return (
    <span className={styles.ratio} data-ok={ok || undefined}>
      {value.toFixed(2)}:1 {ok ? "✓" : value >= 3 ? "⚠" : "✗"}
    </span>
  );
}

const node = (
  id: string,
  label: string,
  kind: ArchNode["kind"],
  props: Partial<ArchNode["props"]> = {},
  status: ArchNode["status"] = "up",
): ArchNode => ({
  id,
  kind,
  label,
  props: { replicas: 1, ...props },
  status,
});

function card(
  id: string,
  n: ArchNode,
  metrics: NodeMetrics | null,
  x: number,
  y: number,
  extra: Partial<ArchFlowNode["data"]> = {},
  selected = false,
): ArchFlowNode {
  return {
    id,
    type: "arch",
    position: { x, y },
    selected,
    data: {
      node: n,
      pulseKey: null,
      metrics,
      bottleneck: false,
      vertical: false,
      callout: false,
      spof: false,
      ...extra,
    },
  };
}

const STATE_NODES: ArchFlowNode[] = [
  card("lb", node("lb", "Healthy", "lb", { replicas: 2 }), sampleSim.nodes.lb ?? null, 0, 0),
  card(
    "api",
    node("api", "Warm", "service", { replicas: 30 }),
    sampleSim.nodes.api ?? null,
    220,
    0,
  ),
  card(
    "pg",
    node("pg", "Saturated", "sql", { role: "primary" }),
    sampleSim.nodes.pg ?? null,
    440,
    0,
  ),
  card("down", node("down", "Down", "cache", {}, "down"), failedSim.nodes.redis ?? null, 660, 0),
  card(
    "idle",
    node("idle", "Idle", "search"),
    { ...sampleSim.nodes.lb!, status: "idle", rho: 0, lambdaRead: 0, lambdaWrite: 0 },
    0,
    110,
  ),
  card("spof", node("spof", "SPOF", "cache"), sampleSim.nodes.redis ?? null, 220, 110, {
    spof: true,
  }),
  card(
    "sel",
    node("sel", "Selected", "service", { replicas: 4 }),
    sampleSim.nodes.api ?? null,
    440,
    110,
    {},
    true,
  ),
  card("client", node("client", "Client", "client"), sampleSim.nodes.client ?? null, 660, 110),
];

const nodeTypes = { arch: ArchNodeCard };
const UI_ICONS = {
  GraduationCap,
  Flag,
  ScanSearch,
  ShieldAlert,
  CircleCheck,
  CircleX,
  Volume2,
  SkipForward,
  BookOpen,
  Wrench,
  OctagonAlert,
  TriangleAlert,
  Info,
  Ellipsis,
  Sparkles,
  Mic,
};
const SECTIONS = [
  "Brand",
  "Colour",
  "Type",
  "Shape",
  "Icons",
  "Node card",
  "Controls",
  "Panels",
  "Keyboard",
];

export function StyleGuide() {
  const values = useTokenValues();
  const bg = values["--color-background"] ?? "";
  const surface = values["--color-surface"] ?? "";
  const labelOf = (id: string) => sampleGraph.nodes.find((n) => n.id === id)?.label ?? id;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" aria-label="Archie home" className={styles.home}>
          <Wordmark size={24} />
        </Link>
        <span className={styles.muted}>Design system · rendered live</span>
      </header>
      <div className={styles.layout}>
        <nav className={styles.nav} aria-label="Sections">
          {SECTIONS.map((s) => (
            <a key={s} href={`#${s.toLowerCase().replace(/\s/g, "-")}`}>
              {s}
            </a>
          ))}
        </nav>
        <main className={styles.main}>
          <h1 className={styles.title}>Design system</h1>
          <p className={styles.muted}>
            The real tokens and components, in your system theme. Spec: docs/06 and
            docs/design/frontend-design.md.
          </p>

          <section id="brand" className={styles.section} aria-labelledby="h-brand">
            <h2 id="h-brand">Brand</h2>
            <div className={styles.row}>
              <LogoMark size={20} />
              <LogoMark size={32} />
              <LogoMark size={72} />
              <Wordmark size={32} />
            </div>
          </section>

          <section id="colour" className={styles.section} aria-labelledby="h-colour">
            <h2 id="h-colour">Colour</h2>
            <p className={styles.muted}>
              Contrast is computed here with the WCAG formula against the background and the
              surface.
            </p>
            <div className={styles.scroll} tabIndex={0} role="region" aria-label="Colour tokens">
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Token</th>
                    <th scope="col">Value</th>
                    <th scope="col">Role</th>
                    <th scope="col">vs background</th>
                    <th scope="col">vs surface</th>
                  </tr>
                </thead>
                <tbody>
                  {TOKENS.map((t) => (
                    <tr key={t.name} data-token={t.name}>
                      <td>
                        <span
                          className={styles.swatch}
                          style={{ background: `var(${t.name})` }}
                          aria-hidden
                        />
                        <code>{t.name}</code>
                      </td>
                      <td>
                        <code>{values[t.name] || "…"}</code>
                      </td>
                      <td>{t.role}</td>
                      <td>{t.text ? <Ratio value={contrast(values[t.name] ?? "", bg)} /> : "–"}</td>
                      <td>
                        {t.text ? <Ratio value={contrast(values[t.name] ?? "", surface)} /> : "–"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section id="type" className={styles.section} aria-labelledby="h-type">
            <h2 id="h-type">Type</h2>
            {TYPE_SCALE.map((t) => (
              <div key={t.size} className={styles.typeRow}>
                <span style={{ fontSize: t.size }}>IBM Plex Sans {t.size}</span>
                <span className={styles.mono} style={{ fontSize: Math.min(t.size, 20) }}>
                  ρ 0.83 · 612 ms
                </span>
                <span className={styles.muted}>{t.use}</span>
              </div>
            ))}
          </section>

          <section id="shape" className={styles.section} aria-labelledby="h-shape">
            <h2 id="h-shape">Space · radius · elevation</h2>
            <div className={styles.row}>
              {[4, 8, 12, 16, 24].map((n) => (
                <span
                  key={n}
                  className={styles.space}
                  style={{ width: n * 2, height: n * 2 }}
                  title={`${n} px`}
                />
              ))}
              {["--radius-sm", "--radius-md", "--radius-lg"].map((r) => (
                <span key={r} className={styles.radius} style={{ borderRadius: `var(${r})` }}>
                  <code>{r}</code>
                </span>
              ))}
              {["--shadow-raised", "--shadow-overlay"].map((s) => (
                <span key={s} className={styles.radius} style={{ boxShadow: `var(${s})` }}>
                  <code>{s}</code>
                </span>
              ))}
            </div>
          </section>

          <section id="icons" className={styles.section} aria-labelledby="h-icons">
            <h2 id="h-icons">Icons</h2>
            <ul className={styles.icons}>
              {NODE_KINDS.map((kind) => (
                <li key={kind}>
                  <KindIcon kind={kind} />
                  <span>{kind}</span>
                </li>
              ))}
              {Object.entries(UI_ICONS).map(([name, Icon]) => (
                <li key={name}>
                  <Icon size={16} aria-hidden />
                  <span>{name}</span>
                </li>
              ))}
            </ul>
          </section>

          <section id="node-card" className={styles.section} aria-labelledby="h-node">
            <h2 id="h-node">Node card</h2>
            <div className={styles.flow}>
              <ReactFlow
                nodes={STATE_NODES}
                edges={[]}
                nodeTypes={nodeTypes}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
                panOnDrag={false}
                zoomOnScroll={false}
                zoomOnPinch={false}
                zoomOnDoubleClick={false}
                preventScrolling={false}
                fitView
                fitViewOptions={{ padding: 0.15 }}
                proOptions={{ hideAttribution: true }}
                aria-label="Node card states"
              />
            </div>
          </section>

          <section id="controls" className={styles.section} aria-labelledby="h-controls">
            <h2 id="h-controls">Controls</h2>
            <div className={styles.row}>
              <button type="button" className={interview.primary}>
                Primary
              </button>
              <button type="button" className={interview.secondary}>
                <SkipForward size={16} aria-hidden /> Secondary
              </button>
              <button type="button" className={interview.primary} disabled>
                Disabled
              </button>
              <button type="button" className={review.fix}>
                <Wrench size={14} aria-hidden /> Apply fix
              </button>
            </div>
          </section>

          <section id="panels" className={styles.section} aria-labelledby="h-panels">
            <h2 id="h-panels">Panels</h2>
            <div className={styles.panels}>
              <div className={styles.panelBox}>
                <SloChecklist checks={sampleChecks} pending={false} />
              </div>
              <div className={styles.panelBox}>
                <ul className={review.list}>
                  {sampleFindings.map((f) => (
                    <FindingCard key={f.id} finding={f} labelOf={labelOf} onApply={() => {}} />
                  ))}
                </ul>
              </div>
              <div className={styles.panelBox}>
                <ol className={interview.rubricList}>
                  {[...sampleRubric, unsupportedRubric].map((item, i) => (
                    <li key={`${item.dimension}-${i}`}>
                      <div className={interview.rubricHead}>
                        <span>
                          {item.dimension}
                          {item.unsupported ? " (unsupported)" : ""}
                        </span>
                        <RubricBar item={item} />
                        <span className={interview.rubricScore}>{item.score}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </section>

          <section id="keyboard" className={styles.section} aria-labelledby="h-keyboard">
            <h2 id="h-keyboard">Keyboard</h2>
            <table className={styles.table}>
              <tbody>
                {SHORTCUTS.map(([key, action]) => (
                  <tr key={key}>
                    <th scope="row">
                      <kbd>{key}</kbd>
                    </th>
                    <td>{action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </main>
      </div>
    </div>
  );
}
