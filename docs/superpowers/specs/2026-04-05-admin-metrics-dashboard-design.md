# Admin Metrics Dashboard — Design Spec

**Date:** 2026-04-05
**Status:** Approved for implementation planning
**Scope:** Full BI overhaul of platform admin app (`apps/admin/`)

---

## Context

The current admin dashboard (`apps/admin/src/components/dashboard/PlatformDashboard.tsx`) shows basic counts only — community count, member count, document count, subscription status breakdown. It does not surface:

- Who the new accounts are (no signup list, no recent-signups visibility)
- How many clients are being onboarded per period
- Churn (count, rate, reasons)
- Revenue (MRR, ARR, per-plan breakdown)
- Time-series trends
- Drill-down from headline metrics to the communities that produced them

This spec defines a full business-intelligence layer on top of the existing data: schema additions for reason capture and daily revenue snapshots, a set of read-only metrics APIs with reconciliation and observability built in, a refreshed dashboard where every card is a drill-down entry point, and a `/metrics/*` detail-view hierarchy with time-series charts.

**Design philosophy:** reconciliation over trust, append-only over UPSERT, invariants as tests, drill-down as the primary interaction model.

---

## Architecture Overview

Three layers, delivered in four sequenced PRs.

```
Data Layer               API Layer                    UI Layer
─────────────────        ────────────────────         ──────────────────────
cancellation_reason      GET /api/admin/metrics/      Dashboard: 8 new cards,
  column (communities)     summary                      each a drill-down link
revenue_snapshots        GET /api/admin/metrics/      /metrics/signups (page)
  table (new)              signups                    /metrics/churn   (page)
Daily snapshot cron      GET /api/admin/metrics/      /metrics/revenue (page)
  (append-only,            churn                      /metrics/cohorts (page)
  reconciled against     GET /api/admin/metrics/      /metrics/funnel  (page)
  Stripe API)              revenue                    Cancel flow: reason
Cancel flow captures     GET /api/admin/metrics/        dropdown
  reason                   cohorts                    /clients: +2 filters
                         GET /api/admin/metrics/
                           funnel
                         GET /api/v1/internal/
                           revenue-snapshot/health
```

### Delivery phases

| Phase | PR | Contents |
|---|---|---|
| 1 | Schema & cron | Migrations 0138 (cancellation_reason + subscription-status constants), 0139 (stripe_prices.unit_amount_cents + backfill + webhook sync), 0140 (revenue_snapshots), 0141 (indexes). Snapshot cron route with sanity checks. Cancel-route body fields. Backfill scripts. Runbook. |
| 2 | Metrics API | 6 metrics endpoints + health endpoint. Shared Zod types. Contract + invariant tests. Load tests. |
| 3 | Dashboard refresh | 8 new cards as drill-down links. StatCard + Sparkline components. Recent signups table. Empty/loading/error states. Staleness banner. |
| 4 | Metrics pages | `/metrics/*` routes with Recharts (add recharts to admin package.json). Cohort table. Funnel view. Playwright E2E drill-down tests. No cancel UI work — reason capture lives at the API boundary from PR 1. |

---

## Data Model

### Migration 0138 — `communities` table additions

```sql
ALTER TABLE communities
  ADD COLUMN cancellation_reason text,
  ADD COLUMN cancellation_note text,
  ADD COLUMN cancellation_captured_at timestamptz;
```

**Reason enum** lives in app code at `packages/shared/src/constants/cancellation-reasons.ts`. Starter set (subject to product approval before PR 4): `price`, `switched_provider`, `shutting_down`, `missing_features`, `not_using`, `other`. Not a DB enum type — easier to evolve without migrations. Zod validation at API boundary enforces allowed values.

**Subscription status constants** — new file `packages/shared/src/constants/subscription-statuses.ts`:
```ts
export const ALL_STATUSES = [
  'active', 'trialing', 'past_due',
  'canceled', 'expired', 'unpaid', 'incomplete_expired'
] as const;
export const BILLABLE_STATUSES = ['active', 'past_due'] as const;   // counts toward mrr_cents
export const TRIAL_STATUSES = ['trialing'] as const;                 // counts toward potential_mrr_cents only
export const CHURNED_STATUSES = ['canceled', 'expired', 'unpaid', 'incomplete_expired'] as const;
```
Snapshot job throws loud error on any `subscription_status` value not in `ALL_STATUSES`.

### Migration 0139 — denormalize `unit_amount_cents` into `stripe_prices`

The existing `stripe_prices` table stores only the Stripe Price ID, not the amount. Snapshots need the amount on every run; calling Stripe API each time adds a failure mode. Denormalize:

```sql
ALTER TABLE stripe_prices
  ADD COLUMN unit_amount_cents bigint;  -- nullable until backfilled
```

**Backfill script:** `scripts/backfill-stripe-price-amounts.ts` — reads all `stripe_prices` rows, fetches `unit_amount` from Stripe API, updates. Run once post-migration. After backfill, follow-up migration sets `NOT NULL`:

```sql
ALTER TABLE stripe_prices ALTER COLUMN unit_amount_cents SET NOT NULL;
```

**Ongoing sync:** Add `price.updated` handler to `apps/web/src/app/api/v1/webhooks/stripe/route.ts` — updates `unit_amount_cents` when a Stripe price changes. Rare event; safe to sync reactively.

### Migration 0140 — `revenue_snapshots` table (new)

```sql
CREATE TABLE revenue_snapshots (
  id bigserial PRIMARY KEY,
  snapshot_date date NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  mrr_cents bigint NOT NULL,                     -- BILLABLE_STATUSES only (active, past_due)
  potential_mrr_cents bigint NOT NULL,           -- mrr_cents + trials at list price
  active_subscriptions int NOT NULL,
  trialing_subscriptions int NOT NULL,
  past_due_subscriptions int NOT NULL,
  by_plan jsonb NOT NULL,
  by_community_type jsonb NOT NULL,
  volume_discount_savings_cents bigint NOT NULL DEFAULT 0,
  free_access_cost_cents bigint NOT NULL DEFAULT 0,
  prices_version text NOT NULL,
  reconciliation_drift_pct numeric(5,2),
  communities_skipped int NOT NULL DEFAULT 0,
  mrr_delta_pct numeric(6,2)
);

CREATE INDEX idx_revenue_snapshots_date_computed
  ON revenue_snapshots (snapshot_date DESC, computed_at DESC);
```

`mrr_cents` includes only `BILLABLE_STATUSES`. `potential_mrr_cents` adds `TRIAL_STATUSES` at list price. Dashboard shows `mrr_cents` as primary; `potential_mrr_cents` surfaces as an annotation.

**Append-only.** No UNIQUE on `snapshot_date`. Queries use `DISTINCT ON (snapshot_date) ... ORDER BY snapshot_date DESC, computed_at DESC` to fetch latest per day. Re-running the job accrues rows, never overwrites.

**Platform-wide, not tenant-scoped.** No `community_id` FK. Lives outside RLS like `stripe_prices`. Access requires `requirePlatformAdmin()`.

### Migration 0141 — metrics query indexes

```sql
CREATE INDEX idx_communities_created_at_real
  ON communities (created_at)
  WHERE is_demo = false AND deleted_at IS NULL;

CREATE INDEX idx_communities_canceled_at
  ON communities (subscription_canceled_at)
  WHERE subscription_canceled_at IS NOT NULL;
```

Partial indexes keep them small and fast.

### Price resolution for MRR

After migrations 0132, MRR is computed at snapshot time by joining `communities` → `stripe_prices` on `(subscription_plan, community_type, billing_interval='month')` and reading `unit_amount_cents`. Project only supports monthly billing (`billing_interval` has CHECK constraint on `'month'`), so no annual-to-monthly conversion is needed.

`prices_version` in each snapshot row is `sha256(sorted stripe_prices rows as JSON including unit_amount_cents)` for reproducibility: if a price changes tomorrow, the hash differs and we can tell which snapshot used which price set.

---

## Daily Snapshot Cron

**Route:** `apps/web/src/app/api/v1/internal/revenue-snapshot/route.ts`
**Schedule:** Vercel Cron, `0 2 * * *` (02:00 UTC daily)
**Auth:** `Authorization: Bearer ${CRON_SECRET}` header, same pattern as existing `/api/v1/internal/account-lifecycle`

### Handler logic

```
1. Compute prices_version hash from current stripe_prices rows (including unit_amount_cents)
2. Query live communities: WHERE deleted_at IS NULL AND is_demo = false
                           AND subscription_status IN ALL_STATUSES
3. For each community (try/catch per community for failure isolation):
   - Assert subscription_status is in ALL_STATUSES; if not, throw loud error
   - Resolve unit_amount_cents via stripe_prices join
   - If status in BILLABLE_STATUSES: add to mrr_cents + potential_mrr_cents
   - If status in TRIAL_STATUSES: add to potential_mrr_cents only
   - If status in CHURNED_STATUSES: skip (churn accounting is query-time, not snapshot)
   - Accumulate into by_plan, by_community_type buckets
   - If billing_group: compute discount savings delta (list - discounted)
4. Query active access_plans; compute free_access_cost_cents
5. Reconciliation: call Stripe API for active subscription count + sum, compute drift_pct
6. Compute mrr_delta_pct vs latest prior snapshot
7. Sanity checks BEFORE insert:
   - mrr_cents >= 0 (reject negative)
   - mrr_cents <= 10x prior snapshot OR prior snapshot is null (reject 10x jumps)
   - If rejected: log structured error to Sentry, return 500, DO NOT INSERT
8. INSERT into revenue_snapshots (no ON CONFLICT — append-only)
9. Emit structured log + Sentry breadcrumb: {event:'revenue_snapshot',mrr_cents,drift_pct,
   delta_pct,communities_skipped,prices_version}. No DB audit log table used — this
   event is platform-level, and compliance_audit_log requires a community_id FK.
10. If drift_pct > 5.0 OR |delta_pct| > 20.0: log Sentry warning (future: PagerDuty alert)
11. Return 200 with snapshot summary
```

### Backfill script

`scripts/seed-revenue-snapshot-today.ts` — one-time run post-deploy to write snapshot row for day 0. After that, cron accrues history forward. No backfill of prior days (we don't have the historical Stripe state to reconstruct them accurately).

### Health endpoint

`GET /api/v1/internal/revenue-snapshot/health` returns:
- **200** with `{ last_snapshot_at, hours_since }` if latest `computed_at` within 26 hours
- **503** otherwise

Wired into external uptime monitor post-deploy.

### Runbook

`docs/runbooks/revenue-snapshot-recovery.md` documents:
- How to manually trigger a snapshot
- How to correct a bad snapshot (insert a new row with later `computed_at`)
- How to read drift logs
- What to do if the job stops running

**Test criterion for PR 1 merge:** On staging, (a) manually trigger the snapshot route, verify a row is written, (b) simulate a gap by setting `computed_at` of latest row to 30h ago, verify `/health` returns 503, (c) write a corrective snapshot per the runbook, verify `/health` returns 200. All three steps pass = runbook accepted. Recorded in the PR description.

---

## API Endpoints

All under `/api/admin/metrics/`. All require `requirePlatformAdmin()`. All wrap in `withErrorHandler`.

### Cross-cutting contracts

**Response envelope:**
```ts
{ data: <T>, as_of: "2026-04-05T14:32:00Z", ttl_seconds: 300 }
```

UI uses `as_of` for "Updated 2m ago" display. If `now - as_of > ttl_seconds * 2`, UI renders a staleness banner.

**Timezone:** every endpoint accepts `?tz=<IANA>` param, default `America/New_York`. Validated against IANA zone list via Zod. Date bucketing in app code with `date-fns-tz`, never raw SQL `date_trunc`.

**Caching:** Next.js `export const revalidate = <s>`. Summary=300s, signups/churn=60s, revenue=3600s, cohorts=3600s, funnel=300s. Cache key includes `tz` + `range`.

**Observability:** every handler records `x-query-ms` response header. Queries > 500ms log warning with endpoint + params.

**Shared types:** response schemas exported from `packages/shared/src/types/metrics.ts` and imported by both server handlers and UI hooks. Zod schemas are the source of truth.

### Endpoint specs

| Endpoint | Params | Returns |
|---|---|---|
| `GET /summary` | `tz` | All dashboard card data in one call: signups {7d,30d,delta}, churn {30d,reasons[]}, mrr {current,delta_30d}, access_plans {expiring_30d,active}, at_risk_count |
| `GET /signups` | `tz`, `range=7d\|30d\|90d`, `cursor?` | `{series[{date,count,by_type}], list[{community_id,name,type,created_at,plan,status,owner_email}], next_cursor}` |
| `GET /churn` | `tz`, `range=30d\|90d\|365d` | `{series[], list[{community_id,name,canceled_at,reason,note,mrr_lost_cents,reactivated:bool}], reasons[{reason,count,pct}], reactivations_count}` — query filters `subscription_status IN CHURNED_STATUSES AND subscription_canceled_at BETWEEN ...`; reactivations (status now `active` with non-null canceled_at) surfaced as a separate count |
| `GET /revenue` | `tz`, `range=30d\|90d\|365d` | `{series[{date,mrr_cents,active_subs,reconciliation_drift_pct}], by_plan[], by_community_type[]}` |
| `GET /cohorts` | `tz`, `period=month\|quarter`, `count=6\|12` | `{cohorts[{cohort_date,size,retention[{period_offset,active,pct}]}]}` |
| `GET /funnel` | `tz`, `range=30d\|90d` | `{stages[{name,count,conversion_pct}], drop_offs[]}` from conversion_events + pending_signups |

### Pagination

Signup/churn lists use cursor pagination (cursor = `created_at` or `canceled_at` of last row). Series data is never paginated — bounded by `range` param.

---

## UI Layer

### Dashboard Refresh — drill-down cards

**Location:** `apps/admin/src/components/dashboard/PlatformDashboard.tsx`

Add two new sections above the existing Compliance Health block. Keep existing sections untouched.

**Row 1 — Growth (4 cards):** New this week, New this month, Churned this month, Net new this month
**Row 2 — Revenue & Risk (4 cards):** Current MRR, 30d MRR trend (with sparkline), At risk (past due), Free access expiring 30d

Each card is wrapped in `<a href>` with deep-linkable URL:

| Card | URL |
|---|---|
| New this week | `/metrics/signups?range=7d` |
| New this month | `/metrics/signups?range=30d` |
| Churned this month | `/metrics/churn?range=30d` |
| Net new this month | `/metrics/signups?range=30d&compare=churn` |
| Current MRR | `/metrics/revenue?range=30d` |
| 30d MRR trend | `/metrics/revenue?range=30d` |
| At risk (past due) | `/clients?filter=past_due` |
| Free access expiring 30d | `/clients?filter=access_expiring_30d` |

**Visual affordances:**
- Hover: E0 → E1 elevation (border darkens, subtle shadow) per design tokens
- Focus ring on keyboard nav (never suppress `:focus-visible`)
- Trailing chevron icon (`aria-hidden="true"`) signals drill-down
- Delta arrows paired with text ("up 20%") — never color-alone

**Recent Signups table** below cards, above Compliance Health: last 10 non-demo communities with links to `/clients/{id}`. "View all signups →" links to `/metrics/signups?range=30d`.

**New components:**
- `apps/admin/src/components/dashboard/StatCard.tsx` — stat + delta + optional sparkline, renders as `<a>`
- `apps/admin/src/components/dashboard/Sparkline.tsx` — tiny inline SVG, no Recharts dependency (keep dashboard bundle small)

**States:**
- Loading: `Skeleton` matching card shapes
- Empty: encouraging copy + constructive action (per design.md UX writing rules)
- Error: `AlertBanner danger` with retry
- Stale (as_of > ttl*2): `AlertBanner aware` at top of dashboard

### `/metrics/*` pages

**Not tabs** — sibling routes for URL-level drill-down:
- `/metrics/signups`
- `/metrics/churn`
- `/metrics/revenue`
- `/metrics/cohorts`
- `/metrics/funnel`

Shared layout at `apps/admin/src/app/metrics/layout.tsx`: left nav with sections, range selector at top-right.

Each page follows the same shape:
1. Hero metric (matches dashboard card number)
2. Recharts time-series chart
3. Breakdown section (by type / plan / reason)
4. Paginated community list with links to `/clients/{id}`

Recharts is only imported on these pages (not the dashboard), keeping the dashboard bundle light.

### `/clients` filter additions

Two new query-param filters added to existing `apps/admin/src/app/clients/page.tsx`:
- `?filter=past_due` → `subscription_status = 'past_due'`
- `?filter=access_expiring_30d` → join access_plans WHERE grace_ends_at < now + interval '30 days' AND status in ('active','in_grace')

No new page. Reuses existing filter pattern.

### Cancel flow — reason capture at API boundary

**Problem:** `POST /api/v1/communities/[id]/cancel` (`apps/web/src/app/api/v1/communities/[id]/cancel/route.ts`) currently has no caller UI visible in the codebase. Building a dedicated cancel UI is scope creep on a metrics spec.

**Solution:** Capture reason at the API boundary, not the UI.

- Add required `reason` field + optional `note` field to the cancel route's request body. Zod-validate `reason` against `CANCELLATION_REASONS`.
- Write `cancellation_reason`, `cancellation_note`, `cancellation_captured_at` alongside the existing `deletedAt` mutation (`cancel/route.ts:70`).
- Whatever UI eventually calls this route (self-service settings, admin community detail, or both) wires a dropdown to the request body. That UI work is a **separate ticket**, owned by whoever builds the cancel button.

**Follow-up backfill ticket:** Historical `subscription_canceled_at IS NOT NULL` rows will have NULL reasons. Separate remediation script can backfill a best-guess reason based on billing history if product decides it's worth the effort. Not in scope here.

---

## Testing Strategy

### Layer 1 — Mathematical invariants (property-based, fast-check)

File: `packages/db/src/__tests__/metrics-invariants.test.ts`

- `sum(by_plan.mrr_cents) === mrr_cents` for every snapshot
- `active + trialing + past_due === count(communities where status in those)` for every snapshot
- `signups - churn === net change in active count` over any window
- `cohort retention pct <= 100` always
- Every active subscription joins to a row in `stripe_prices`
- No community has `deleted_at IS NOT NULL AND subscription_status IN BILLABLE_STATUSES` (invariant violation = webhook race; alert, don't just filter)
- `potential_mrr_cents >= mrr_cents` for every snapshot (trials never subtract)

Run against real seed + 1000 fuzzed communities. CI gate.

### Layer 2 — Chaos scenarios

File: `apps/web/src/__tests__/revenue-snapshot-chaos.test.ts`

| Scenario | Assertion |
|---|---|
| Late Stripe webhook (6h backdate) | Reconciliation drift > 0 logged |
| Missing stripe_prices row | `communities_skipped >= 1`, snapshot still writes |
| 3-day cron gap | Health endpoint 503, dashboard shows stale banner, backfill script recovers |
| Duplicate snapshot same day | 2 rows, `DISTINCT ON` returns latest |
| DST fallback day (Nov 3 2024) | Exactly 1 snapshot written |
| Timezone boundary (23:55 ET / 00:05 ET) | Both in same ET day bucket |
| Unknown subscription_status enum | Loud error (not silent skip) |
| MRR drop > 20% | Audit log warning entry |
| Future-dated created_at (2030) | Sanity check rejects |
| Access plan grace boundary | t-1s / t / t+1s behave correctly |

All CI gates.

### Layer 3 — Load / performance

- 1K synthesized communities in isolated test DB → all 6 endpoints p95 < 500ms (realistic 1-2 year horizon)
- Cohort query 24 months × 50/month → single query, uses index (EXPLAIN verified)
- Snapshot job completes < 10s at 1K active communities (Vercel cron timeout 60s, plenty of headroom)

### Layer 4 — Contract tests

File: `apps/admin/src/__tests__/metrics-contracts.test.ts`
- Every endpoint response parsed against shared Zod schema, any drift fails CI

### Layer 5 — E2E drill-down (Playwright)

One test per card:
- Click card → URL matches target
- Hero number on drill-down page equals dashboard card number
- List has ≥ that count of rows
- Clicking first row lands on `/clients/{id}`

Catches the "two code paths computing the same metric differently" bug class.

### Layer 6 — Accessibility (axe-core)

Dashboard + all `/metrics/*` pages scanned in CI. Fails on `serious` or `critical` violations.

### Layer 7 — Post-deploy verification

- Runbook tested in staging before merge
- Dual-run window: 2 weeks of logged snapshot output vs manual Stripe CSV, weekly reconciliation
- Trust-gate flips only after drift < 1% for 14 consecutive days
- Synthetic uptime check on `/health` every 15 min

### Deliberately out of scope

- Mutation testing (low ROI at this scale)
- Stripe webhook fuzz testing (Stripe provides types + test mode)
- Production chaos injection (staging chaos tests sufficient for 247 communities)

---

## Critical Files

**Create:**
- `packages/db/migrations/0138_add_cancellation_reason.sql`
- `packages/db/migrations/0139_stripe_prices_unit_amount.sql` (add column, nullable)
- `packages/db/migrations/0139a_stripe_prices_unit_amount_not_null.sql` (after backfill; may split into follow-up PR)
- `packages/db/migrations/0140_revenue_snapshots.sql`
- `packages/db/migrations/0141_metrics_indexes.sql`
- `packages/shared/src/constants/cancellation-reasons.ts`
- `packages/shared/src/constants/subscription-statuses.ts`
- `scripts/backfill-stripe-price-amounts.ts`
- `packages/shared/src/types/metrics.ts`
- `apps/web/src/app/api/v1/internal/revenue-snapshot/route.ts`
- `apps/web/src/app/api/v1/internal/revenue-snapshot/health/route.ts`
- `apps/admin/src/app/api/admin/metrics/summary/route.ts`
- `apps/admin/src/app/api/admin/metrics/signups/route.ts`
- `apps/admin/src/app/api/admin/metrics/churn/route.ts`
- `apps/admin/src/app/api/admin/metrics/revenue/route.ts`
- `apps/admin/src/app/api/admin/metrics/cohorts/route.ts`
- `apps/admin/src/app/api/admin/metrics/funnel/route.ts`
- `apps/admin/src/app/metrics/layout.tsx`
- `apps/admin/src/app/metrics/signups/page.tsx`
- `apps/admin/src/app/metrics/churn/page.tsx`
- `apps/admin/src/app/metrics/revenue/page.tsx`
- `apps/admin/src/app/metrics/cohorts/page.tsx`
- `apps/admin/src/app/metrics/funnel/page.tsx`
- `apps/admin/src/components/dashboard/StatCard.tsx`
- `apps/admin/src/components/dashboard/Sparkline.tsx`
- `scripts/seed-revenue-snapshot-today.ts`
- `docs/runbooks/revenue-snapshot-recovery.md`
- Test files per Testing Strategy section

**Modify:**
- `packages/db/src/schema/communities.ts` — add 3 cancellation columns
- `packages/db/src/schema/stripe-prices.ts` — add `unit_amount_cents` column
- `packages/db/src/schema/index.ts` — export revenue_snapshots
- `packages/db/migrations/meta/_journal.json` — register new migrations
- `apps/admin/package.json` — add `recharts` dependency
- `apps/admin/src/components/dashboard/PlatformDashboard.tsx` — add new sections
- `apps/admin/src/lib/server/dashboard.ts` — add fetchers for new cards
- `apps/admin/src/app/clients/page.tsx` — add 2 filter options (`past_due`, `access_expiring_30d`)
- `apps/web/vercel.json` — register `/api/v1/internal/revenue-snapshot` cron alongside existing `account-lifecycle` entry
- `apps/web/src/app/api/v1/communities/[id]/cancel/route.ts` — accept `reason` (required) + `note` (optional) in body; write to new community columns
- `apps/web/src/app/api/v1/webhooks/stripe/route.ts` — handle `price.updated` event to sync `unit_amount_cents`

**Reuse:**
- `stripe_prices` table and lookup helpers (no changes)
- `conversion_events` table for funnel endpoint
- `pending_signups` table for funnel endpoint
- `access_plans` table for free-access metrics
- `billing_groups` table for volume discount calc
- `compliance_audit_log` table for audit entries
- `withErrorHandler` wrapper pattern
- `requirePlatformAdmin()` auth helper
- Existing shadcn `Table`, `Skeleton`, `AlertBanner` components

---

## Verification

Each phase has its own verification:

**Phase 1 (Schema + cron):**
- `pnpm --filter @propertypro/db db:migrate` applies 0131-0133 cleanly
- `pnpm typecheck` passes
- Backfill script `scripts/seed-revenue-snapshot-today.ts` inserts 1 row locally
- Manual hit to `/api/v1/internal/revenue-snapshot` (with CRON_SECRET) returns 200 + inserts a second row
- Health endpoint returns 200 within 26h of run, 503 after
- Chaos tests (Layer 2) pass in CI

**Phase 2 (API):**
- All 6 endpoints return 200 with valid Zod-parsed bodies when hit with `requirePlatformAdmin` session
- Contract tests (Layer 4) pass
- Invariant tests (Layer 1) pass
- Load tests (Layer 3) pass p95 budgets

**Phase 3 (Dashboard):**
- Dashboard renders with all 8 new cards + recent signups table
- Each card click navigates to correct URL
- axe-core (Layer 6) passes
- Staleness banner appears if snapshot > 10 min old (simulated)

**Phase 4 (Metrics pages + cancel flow):**
- All 5 `/metrics/*` pages render with live data from APIs
- Playwright E2E drill-down tests (Layer 5) pass for each card
- Cancel flow captures reason + note, writes to DB correctly
- Hero numbers on metrics pages match corresponding dashboard card numbers

**Production cutover gate:** 14 consecutive days of reconciliation drift < 1% in staging before declaring production-ready.
