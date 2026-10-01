import type { Graph } from "./types";

/** Ids of nodes added or changed between two graphs (used to pulse nodes after undo/redo). */
export function changedNodeIds(prev: Graph, next: Graph): string[] {
  const before = new Map(prev.nodes.map((n) => [n.id, n]));
  const edgeKey = (g: Graph, id: string) =>
    g.edges
      .filter((e) => e.from === id || e.to === id)
      .map((e) => e.id)
      .sort()
      .join("|");
  return next.nodes
    .filter((n) => {
      const old = before.get(n.id);
      if (!old) return true;
      return (
        old.label !== n.label ||
        old.status !== n.status ||
        JSON.stringify(old.props) !== JSON.stringify(n.props) ||
        edgeKey(prev, n.id) !== edgeKey(next, n.id)
      );
    })
    .map((n) => n.id);
}

/** Stable key of the graph's shape. Layout only needs to re-run when this changes. */
export function topologyKey(graph: Graph): string {
  const nodes = graph.nodes.map((n) => `${n.id}:${n.kind}`).sort();
  const edges = graph.edges.map((e) => `${e.id}:${e.kind}`).sort();
  return `${nodes.join(",")}#${edges.join(",")}`;
}
