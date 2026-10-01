# 13 · Command Understanding

How an utterance becomes ops. Two tiers: **fast path** (deterministic, local) and **AI** (Claude).

```
utterance
   │ normalize
   ▼
fast path ── confident match ──► ops / actions   (local)
   │ null
   ▼
POST /api/command ──► CommandResult              (AI)
```

## 1. Normalization (`fastpath/normalize.ts`)

- Lowercase, trim, collapse whitespace, strip trailing punctuation and fillers (`um`, `uh`, `please`, `okay so`, `can you`).
- Number words → digits: `fifty thousand` → `50000`, `one point two million` → `1200000`, `50k` → `50000`, `2m` → `2000000`, `ninety percent` → `90%`.
- Common dictation fixes: `post gress`/`postgres sequel` → `postgres`, `read is`/`red is` → `redis`, `cough ka`/`kafka` → `kafka`, `engine x` → `nginx`. The table lives in `fastpath/aliases.ts` and grows from eval failures.

## 2. Grammar (`fastpath/grammar.ts`)

Ordered patterns, anchored (the whole utterance must match):

| Intent | Patterns (after normalization) | Output |
|--------|--------------------------------|--------|
| undo / redo | `undo( that)?` · `redo` · `go back` | action |
| fail | `(kill\|take down\|fail\|crash\|turn off) <ref>` | `fail` |
| recover | `(bring back\|recover\|restart\|turn on) <ref>` · `bring it back` | `recover` |
| remove | `(delete\|remove\|drop) <ref>` | `removeNode` |
| connect | `connect <ref> (to\|with) <ref>` · `<ref> (calls\|talks to) <ref>` | `connect` |
| disconnect | `disconnect <ref> from <ref>` | `disconnect` |
| replicas | `<n> (replicas\|servers\|instances) (of\|for) <ref>` · `scale <ref> to <n>` · `give <ref> <n> (servers\|replicas)` | `replicate` |
| shards | `shard <ref> (into\|to) <n>` | `updateNode {shards}` |
| hit rate | `(set )?<ref> hit rate (to )?<p>%` | `updateNode {hitRate}` |
| workload | `send <n> (rps\|requests per second)( , <p>% reads)?` · `set (traffic\|load) to <n>` · `<p>% reads` · `peak (is )?<n>x` | `setWorkload` |
| view | `fit` · `fit the view` · `zoom (in\|out)` | action |
| sim / export (later phases) | `run\|pause the sim` · `export …` · `review` · `share` | not yet: returns `null` |

`<ref>` = a node reference (§3). `<n>` = integer. `<p>` = percentage.

## 3. Reference resolution (`fastpath/resolve.ts`)

Candidates for a span of text, in order:

Stages run in order; the first stage with any candidate decides:

1. **Pronouns**: `it`, `that`, `that one`, `this` → the single selected node, else the node(s) referenced by the last change with ops (`kill redis` → `bring it back`).
2. **Exact** id or label (case-insensitive, punctuation-insensitive).
3. **Contains**: every spoken word (plural-insensitive) appears in the node's label or id (`chat` → "Chat service", `postgres replica 1` → `pg-r1`).
4. **Kind words** from catalog aliases (`the cache`, `kafka`, `the load balancer`, `lb`) plus generic words (`database`/`db` → `sql|nosql`).

Leading articles (`the`, `my`, …) and trailing generic words (`node`, `instance`) are ignored. A span containing `and`/`or`/`then` never resolves (two things were named).

**Cluster rule:** a SQL primary and its read replicas count as one cluster. If several candidates remain and the user didn't say "replica", the replicas are dropped; one primary left → resolved, several → ambiguous with the primaries as candidates (for clarify chips). This is deterministic, not a guess.

**Result:** exactly one candidate → resolved. Zero or ≥ 2 → **not resolved**, and the whole command returns `null`.

## 4. Confidence rule

The fast path returns `null` (defers to AI) if **any** of these hold:

- No pattern matches the whole utterance.
- Any `<ref>` is ambiguous or unresolved.
- The utterance contains a conjunction joining two commands (`and`, `then`, `also`), so it's handed to the AI as a compound.
- A number is outside bounds.

It **never guesses**. The eval category `fastpath-precision` asserts that the fast path is never *wrong* (it may abstain).

## Implementation & measurements

`ai/src/fastpath`: `normalize.ts`, `numbers.ts`, `resolve.ts`, `parse.ts` (rules in order, anchored; a rule whose builder can't resolve falls through to the next rule; every op batch must pass `validateBatch`). 84 unit tests cover understood commands **and** a negative suite of ambiguous, compound, unknown, leftover-word and invalid-op utterances that must return `null`.

`npm run bench:fast` (normalize → grammar → resolve → validate → applyBatch, 14 dictated utterances × 1,000 iterations, Apple M4, Node 22, commit `c055a5e`): **P50 0.006 ms · P70 0.008 ms · P95 0.014 ms · P100 0.138 ms** (target P50 < 10 ms, P100 < 50 ms).

## 5. AI tier

The AI receives the utterance plus context ([12](12-ai-architecture.md)) and must return a `CommandResult`:

| `kind` | When |
|--------|------|
| `ops` | The intent is clear and expressible as ops |
| `clarify` | A reference is ambiguous, or crucial info is missing ("add a database": SQL or NoSQL? Only ask if it matters; otherwise pick a sensible default and say so) |
| `confirm` | Ops would remove > 3 nodes or clear the board (the model may set it; guardrails enforce it, see [14](14-ai-guardrails.md)) |
| `answer` | The utterance is a question about the design |
| `noop` | Not about the design |

### Defaults the model should apply silently (and mention in `message`)

| Said | Default |
|------|---------|
| "a database" | `sql` primary, shards 1 |
| "a cache" | `cache`, hitRate 0.9, cache-aside on the nearest service |
| "a queue" / "Kafka" / "SQS" | `queue`, inline via `insertBetween` on the write path |
| "N servers" | `replicas: N` on the service |
| "read replicas" | separate `sql` replica nodes + `replication` edges |

### Worked examples (subset of the 12 in the system prompt)

| Utterance (graph context) | Result |
|---------------------------|--------|
| "users hit two load balancers, thirty API servers, Postgres with two replicas, and Redis" (empty) | `ops`: 7 `addNode` + `connect`s |
| "add a cache in front of postgres" (api→pg) | `ops`: `addNode redis` + `connect api→redis (read)` |
| "put kafka in front of the writes" (api→pg) | `ops`: `insertBetween api→pg kafka` + `addNode writer` + … |
| "connect the payment service to the database" (orders-db, users-db) | `clarify`: "Which database?" `[orders, users]` |
| "remove everything except the api" (8 nodes) | `confirm`: 7 `removeNode` |
| "why is checkout slow?" | `answer` citing ρ and p99 with `focusNodeIds` |
| "write me a poem" | `noop` |

## 6. Clarification round-trip

The client stores the pending utterance. On a chip tap or a spoken answer, it re-sends `utterance: "<original> (answer: <choice>)"`. The answer isn't treated as a new command, and nothing is applied until a `kind: ops` arrives.
