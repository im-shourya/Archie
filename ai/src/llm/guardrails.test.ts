import { describe, expect, it } from "vitest";
import { buildTemplate } from "@archie/simulator";
import type { CommandResult } from "./schemas";
import { applyGuardrails, closestNodes, editDistance, isDestructive, repairMessage } from "./guardrails";

const threeTier = buildTemplate("three-tier");
const result = (ops: { type: "removeNode"; id: string }[]): CommandResult => ({
  kind: "ops",
  ops,
  message: "",
  options: [],
  focusNodeIds: [],
});

describe("guardrails", () => {
  it("editDistance", () => {
    expect(editDistance("kitten", "sitting")).toBe(3);
    expect(editDistance("", "abc")).toBe(3);
    expect(editDistance("pg", "pg")).toBe(0);
  });

  it("closestNodes prefers containment, then edit distance, and skips clients", () => {
    expect(closestNodes("postgres", threeTier).map((n) => n.id).slice(0, 3)).toEqual(["pg", "pg-r1", "pg-r2"]);
    expect(closestNodes("users", threeTier).some((n) => n.id === "client")).toBe(false);
  });

  it("isDestructive: > 3 removals or ≥ 50% of the board", () => {
    expect(isDestructive(result([{ type: "removeNode", id: "redis" }]), threeTier)).toBe(false);
    const four = ["redis", "pg", "pg-r1", "pg-r2"].map((id) => ({ type: "removeNode" as const, id }));
    expect(isDestructive(result(four), threeTier)).toBe(true);
  });

  it("fills an empty message with a default for the kind", () => {
    expect(applyGuardrails({ kind: "noop", ops: [], message: "  ", options: [], focusNodeIds: [] }, threeTier).message).toMatch(/design/);
  });

  it("clips long messages to 600 characters", () => {
    const out = applyGuardrails({ kind: "answer", ops: [], message: "x".repeat(700), options: [], focusNodeIds: [] }, threeTier);
    expect(out.message).toHaveLength(600);
    expect(out.message.endsWith("…")).toBe(true);
  });

  it("G-05: an out-of-bounds number becomes a clarify, even if the model clamped it", () => {
    const clamped: CommandResult = { kind: "ops", ops: [{ type: "setWorkload", rps: 10_000_000 }], message: "Set to the max.", options: [], focusNodeIds: [] };
    const out = applyGuardrails(clamped, threeTier, "send fifty million requests a second");
    expect(out).toMatchObject({ kind: "clarify", ops: [], options: ["Use 10,000,000", "Cancel"] });
    expect(out.message).toBe("50,000,000 requests per second is more than the simulator supports (the limit is 10,000,000). Should I use 10,000,000?");
  });

  it("G-05: a noop on an out-of-bounds request becomes a clarify too", () => {
    const noop: CommandResult = { kind: "noop", ops: [], message: "Can't do that.", options: [], focusNodeIds: [] };
    expect(applyGuardrails(noop, threeTier, "a billion replicas of the api").kind).toBe("clarify");
  });

  it("G-05: leaves answers alone and accepts the clarify answer", () => {
    const answer: CommandResult = { kind: "answer", ops: [], message: "It would saturate.", options: [], focusNodeIds: [] };
    expect(applyGuardrails(answer, threeTier, "what if we got fifty million rps").kind).toBe("answer");
    const ops: CommandResult = { kind: "ops", ops: [{ type: "setWorkload", rps: 10_000_000 }], message: "ok", options: [], focusNodeIds: [] };
    expect(applyGuardrails(ops, threeTier, "send fifty million rps (answer: Use 10,000,000)").kind).toBe("ops");
  });

  it("repairMessage lists every error and the existing ids", () => {
    const msg = repairMessage([{ opIndex: 0, code: "UNKNOWN_NODE", message: 'op 0 (fail): node "x" not found', nodeId: "x" }], threeTier);
    expect(msg).toContain('- op 0 (fail): node "x" not found');
    expect(msg).toContain('Existing node ids: "client", "lb", "api"');
    expect(msg).toContain("not a diff");
  });
});
