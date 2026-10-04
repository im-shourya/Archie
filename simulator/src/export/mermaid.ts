import type { ArchEdge, ArchNode, Graph } from "../graph";

/**
 * Mermaid flowchart of a board (FR-043). Ids are prefixed and hyphen-free (Mermaid reads "-" as
 * part of an arrow and "end" as a keyword); label text is entity-escaped so a label can't close
 * its node or inject markup (T-05).
 */

export const mermaidId = (id: string) => `n_${id.replace(/-/g, "_")}`;

function text(s: string): string {
  return s
    .replace(/#/g, "#35;")
    .replace(/"/g, "#quot;")
    .replace(/</g, "#lt;")
    .replace(/>/g, "#gt;")
    .replace(/\s+/g, " ")
    .trim();
}

function shape(node: ArchNode): string {
  const parts = [node.label];
  if (node.props.replicas > 1) parts.push(`×${node.props.replicas}`);
  if ((node.props.shards ?? 1) > 1) parts.push(`${node.props.shards} shards`);
  const label = `"${text(parts.join(" "))}"`;
  switch (node.kind) {
    case "client":
      return `([${label}])`;
    case "sql":
    case "nosql":
    case "objectstore":
      return `[(${label})]`;
    case "queue":
      return `[[${label}]]`;
    default:
      return `[${label}]`;
  }
}

function arrow(edge: ArchEdge): string {
  if (edge.kind === "replication") return "==>";
  const tag = edge.traffic === "all" ? "" : `|${edge.traffic}|`;
  return `${edge.kind === "async" ? "-.->" : "-->"}${tag}`;
}

export function toMermaid(graph: Graph): string {
  const lines = ["flowchart LR"];
  for (const node of graph.nodes) lines.push(`  ${mermaidId(node.id)}${shape(node)}`);
  for (const edge of graph.edges) lines.push(`  ${mermaidId(edge.from)} ${arrow(edge)} ${mermaidId(edge.to)}`);
  const down = graph.nodes.filter((n) => n.status === "down");
  if (down.length) {
    lines.push("  classDef down fill:#fdecec,stroke:#b42318,stroke-dasharray:4 3");
    for (const n of down) lines.push(`  class ${mermaidId(n.id)} down`);
  }
  return lines.join("\n") + "\n";
}
