import { applyBatch, type Op } from "./ops";
import { emptyGraph, type Graph } from "./types";

/**
 * Starter boards (FR-041). Built from ops so they go through the same validation as any edit.
 * `three-tier` is the golden graph from docs/10 and specs/fixtures/three-tier.graph.json.
 */
export interface Template {
  id: TemplateId;
  name: string;
  description: string;
  ops: Op[];
}

export type TemplateId = "three-tier" | "url-shortener" | "chat";

export const TEMPLATES: Record<TemplateId, Template> = {
  "three-tier": {
    id: "three-tier",
    name: "Three-tier web app",
    description: "Load balancers, 30 API servers, Redis, Postgres with two read replicas.",
    ops: [
      { type: "addNode", id: "client", kind: "client", label: "Users" },
      { type: "addNode", id: "lb", kind: "lb", label: "Load balancer", props: { replicas: 2 } },
      { type: "addNode", id: "api", kind: "service", label: "API", props: { replicas: 30 } },
      { type: "addNode", id: "redis", kind: "cache", label: "Redis", props: { hitRate: 0.9 } },
      {
        type: "addNode",
        id: "pg",
        kind: "sql",
        label: "Postgres (primary)",
        props: { shards: 1, role: "primary", failover: true },
      },
      { type: "addNode", id: "pg-r1", kind: "sql", label: "Postgres replica 1", props: { role: "replica" } },
      { type: "addNode", id: "pg-r2", kind: "sql", label: "Postgres replica 2", props: { role: "replica" } },
      { type: "connect", from: "client", to: "lb" },
      { type: "connect", from: "lb", to: "api" },
      { type: "connect", from: "api", to: "redis", traffic: "read" },
      { type: "connect", from: "api", to: "pg" },
      { type: "connect", from: "pg", to: "pg-r1", kind: "replication", traffic: "write" },
      { type: "connect", from: "pg", to: "pg-r2", kind: "replication", traffic: "write" },
      { type: "setWorkload", rps: 50_000, readRatio: 0.9, peakMultiplier: 1 },
    ],
  },
  "url-shortener": {
    id: "url-shortener",
    name: "URL shortener",
    description: "Read-heavy redirects through a CDN and cache, writes to NoSQL.",
    ops: [
      { type: "addNode", id: "client", kind: "client", label: "Users" },
      { type: "addNode", id: "cdn", kind: "cdn", label: "CDN", props: { hitRate: 0.6 } },
      { type: "addNode", id: "lb", kind: "lb", label: "Load balancer" },
      { type: "addNode", id: "shortener", kind: "service", label: "Shortener API", props: { replicas: 10 } },
      { type: "addNode", id: "redis", kind: "cache", label: "Redis", props: { hitRate: 0.95 } },
      { type: "addNode", id: "links", kind: "nosql", label: "Links (DynamoDB)", props: { shards: 4 } },
      { type: "connect", from: "client", to: "cdn" },
      { type: "connect", from: "cdn", to: "lb" },
      { type: "connect", from: "lb", to: "shortener" },
      { type: "connect", from: "shortener", to: "redis", traffic: "read" },
      { type: "connect", from: "shortener", to: "links" },
      { type: "setWorkload", rps: 40_000, readRatio: 0.95, peakMultiplier: 1 },
    ],
  },
  chat: {
    id: "chat",
    name: "Chat app",
    description: "Gateway, chat service, message queue, fan-out workers and storage.",
    ops: [
      { type: "addNode", id: "client", kind: "client", label: "Users" },
      { type: "addNode", id: "gateway", kind: "gateway", label: "API gateway" },
      { type: "addNode", id: "chat", kind: "service", label: "Chat service", props: { replicas: 8 } },
      { type: "addNode", id: "kafka", kind: "queue", label: "Kafka" },
      { type: "addNode", id: "fanout", kind: "worker", label: "Fan-out workers", props: { replicas: 6 } },
      { type: "addNode", id: "messages", kind: "nosql", label: "Messages (Cassandra)", props: { shards: 3 } },
      { type: "addNode", id: "presence", kind: "cache", label: "Presence (Redis)" },
      { type: "connect", from: "client", to: "gateway" },
      { type: "connect", from: "gateway", to: "chat" },
      { type: "connect", from: "chat", to: "presence", traffic: "read" },
      { type: "connect", from: "chat", to: "kafka", kind: "async", traffic: "write" },
      { type: "connect", from: "kafka", to: "fanout", kind: "async", traffic: "write" },
      { type: "connect", from: "fanout", to: "messages", traffic: "write" },
      { type: "connect", from: "chat", to: "messages", traffic: "read" },
      { type: "setWorkload", rps: 15_000, readRatio: 0.7, peakMultiplier: 1 },
    ],
  },
};

/** Build a template's graph. Throws if a template is invalid (caught by tests, never at runtime). */
export function buildTemplate(id: TemplateId): Graph {
  const result = applyBatch(emptyGraph(), TEMPLATES[id].ops);
  if (!result.ok) {
    throw new Error(`template ${id} is invalid: ${result.errors.map((e) => e.message).join("; ")}`);
  }
  return { ...result.graph, version: 0 };
}

export function isTemplateId(value: string | null | undefined): value is TemplateId {
  return value != null && value in TEMPLATES;
}
