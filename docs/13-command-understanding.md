# 13 · Command Understanding

How an utterance becomes ops. Two tiers: **fast path** (deterministic, local) and **AI** (Claude).

```
utterance
   │ normalize
   ▼
fast path ── confident match ──► ops / actions   (⚡ local)
   │ null
   ▼
POST /api/command ──► CommandResult              (✦ AI)
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
| view / sim | `fit` · `zoom (in\|out)` · `run\|pause (the )?sim(ulation)?` · `export (mermaid\|png\|svg\|json\|doc)` · `review` · `share` | action |

`<ref>` = a node reference (§3). `<n>` = integer. `<p>` = percentage.

## 3. Reference resolution (`fastpath/resolve.ts`)

Candidates for a span of text, in order:

1. Exact id or label (case-insensitive).
2. **Pronouns**: `it`, `that`, `that one` → the single node in the selection, else the single node touched by the last event. Anything else is ambiguous.
3. Kind words: `the cache` → the only `cache` node; `the database`/`the db` → the only `sql|nosql`; `the load balancer`/`lb`; `the api`/`the service`.
4. Fuzzy: token-set similarity ≥ 0.8 against id/label (`postgres` → `postgres-primary` when unique).

**Result:** exactly one candidate → resolved. Zero or ≥ 2 → **ambiguous**.

## 4. Confidence rule

The fast path returns `null` (defers to AI) if **any** of these hold:

- No pattern matches the whole utterance.
- Any `<ref>` is ambiguous or unresolved.
- The utterance contains a conjunction joining two commands (`and`, `then`, `also`), so it's handed to the AI as a compound.
- A number is outside bounds.

It **never guesses**. The eval category `fastpath-precision` asserts that the fast path is never *wrong* (it may abstain).

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
