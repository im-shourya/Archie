"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ElkApi from "elkjs/lib/elk-api.js";
import { topologyKey, type Graph } from "@archie/simulator";
import {
  elkConstructor,
  fallbackLayout,
  positionsFrom,
  toElkGraph,
  type Direction,
  type ElkLayout,
  type Positions,
} from "./layout";

const LAYOUT_TIMEOUT_MS = 3000;

let elk: ElkLayout | null | undefined;

/** One ELK instance per tab, backed by a Web Worker. `null` if it can't be created. */
function getElk(): ElkLayout | null {
  if (elk !== undefined) return elk;
  try {
    const ELK = elkConstructor(ElkApi);
    elk = new ELK({
      workerFactory: () => new Worker(new URL("./layout.worker.ts", import.meta.url)),
    });
  } catch (err) {
    console.warn("[archie] ELK unavailable, using fallback layout", err);
    elk = null;
  }
  return elk;
}

async function layout(graph: Graph, direction: Direction): Promise<Positions> {
  const engine = getElk();
  if (!engine) return fallbackLayout(graph, direction);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      engine.layout(toElkGraph(graph, direction)).then(positionsFrom),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("layout timed out")), LAYOUT_TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    console.warn("[archie] ELK layout failed, using fallback layout", err);
    return fallbackLayout(graph, direction);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Positions for every node. Re-runs only when the topology changes (props-only edits keep
 * positions). Pinned nodes keep their pinned position (FR-014).
 */
export function useLayout(graph: Graph | null, direction: Direction = "RIGHT"): Positions | null {
  const [computed, setComputed] = useState<{ key: string; positions: Positions } | null>(null);
  const key = graph ? `${direction}|${topologyKey(graph)}` : null;
  const latestGraph = useRef(graph);
  useEffect(() => {
    latestGraph.current = graph;
  });

  useEffect(() => {
    const current = latestGraph.current;
    if (key === null || !current) return;
    let cancelled = false;
    void layout(current, direction).then((positions) => {
      if (!cancelled) setComputed({ key, positions });
    });
    return () => {
      cancelled = true;
    };
  }, [key, direction]);

  // Memoized: a new object every render would re-trigger the canvas sync effect forever.
  return useMemo(() => {
    if (!graph || !computed) return null;
    const positions: Positions = { ...computed.positions };
    for (const node of graph.nodes) {
      if (node.pinned) positions[node.id] = node.pinned;
    }
    return positions;
  }, [graph, computed]);
}
