import type { NodeKind } from "@archie/simulator";

/**
 * Brand marks on nodes (docs/06 · Node shapes and logos). A node only shows a logo when its
 * label names the technology ("Redis cache", "Postgres primary"), so the board never claims a
 * product the user didn't. The match is a word match, limited to kinds that product can be.
 *
 * Only the matchers live here; the SVG paths are a lazy chunk (brandPaths.ts), so they don't
 * count against the board's initial-JS budget (NFR-015).
 */

export type BrandId =
  | "redis" | "postgresql" | "mysql" | "mariadb" | "sqlite" | "mongodb" | "cockroachdb" | "clickhouse"
  | "supabase" | "upstash" | "kafka" | "rabbitmq" | "nats" | "pulsar" | "elasticsearch" | "opensearch"
  | "algolia" | "meilisearch" | "solr" | "minio" | "gcs" | "cloudflare" | "fastly" | "akamai" | "nginx"
  | "kong" | "envoy" | "traefik" | "stripe" | "paypal" | "auth0" | "graphql" | "nodejs" | "go"
  | "docker" | "neo4j" | "influxdb";

const STORES: NodeKind[] = ["sql", "nosql", "cache", "search", "objectstore", "external"];
const QUEUES: NodeKind[] = ["queue", "worker", "external"];
const EDGE: NodeKind[] = ["cdn", "lb", "gateway", "external"];
const APPS: NodeKind[] = ["service", "worker", "gateway"];
const ANY: NodeKind[] = ["external", "service", "gateway", "worker"];

const BRANDS: readonly { id: BrandId; pattern: RegExp; kinds: readonly NodeKind[] }[] = [
  { id: "redis", pattern: /\bredis\b/, kinds: [...STORES, "queue"] },
  { id: "postgresql", pattern: /\bpostgre(?:s|sql)?\b|\bpg\b/, kinds: STORES },
  { id: "mysql", pattern: /\bmysql\b/, kinds: STORES },
  { id: "mariadb", pattern: /\bmaria(?:db)?\b/, kinds: STORES },
  { id: "sqlite", pattern: /\bsqlite\b/, kinds: STORES },
  { id: "mongodb", pattern: /\bmongo(?:db)?\b/, kinds: STORES },
  { id: "cockroachdb", pattern: /\bcockroach(?:db)?\b/, kinds: STORES },
  { id: "clickhouse", pattern: /\bclickhouse\b/, kinds: STORES },
  { id: "supabase", pattern: /\bsupabase\b/, kinds: STORES },
  { id: "upstash", pattern: /\bupstash\b/, kinds: [...STORES, "queue"] },
  { id: "neo4j", pattern: /\bneo4j\b/, kinds: STORES },
  { id: "influxdb", pattern: /\binflux(?:db)?\b/, kinds: STORES },
  { id: "kafka", pattern: /\bkafka\b/, kinds: QUEUES },
  { id: "rabbitmq", pattern: /\brabbit(?:mq)?\b/, kinds: QUEUES },
  { id: "nats", pattern: /\bnats\b/, kinds: QUEUES },
  { id: "pulsar", pattern: /\bpulsar\b/, kinds: QUEUES },
  { id: "elasticsearch", pattern: /\belastic(?:search)?\b/, kinds: STORES },
  { id: "opensearch", pattern: /\bopensearch\b/, kinds: STORES },
  { id: "algolia", pattern: /\balgolia\b/, kinds: STORES },
  { id: "meilisearch", pattern: /\bmeili(?:search)?\b/, kinds: STORES },
  { id: "solr", pattern: /\bsolr\b/, kinds: STORES },
  { id: "minio", pattern: /\bminio\b/, kinds: STORES },
  { id: "gcs", pattern: /\bgcs\b|\bgoogle cloud storage\b/, kinds: STORES },
  { id: "cloudflare", pattern: /\bcloudflare\b/, kinds: EDGE },
  { id: "fastly", pattern: /\bfastly\b/, kinds: EDGE },
  { id: "akamai", pattern: /\bakamai\b/, kinds: EDGE },
  { id: "nginx", pattern: /\bnginx\b/, kinds: [...EDGE, "service"] },
  { id: "kong", pattern: /\bkong\b/, kinds: EDGE },
  { id: "envoy", pattern: /\benvoy\b/, kinds: EDGE },
  { id: "traefik", pattern: /\btraefik\b/, kinds: EDGE },
  { id: "stripe", pattern: /\bstripe\b/, kinds: ANY },
  { id: "paypal", pattern: /\bpaypal\b/, kinds: ANY },
  { id: "auth0", pattern: /\bauth0\b/, kinds: ANY },
  { id: "graphql", pattern: /\bgraphql\b/, kinds: APPS },
  { id: "nodejs", pattern: /\bnode(?:\.?js)\b/, kinds: APPS },
  { id: "go", pattern: /\bgolang\b|\bgo (?:api|service)\b/, kinds: APPS },
  { id: "docker", pattern: /\bdocker\b/, kinds: APPS },
];

/** The brand a node's label names, if its kind can be that product. */
export function brandFor(label: string, kind: NodeKind): BrandId | null {
  const text = label.toLowerCase();
  return BRANDS.find((b) => b.kinds.includes(kind) && b.pattern.test(text))?.id ?? null;
}
