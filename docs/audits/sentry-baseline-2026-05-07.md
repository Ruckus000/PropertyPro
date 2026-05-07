# Sentry Baseline — 2026-05-07

First real-data baseline of the three signatures originally chosen for the
Phase 0.3 verification gate, now that ingestion is live ([PR #190](https://github.com/Ruckus000/PropertyPro/pull/190)
relocated `instrumentation.ts` into `apps/<name>/src/`).

**Window:** last 24 hours (2026-05-06 → 2026-05-07)
**Environments:** `vercel-production`, `vercel-preview`
**Org/project:** `propertypro / property-pro`

## Tooling note

Sentry auto-derives `environment` from `VERCEL_ENV`, so production traffic
is tagged `vercel-production` and preview as `vercel-preview`. Searches
filtering on plain `environment:production` will silently miss everything —
use `environment:[vercel-production,vercel-preview]`.

## Signatures

| # | Signature | Source | Last-24h count |
|---|---|---|---|
| 1 | `[approve-join-request] notification insert failed` | C3 — `apps/web/src/app/api/v1/communities/join-requests/[id]/approve/route.ts` | **0** |
| 2 | `[deny-join-request] notification insert failed` | C3 — deny variant of #1 | **0** |
| 3 | `429` on `/api/v1/esign/sign/*` | C2 esign rate limit (10 req/min IP-keyed, [PR #5b57d9fc](https://github.com/Ruckus000/PropertyPro/commit/5b57d9fc)) | **0** |

## Project-wide context

- Total spans ingested: **220** (vercel-production + vercel-preview)
- Total errors ingested: **1** — and that one is the synthetic verification
  event from yesterday's gate run (`Error: phase-0.3-sentry-verification-1778101459774`).
- Total 429 responses: **0** project-wide

## Interpretation

- **Ingestion is healthy.** Spans are landing under both environment tags
  and the SDK/DSN/instrumentation chain works end-to-end. The 220 spans /
  1 (synthetic) error mix matches a low-traffic pre-launch env.
- **C3 (notifications-in-tx) has no live traffic to compare against.** The
  `community_join_requests` table is still empty in prod (per
  `project_drizzle_snapshot_collision.md` follow-up notes), so the
  approve/deny notification path has never run. The transactional behavior
  shipped in `1c723d64 fix(notifications): make insertNotifications transaction-aware`
  will be the first behavior real users ever see when this feature ships.
  A non-prod failure-injection on the approve/deny flow remains owed
  before the feature launches.
- **C2 esign rate limit hasn't been triggered** in 24h — no `429` responses
  anywhere in the project, on `/api/v1/esign/sign/` or any other route.
  Either real e-sign traffic is below the 10 req/min IP threshold, or
  there isn't real e-sign traffic yet. Either way, the limiter is not
  generating noise.

## Outcome

Phase 0.3 — previously 🟨 (Sentry blackout meant no data) — is now ✅ for
**ingestion** and **baseline**. Both originally-flagged dynamic risks
(C3 notifications, C2 esign rate limit) show zero live signal in the 24h
window. The dynamic-isolation game day (Phase 0.5) is the only Phase 0
item still 🟨.
