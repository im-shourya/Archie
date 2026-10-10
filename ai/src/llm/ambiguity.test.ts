import { describe, expect, it } from "vitest";
import { applyBatch, buildTemplate, type Graph, type Op } from "@archie/simulator";
import { applyGuardrails } from "./guardrails";
import { ambiguousRefs } from "./ambiguity";
import type { CommandResult } from "./schemas";

/** G-13: a definite generic reference ("the database") that matches 2+ components is asked, not guessed. */

function board(ops: Op[], base = buildTemplate("three-tier")): Graph {
  const r = applyBatch(base, ops);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.graph;
}
/** three-tier + a NoSQL catalog store + a worker: "the database" now means two things. */
const twoDbs = board([
  { type: "addNode", id: "catalog-db", kind: "nosql", label: "Catalog (MongoDB)" },
  { type: "connect", from: "api", to: "catalog-db" },
  { type: "addNode", id: "email-workers", kind: "worker", label: "Email workers" },
]);
const usersService = board([
  { type: "addNode", id: "users", kind: "service", label: "Users service" },
  { type: "addNode", id: "users-db", kind: "sql", label: "Users DB" },
  { type: "connect", from: "users", to: "users-db" },
]);
const ops = (list: Op[]): CommandResult => ({ kind: "ops", ops: list, message: "Done.", options: [], focusNodeIds: [] });
const connectWorkerToPg = ops([{ type: "connect", from: "email-workers", to: "pg", traffic: "write" }]);

describe("ambiguousRefs", () => {
  it("finds 'the database' when two datastores match, as clusters (primary, not replicas)", () => {
    const refs = ambiguousRefs("connect the workers to the database", twoDbs);
    expect(refs).toHaveLength(1);
    expect(refs[0]!.phrase).toBe("database");
    expect(refs[0]!.candidates.map((n) => n.id).sort()).toEqual(["catalog-db", "pg"]);
  });

  it.each([
    ["a single match", "kill the cache", twoDbs],
    ["a named reference", "connect the workers to the catalog database", twoDbs],
    ["a primary with its replicas (one cluster)", "connect the api to the database", buildTemplate("three-tier")],
    ["an indefinite reference (a new component)", "add a database for the workers", twoDbs],
    ["a plural", "turn on failover for both databases", twoDbs],
    // "users" alone matches the Users client and the Users service, but "the users database" is a name.
    ["a modifier before a kind word", "put a cache in front of the users database", usersService],
  ])("ignores %s", (_name, utterance, graph) => {
    expect(ambiguousRefs(utterance, graph)).toEqual([]);
  });
});

describe("applyGuardrails · G-13", () => {
  it("turns a guess between two databases into a clarify naming both", () => {
    const out = applyGuardrails(connectWorkerToPg, twoDbs, "connect the workers to the database");
    expect(out.kind).toBe("clarify");
    expect(out.ops).toEqual([]);
    expect(out.message).toMatch(/which database/i);
    expect(out.options).toEqual(expect.arrayContaining(["Postgres (primary)", "Catalog (MongoDB)"]));
    expect(out.focusNodeIds.sort()).toEqual(["catalog-db", "pg"]);
  });

  it("holds a confirm the same way (removing one of two databases)", () => {
    const confirm: CommandResult = { ...ops([{ type: "removeNode", id: "pg" }]), kind: "confirm" };
    expect(applyGuardrails(confirm, twoDbs, "remove the database").kind).toBe("clarify");
  });

  it("lets the edit through when it touches every candidate", () => {
    const both = ops([
      { type: "connect", from: "email-workers", to: "pg" },
      { type: "connect", from: "email-workers", to: "catalog-db" },
    ]);
    expect(applyGuardrails(both, twoDbs, "connect the workers to the database").kind).toBe("ops");
  });

  it("lets the edit through when it doesn't touch the candidates at all", () => {
    const unrelated = ops([{ type: "replicate", id: "api", replicas: 5 }]);
    expect(applyGuardrails(unrelated, twoDbs, "five api servers, the database is fine").kind).toBe("ops");
  });

  it("never asks again once the user has answered the clarify", () => {
    const out = applyGuardrails(connectWorkerToPg, twoDbs, "connect the workers to the database (answer: Postgres (primary))");
    expect(out.kind).toBe("ops");
  });

  it("leaves answers and noops alone", () => {
    const answer: CommandResult = { kind: "answer", ops: [], message: "It's the database.", options: [], focusNodeIds: ["pg"] };
    expect(applyGuardrails(answer, twoDbs, "is the database the bottleneck").kind).toBe("answer");
  });
});
