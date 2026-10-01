# 18 · Authentication

## Decision: no user accounts

Archie v1 has **no registration, login or sessions** ([ADR-004](30-architecture-decisions.md)).

| Why | Detail |
|-----|--------|
| No server-side user data | Boards live in the user's browser ([17](17-database.md)) |
| Lowest-friction demo | Judges and users open the link and talk. No signup wall |
| Smaller attack surface | No passwords, tokens or PII to protect |
| Deadline | Auth is days of work that doesn't improve the core loop |

## What protects the API instead

The only valuable server resource is the **AI provider quota** (free tiers by default, ADR-016/017). It's protected by:

| Control | Where | Default |
|---------|-------|---------|
| Per-IP rate limit | `backend/middleware/rateLimit.ts` | 20/min `command`, 6/min `review`/`interview` |
| Global daily cap | same | `ARCHIE_DAILY_CAP=500` AI calls/day (resets 00:00 UTC) |
| Optional access code | `backend/middleware/accessCode.ts` | off unless `ARCHIE_ACCESS_CODE` is set |
| Free-tier quota guards | `ai/src/llm/quota.ts` | Gemini 9 rpm / 19 rpd **per model** (4-model ladder), Groq 28 rpm / 950 rpd / 7.6K tpm / 190K tpd (env-overridable); 429 before a provider is overrun |
| Provider spend limit | Anthropic Console (only if Claude is enabled) | set before public deploy |

### Optional access code flow

Used if the public demo is being abused.

```
AI request without valid header
   ↓ 401 ACCESS_CODE_REQUIRED
Client shows "Enter demo code" dialog
   ↓ user enters code
Client stores it in sessionStorage, sends header  X-Archie-Code: <code>
   ↓ backend compares with crypto.timingSafeEqual
Valid → request proceeds
```

- The code is never put in the URL. It's cleared when the tab closes.
- Fast path, simulator, boards and exports never need it.
- Brute force is limited by the same per-IP rate limiter (5 failed codes/min → 429).

## Future (if accounts are added, v2)

- OAuth only (GitHub/Google) via Auth.js. No passwords.
- httpOnly, `Secure`, `SameSite=Lax` session cookies. CSRF protection on mutations.
- Server DB for synced boards ([ADR-003](30-architecture-decisions.md) would be superseded).
- Per-user AI quotas instead of per-IP.
