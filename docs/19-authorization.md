# 19 · Authorization

With no accounts ([18](18-authentication.md)), authorization is about **capabilities per context**, not roles in a DB.

## Actors

| Actor | Who |
|-------|-----|
| **Visitor** | Anyone opening the site |
| **Board owner** | The browser that holds a board in its IndexedDB |
| **Share viewer** | Anyone opening a `/s#…` link |
| **Operator** | Whoever controls the Vercel env vars (the maintainer) |

## Permission matrix

| Capability | Visitor | Board owner | Share viewer | Operator |
|------------|:------:|:-----------:|:------------:|:--------:|
| Create a board / use templates | ✅ | ✅ | ✅ (via Duplicate) | ✅ |
| Edit a board (ops, undo, inspector) | — | ✅ | ❌ read-only | — |
| Run simulation, fail/recover nodes | — | ✅ | ✅ (ephemeral, not saved) | — |
| Use fast-path commands | ✅ | ✅ | ❌ (bar hidden) | ✅ |
| Use AI routes | ✅ within rate limit / code | ✅ | ❌ | ✅ |
| Delete a board | — | ✅ (own browser only) | ❌ | ❌ |
| Export | — | ✅ | ✅ | — |
| Change limits, model, access code | ❌ | ❌ | ❌ | ✅ (env vars + redeploy) |
| See server logs | ❌ | ❌ | ❌ | ✅ (Vercel) |

## Rules

| ID | Rule | Enforced by |
|----|------|-------------|
| AZ-01 | A board can only be modified by the browser that stores it | Data never leaves IndexedDB. There's no server write path |
| AZ-02 | Share viewers can't mutate the source board | `/s` renders a detached copy. "Duplicate" creates a new id |
| AZ-03 | AI routes are limited per IP and globally | `rateLimit` middleware |
| AZ-04 | When `ARCHIE_ACCESS_CODE` is set, AI routes require it | `accessCode` middleware |
| AZ-05 | Configuration is changeable only by the operator | env vars, no admin API exists |
| AZ-06 | The server never stores or returns another user's data | stateless backend; logs exclude utterance text |

## Resource ownership

There is no shared resource besides the API budget, and AZ-03/04 cover it. If accounts arrive (v2), this doc becomes a role matrix (owner / editor / viewer per board).
