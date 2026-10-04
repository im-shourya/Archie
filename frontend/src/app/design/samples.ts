import {
  applyBatch,
  buildTemplate,
  PROBLEMS,
  simulate,
  sloChecks,
  type Finding,
} from "@archie/simulator";
import type { RubricItem } from "@/features/interview/state";

/** Static sample data for the /design style guide (docs/design §8). No store, no network. */

export const TOKENS: { name: string; role: string; text?: boolean }[] = [
  { name: "--color-background", role: "Page and canvas" },
  { name: "--color-surface", role: "Cards, panels" },
  { name: "--color-surface-sunken", role: "Icon wells, interviewer bubble" },
  { name: "--color-text-primary", role: "Primary text", text: true },
  { name: "--color-text-secondary", role: "Secondary text", text: true },
  { name: "--color-text-muted", role: "Muted text", text: true },
  { name: "--color-border-subtle", role: "Dividers" },
  { name: "--color-border-default", role: "Inputs, chips" },
  { name: "--color-border-strong", role: "Sheet grip, dashed outlines" },
  { name: "--color-primary", role: "Actions, focus, the mic", text: true },
  { name: "--color-primary-hover", role: "Primary hover" },
  { name: "--color-primary-foreground", role: "Text on primary" },
  { name: "--color-primary-subtle", role: "Primary tint" },
  { name: "--color-focus", role: "Focus ring" },
  { name: "--color-state-healthy", role: "ρ < 0.7, passing checks", text: true },
  { name: "--color-state-warm", role: "0.7 ≤ ρ < 0.9, low severity", text: true },
  { name: "--color-state-hot", role: "0.9 ≤ ρ < 1, medium severity", text: true },
  { name: "--color-state-saturated", role: "ρ ≥ 1, failing, high severity, SPOF", text: true },
  { name: "--color-state-down", role: "Failed component", text: true },
  { name: "--color-edge", role: "Edges" },
];

export const TYPE_SCALE = [
  { size: 11, use: "Node load, badges" },
  { size: 12, use: "Labels, captions" },
  { size: 13, use: "Panel headings (uppercase), details" },
  { size: 14, use: "Body small, findings, transcript" },
  { size: 16, use: "Body, inputs, questions" },
  { size: 34, use: "Scorecard overall (mono)" },
];

export const SHORTCUTS = [
  ["/ or ⌘K", "Focus the command bar"],
  ["H", "Toggle hands-free"],
  ["F", "Fit the graph"],
  ["⌘Z / ⇧⌘Z", "Undo / redo"],
  ["1–4", "Choose a clarify option"],
  ["Delete", "Remove the selection"],
  ["Tab, Enter", "Focus and select a component; Escape returns from the Inspector"],
  ["R", "Open Review (design boards)"],
  ["A", "Focus the answer box (interview)"],
  ["N", "Next question (interview)"],
];

const threeTier = buildTemplate("three-tier");
export const sampleSim = simulate(threeTier);
const failed = applyBatch(threeTier, [{ type: "fail", id: "redis" }]);
export const failedSim = failed.ok ? simulate(failed.graph) : sampleSim;
export { threeTier as sampleGraph };

export const sampleChecks = sloChecks(threeTier, PROBLEMS["url-shortener"]);

export const sampleFindings: Finding[] = [
  {
    id: "s-high",
    severity: "high",
    nodeIds: ["redis"],
    title: "Redis is a single point of failure",
    detail: "Losing one instance drops success from 96.3% to 54.5%.",
    fix: { summary: "Run 2 instances of Redis", ops: [] },
    source: "rule",
  },
  {
    id: "s-medium",
    severity: "medium",
    nodeIds: ["api", "pg"],
    title: "Synchronous writes couple API to Postgres",
    detail: "Every write waits on Postgres (5,000 writes/s).",
    fix: null,
    source: "ai",
  },
  {
    id: "s-low",
    severity: "low",
    nodeIds: ["api"],
    title: "Reads from API go straight to Postgres",
    detail: "90% of traffic is reads, and none of it is cached.",
    fix: { summary: "Add a cache", ops: [] },
    source: "rule",
  },
];

export const sampleRubric: RubricItem[] = [1, 2, 3, 4, 5].map((score, i) => ({
  dimension: (
    ["scalability", "availability", "data-modelling", "trade-offs", "communication"] as const
  )[i]!,
  score,
  evidence: "",
  nodeIds: [],
  unsupported: false,
}));
export const unsupportedRubric: RubricItem = {
  dimension: "trade-offs",
  score: 3,
  evidence: "",
  nodeIds: [],
  unsupported: true,
};
