# 27 · Performance

## Budgets

| Area | Budget | Req | How we hit it |
|------|--------|-----|---------------|
| Fast path | P50 < 10 ms | NFR-001 | precompiled regexes, resolver index built once per graph version |
| Simulator | P95 < 5 ms @ 100 nodes | NFR-003 | O(V+E) propagation; Monte Carlo on typed arrays; memoized per `graph.version` |
| SPOF scan | < 1 s @ 200 nodes, off main thread | FR-027 | Web Worker, debounced 1 s |
| Layout | < 100 ms @ 50 nodes, off main thread | NFR-004 | elkjs in a Web Worker; skip layout if only props changed |
| AI command | P50 < 3 s, P95 < 6 s | NFR-002 | fast path first; effort `low`; cached static system prompt; compact DSL context; one repair max |
| Canvas | ≥ 50 fps @ 50 nodes with particles | NFR-005 | ≤ 60 particles/edge; particles drawn on one canvas overlay, not DOM; paused when tab hidden |
| Board JS | < 300 KB gz initial | NFR-015 | elkjs + worker lazy; React Flow only on `/b/*`; no chart lib on board (SVG sparkline) |
| First load (Home) | LCP < 2.0 s on 4G | — | Server Component, no canvas, system fonts or 1 subset webfont |
| IndexedDB save | non-blocking | — | debounced 500 ms, `requestIdleCallback` |

## Render strategy

- Zustand selectors per component. Node cards subscribe to their own `SimResult.nodes[id]` only.
- React Flow: `nodeTypes` defined once (module scope); `onlyRenderVisibleElements`.
- Simulation result applied in one store update per batch (no cascade of renders).
- The traffic animation runs in `requestAnimationFrame` on a canvas layer, reading edge rps from a ref (no React state per frame).

## Backend

- The Anthropic client is a module singleton (connection reuse across warm invocations).
- No DB, no cold-start migrations. The cold start is dominated by the Node runtime plus the SDK import (keep `ai/llm` lean).
- Request bodies capped (256 KB). The graph DSL is built in a single pass.

## Expected load

A demo or hackathon audience: tens of concurrent users at most. The bottleneck is the AI budget (protected by limits), not compute. Static assets come from Vercel's CDN.

## Measuring

[24-latency-benchmark.md](24-latency-benchmark.md) for benches; Chrome Performance panel + React Profiler for fps/renders; `next build` output + `@next/bundle-analyzer` for bundle size.
