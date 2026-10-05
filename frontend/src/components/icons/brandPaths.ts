import {
  siAkamai, siAlgolia, siApachekafka, siApachepulsar, siApachesolr, siAuth0, siClickhouse, siCloudflare,
  siCockroachlabs, siDocker, siElasticsearch, siEnvoyproxy, siFastly, siGo, siGooglecloudstorage, siGraphql,
  siInfluxdb, siKong, siMariadb, siMeilisearch, siMinio, siMongodb, siMysql, siNatsdotio, siNeo4j, siNginx,
  siNodedotjs, siOpensearch, siPaypal, siPostgresql, siRabbitmq, siRedis, siSqlite, siStripe, siSupabase,
  siTraefikproxy, siUpstash,
} from "simple-icons";
import type { BrandId } from "./brands";

/** Brand mark paths (simple-icons, CC0; 24×24 viewBox). Loaded lazily by BrandLogo. */
export const BRAND_PATHS: Record<BrandId, { title: string; path: string }> = {
  redis: siRedis, postgresql: siPostgresql, mysql: siMysql, mariadb: siMariadb, sqlite: siSqlite,
  mongodb: siMongodb, cockroachdb: siCockroachlabs, clickhouse: siClickhouse, supabase: siSupabase,
  upstash: siUpstash, neo4j: siNeo4j, influxdb: siInfluxdb, kafka: siApachekafka, rabbitmq: siRabbitmq,
  nats: siNatsdotio, pulsar: siApachepulsar, elasticsearch: siElasticsearch, opensearch: siOpensearch,
  algolia: siAlgolia, meilisearch: siMeilisearch, solr: siApachesolr, minio: siMinio, gcs: siGooglecloudstorage,
  cloudflare: siCloudflare, fastly: siFastly, akamai: siAkamai, nginx: siNginx, kong: siKong,
  envoy: siEnvoyproxy, traefik: siTraefikproxy, stripe: siStripe, paypal: siPaypal, auth0: siAuth0,
  graphql: siGraphql, nodejs: siNodedotjs, go: siGo, docker: siDocker,
};
