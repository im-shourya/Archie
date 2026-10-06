import type { Op } from "../graph";
import type { ProblemId } from "./types";

/**
 * Reference designs: one design per problem that passes every SLO check (docs/34 Step 2). This is
 * the answer key, so it is not exported from the package index: only tests and the server import
 * it, and it never ships in the browser bundle.
 */

const node = (id: string, kind: string, label: string, props: Record<string, unknown> = {}): Op =>
  ({ type: "addNode", id, kind, label, props }) as Op;
const conn = (from: string, to: string, extra: Record<string, unknown> = {}): Op =>
  ({ type: "connect", from, to, ...extra }) as Op;
const replication = (from: string, to: string): Op =>
  conn(from, to, { kind: "replication", traffic: "write" });

export const REFERENCE_DESIGNS: Record<ProblemId, Op[]> = {
  "url-shortener": [
    node("client", "client", "Users"),
    node("cdn", "cdn", "CDN", { replicas: 2, hitRate: 0.8 }),
    node("lb", "lb", "Load balancer", { replicas: 2 }),
    node("api", "service", "Shortener API", { replicas: 8 }),
    node("cache", "cache", "Redis", { replicas: 2, hitRate: 0.9 }),
    node("db", "sql", "Links DB", { role: "primary", failover: true }),
    node("db-r1", "sql", "Links replica", { role: "replica" }),
    conn("client", "cdn"),
    conn("cdn", "lb"),
    conn("lb", "api"),
    conn("api", "cache", { traffic: "read" }),
    conn("api", "db"),
    replication("db", "db-r1"),
  ],
  "rate-limiter": [
    node("client", "client", "API clients"),
    node("lb", "lb", "Load balancer", { replicas: 6 }),
    node("gw", "gateway", "Limiter gateway", { replicas: 14 }),
    node("counters", "cache", "Counter store", { replicas: 4, hitRate: 1 }),
    conn("client", "lb"),
    conn("lb", "gw"),
    conn("gw", "counters"),
  ],
  chat: [
    node("client", "client", "Users"),
    node("gw", "gateway", "WebSocket gateway", { replicas: 5 }),
    node("chat", "service", "Chat service", { replicas: 40 }),
    node("history", "cache", "Recent history", { replicas: 2, hitRate: 0.8 }),
    node("kafka", "queue", "Kafka", { replicas: 3 }),
    node("fanout", "worker", "Fan-out workers", { replicas: 64 }),
    node("messages", "nosql", "Message store", { replicas: 3, shards: 4 }),
    conn("client", "gw"),
    conn("gw", "chat"),
    conn("chat", "history", { traffic: "read" }),
    conn("chat", "messages", { traffic: "read" }),
    conn("chat", "kafka", { traffic: "write" }),
    conn("kafka", "fanout", { kind: "async" }),
    conn("fanout", "messages"),
  ],
  "news-feed": [
    node("client", "client", "Users"),
    node("cdn", "cdn", "CDN", { replicas: 3, hitRate: 0.6 }),
    node("lb", "lb", "Load balancer", { replicas: 3 }),
    node("feed", "service", "Feed service", { replicas: 36 }),
    node("cache", "cache", "Feed cache", { replicas: 2, hitRate: 0.95 }),
    node("db", "sql", "Posts DB", { role: "primary", failover: true, shards: 2 }),
    node("db-r1", "sql", "Posts replica", { role: "replica", shards: 2 }),
    conn("client", "cdn"),
    conn("cdn", "lb"),
    conn("lb", "feed"),
    conn("feed", "cache", { traffic: "read" }),
    conn("feed", "db"),
    replication("db", "db-r1"),
  ],
  "ride-dispatch": [
    node("client", "client", "Riders and drivers"),
    node("lb", "lb", "Load balancer", { replicas: 2 }),
    node("dispatch", "service", "Dispatch service", { replicas: 25 }),
    node("geo", "cache", "Driver locations", { replicas: 2, hitRate: 0.95 }),
    node("db", "sql", "Trips DB", { role: "primary", failover: true, shards: 3 }),
    node("db-r1", "sql", "Trips replica", { role: "replica", shards: 3 }),
    conn("client", "lb"),
    conn("lb", "dispatch"),
    conn("dispatch", "geo", { traffic: "read" }),
    conn("dispatch", "db"),
    replication("db", "db-r1"),
  ],
  "video-streaming": [
    node("client", "client", "Viewers"),
    node("cdn", "cdn", "CDN", { replicas: 4, hitRate: 0.95 }),
    node("lb", "lb", "Load balancer", { replicas: 2 }),
    node("api", "service", "Video API", { replicas: 15 }),
    node("segments", "objectstore", "Segment storage", { replicas: 4 }),
    node("db", "sql", "Catalog DB", { role: "primary", failover: true }),
    node("db-r1", "sql", "Catalog replica", { role: "replica" }),
    conn("client", "cdn"),
    conn("cdn", "lb"),
    conn("lb", "api"),
    conn("api", "segments", { traffic: "read" }),
    conn("api", "db", { traffic: "write" }),
    replication("db", "db-r1"),
  ],
};
