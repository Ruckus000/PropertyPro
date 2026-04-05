# Admin Metrics — Phase 1: Schema & Cron Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the data layer and daily revenue snapshot cron that future admin metrics pages will read from.

**Architecture:** Add cancellation-reason columns to `communities`, denormalize `unit_amount_cents` onto `stripe_prices`, create an append-only `revenue_snapshots` table, and ship a daily Vercel cron at 02:00 UTC that computes MRR with reconciliation against Stripe and sanity checks before insert. No UI in this phase.

**Tech Stack:** Drizzle ORM, PostgreSQL via Supabase, Next.js 15 App Router, Stripe Node SDK, Vercel Cron, Sentry, Vitest + fast-check.

**Spec:** `docs/superpowers/specs/2026-04-05-admin-metrics-dashboard-design.md`

---

## File Structure

**Create:**
- `packages/shared/src/constants/subscription-statuses.ts` — status enum + BILLABLE/TRIAL/CHURNED subsets
- `packages/shared/src/constants/cancellation-reasons.ts` — cancellation reason enum + Zod schema
- `packages/db/migrations/0138_add_cancellation_reason.sql`
- `packages/db/migrations/0139_stripe_prices_unit_amount.sql`
- `packages/db/migrations/0139a_stripe_prices_unit_amount_not_null.sql`
- `packages/db/migrations/0140_revenue_snapshots.sql`
- `packages/db/migrations/0141_metrics_indexes.sql`
- `packages/db/src/schema/revenue-snapshots.ts` — Drizzle schema
- `scripts/backfill-stripe-price-amounts.ts` — one-time Stripe API sync
- `scripts/seed-revenue-snapshot-today.ts` — one-time Day 0 snapshot
- `apps/web/src/lib/services/revenue-snapshot-service.ts` — pure computation (testable)
- `apps/web/src/app/api/v1/internal/revenue-snapshot/route.ts` — cron handler
- `apps/web/src/app/api/v1/internal/revenue-snapshot/health/route.ts` — health check
- `apps/web/__tests__/services/revenue-snapshot-service.test.ts` — unit + invariants
- `apps/web/__tests__/api/revenue-snapshot-chaos.test.ts` — chaos scenarios
- `docs/runbooks/revenue-snapshot-recovery.md`

**Modify:**
- `packages/db/src/schema/communities.ts` — add 3 cancellation columns
- `packages/db/src/schema/stripe-prices.ts` — add `unit_amount_cents`
- `packages/db/src/schema/index.ts` — export revenue-snapshots
- `packages/db/migrations/meta/_journal.json` — register new migrations
- `apps/web/vercel.json` — register revenue-snapshot cron
- `apps/web/src/app/api/v1/communities/[id]/cancel/route.ts` — accept reason+note body
- `apps/web/src/app/api/v1/webhooks/stripe/route.ts` — handle `price.updated`

---

## Preflight

- [ ] **Verify current migration state**

Run: `ls packages/db/migrations/*.sql | tail -3`
Expected: highest file is `0137_community_join_requests.sql`. If different, STOP — renumber the migrations below to match.

Run: `python3 -c "import json; j=json.load(open('packages/db/migrations/meta/_journal.json')); print(j['entries'][-1]['idx'], j['entries'][-1]['tag'])"`
Expected: `137 0137_community_join_requests`. If journal idx ≠ 137, STOP and check with user.

- [ ] **Verify CRON_SECRET pattern**

Run: `grep -l "REVENUE_SNAPSHOT_CRON_SECRET" .env.local apps/web/.env.local 2>/dev/null`
Expected: empty (not yet added). If found, skip env var creation.

- [ ] **Verify fast-check is available**

Run: `pnpm --filter @propertypro/web list fast-check 2>&1 | grep fast-check || echo NOT_INSTALLED`
Expected: may be `NOT_INSTALLED`. If so, add to Task 10.

---

### Task 1: Subscription status constants

**Files:**
- Create: `packages/shared/src/constants/subscription-statuses.ts`
- Test: `packages/shared/__tests__/subscription-statuses.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/__tests__/subscription-statuses.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ALL_STATUSES,
  BILLABLE_STATUSES,
  TRIAL_STATUSES,
  CHURNED_STATUSES,
} from '../src/constants/subscription-statuses';

describe('subscription-statuses', () => {
  it('ALL_STATUSES contains all 7 known values', () => {
    expect(new Set(ALL_STATUSES)).toEqual(
      new Set([
        'active', 'trialing', 'past_due',
        'canceled', 'expired', 'unpaid', 'incomplete_expired',
      ]),
    );
  });

  it('BILLABLE, TRIAL, and CHURNED are disjoint subsets of ALL_STATUSES', () => {
    const billable = new Set(BILLABLE_STATUSES);
    const trial = new Set(TRIAL_STATUSES);
    const churned = new Set(CHURNED_STATUSES);
    for (const s of billable) expect(trial.has(s)).toBe(false);
    for (const s of billable) expect(churned.has(s)).toBe(false);
    for (const s of trial) expect(churned.has(s)).toBe(false);
    for (const s of [...billable, ...trial, ...churned]) {
      expect(ALL_STATUSES).toContain(s);
    }
  });

  it('union of subsets equals ALL_STATUSES', () => {
    const union = new Set([...BILLABLE_STATUSES, ...TRIAL_STATUSES, ...CHURNED_STATUSES]);
    expect(union).toEqual(new Set(ALL_STATUSES));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @propertypro/shared test subscription-statuses`
Expected: FAIL with "Cannot find module '../src/constants/subscription-statuses'"

- [ ] **Step 3: Write the constants module**

Create `packages/shared/src/constants/subscription-statuses.ts`:

```ts
/**
 * Subscription status enum shared across server, client, and billing logic.
 *
 * These match the string values written to `communities.subscription_status`
 * by the Stripe webhook handler.
 */
export const ALL_STATUSES = [
  'active',
  'trialing',
  'past_due',
  'canceled',
  'expired',
  'unpaid',
  'incomplete_expired',
] as const;

export type SubscriptionStatus = (typeof ALL_STATUSES)[number];

/** Statuses that count toward billable MRR (customer is paying). */
export const BILLABLE_STATUSES = ['active', 'past_due'] as const;

/** Statuses that indicate a trial — count toward potential MRR only. */
export const TRIAL_STATUSES = ['trialing'] as const;

/** Statuses that indicate churn (subscription ended). */
export const CHURNED_STATUSES = [
  'canceled',
  'expired',
  'unpaid',
  'incomplete_expired',
] as const;

export function isBillableStatus(s: string): boolean {
  return (BILLABLE_STATUSES as readonly string[]).includes(s);
}

export function isTrialStatus(s: string): boolean {
  return (TRIAL_STATUSES as readonly string[]).includes(s);
}

export function isChurnedStatus(s: string): boolean {
  return (CHURNED_STATUSES as readonly string[]).includes(s);
}

export function isKnownStatus(s: string): s is SubscriptionStatus {
  return (ALL_STATUSES as readonly string[]).includes(s);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @propertypro/shared test subscription-statuses`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/constants/subscription-statuses.ts packages/shared/__tests__/subscription-statuses.test.ts
git commit -m "feat(shared): subscription status constants with billable/trial/churned subsets"
```

---

### Task 2: Cancellation reasons constants

**Files:**
- Create: `packages/shared/src/constants/cancellation-reasons.ts`
- Test: `packages/shared/__tests__/cancellation-reasons.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/__tests__/cancellation-reasons.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  CANCELLATION_REASONS,
  cancellationReasonSchema,
} from '../src/constants/cancellation-reasons';

describe('cancellation-reasons', () => {
  it('exports the expected starter set', () => {
    expect(CANCELLATION_REASONS).toEqual([
      'price',
      'switched_provider',
      'shutting_down',
      'missing_features',
      'not_using',
      'other',
    ]);
  });

  it('Zod schema accepts valid reasons', () => {
    for (const r of CANCELLATION_REASONS) {
      expect(cancellationReasonSchema.safeParse(r).success).toBe(true);
    }
  });

  it('Zod schema rejects unknown reasons', () => {
    expect(cancellationReasonSchema.safeParse('bogus').success).toBe(false);
    expect(cancellationReasonSchema.safeParse('').success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @propertypro/shared test cancellation-reasons`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write the module**

Create `packages/shared/src/constants/cancellation-reasons.ts`:

```ts
import { z } from 'zod';

/**
 * Starter set of cancellation reasons. Subject to product approval
 * before being surfaced in cancel-flow UI.
 */
export const CANCELLATION_REASONS = [
  'price',
  'switched_provider',
  'shutting_down',
  'missing_features',
  'not_using',
  'other',
] as const;

export type CancellationReason = (typeof CANCELLATION_REASONS)[number];

export const cancellationReasonSchema = z.enum(CANCELLATION_REASONS);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @propertypro/shared test cancellation-reasons`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/constants/cancellation-reasons.ts packages/shared/__tests__/cancellation-reasons.test.ts
git commit -m "feat(shared): cancellation reason constants + Zod schema"
```

---

### Task 3: Migration 0138 — communities cancellation columns

**Files:**
- Create: `packages/db/migrations/0138_add_cancellation_reason.sql`
- Modify: `packages/db/src/schema/communities.ts`
- Modify: `packages/db/migrations/meta/_journal.json`

- [ ] **Step 1: Write migration SQL**

Create `packages/db/migrations/0138_add_cancellation_reason.sql`:

```sql
-- Add cancellation reason capture columns to communities.
-- Reason is validated at the API boundary via Zod; not a DB enum for easier evolution.

ALTER TABLE communities
  ADD COLUMN cancellation_reason text,
  ADD COLUMN cancellation_note text,
  ADD COLUMN cancellation_captured_at timestamptz;
```

- [ ] **Step 2: Update Drizzle schema**

Find the existing column block in `packages/db/src/schema/communities.ts`. After the last column definition (near the `deletedAt` or `subscriptionCanceledAt` field), add:

```ts
    cancellationReason: text('cancellation_reason'),
    cancellationNote: text('cancellation_note'),
    cancellationCapturedAt: timestamp('cancellation_captured_at', { withTimezone: true }),
```

If `text` or `timestamp` aren't already imported, add them to the existing import from `drizzle-orm/pg-core`.

- [ ] **Step 3: Register in migration journal**

Append to the `entries` array in `packages/db/migrations/meta/_journal.json`:

```json
{
  "idx": 138,
  "version": "7",
  "when": <CURRENT_UNIX_MS>,
  "tag": "0138_add_cancellation_reason",
  "breakpoints": true
}
```

Replace `<CURRENT_UNIX_MS>` with `Date.now()` output (run `node -e 'console.log(Date.now())'`). Match the `"version"` field to what other entries use.

- [ ] **Step 4: Apply migration locally**

Run: `scripts/with-env-local.sh pnpm --filter @propertypro/db db:migrate`
Expected: migration applies cleanly, no errors.

Verify columns exist:
Run: `scripts/with-env-local.sh pnpm --filter @propertypro/db exec tsx -e "import {createUnscopedClient} from './src/unsafe'; import {sql} from 'drizzle-orm'; const db=createUnscopedClient(); const r=await db.execute(sql\`SELECT column_name FROM information_schema.columns WHERE table_name='communities' AND column_name LIKE 'cancellation%' ORDER BY column_name\`); console.log(r.rows); process.exit(0);"`
Expected: rows include `cancellation_captured_at`, `cancellation_note`, `cancellation_reason`.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/db/migrations/0138_add_cancellation_reason.sql packages/db/migrations/meta/_journal.json packages/db/src/schema/communities.ts
git commit -m "feat(db): 0138 add cancellation_reason columns to communities"
```

---

### Task 4: Migration 0139 — stripe_prices.unit_amount_cents (nullable)

**Files:**
- Create: `packages/db/migrations/0139_stripe_prices_unit_amount.sql`
- Modify: `packages/db/src/schema/stripe-prices.ts`
- Modify: `packages/db/migrations/meta/_journal.json`

- [ ] **Step 1: Write migration SQL**

Create `packages/db/migrations/0139_stripe_prices_unit_amount.sql`:

```sql
-- Denormalize unit_amount_cents onto stripe_prices so revenue snapshots can
-- compute MRR without calling Stripe on every run.
-- Nullable until backfill (Task 5) populates it; Task 6 sets NOT NULL.

ALTER TABLE stripe_prices
  ADD COLUMN unit_amount_cents bigint;
```

- [ ] **Step 2: Update Drizzle schema**

In `packages/db/src/schema/stripe-prices.ts`, add `bigint` to the `drizzle-orm/pg-core` import list if not present, then add this column after `stripePriceId`:

```ts
    unitAmountCents: bigint('unit_amount_cents', { mode: 'number' }),
```

- [ ] **Step 3: Register in journal**

Append to `packages/db/migrations/meta/_journal.json`:

```json
{
  "idx": 139,
  "version": "7",
  "when": <CURRENT_UNIX_MS>,
  "tag": "0139_stripe_prices_unit_amount",
  "breakpoints": true
}
```

- [ ] **Step 4: Apply and verify**

Run: `scripts/with-env-local.sh pnpm --filter @propertypro/db db:migrate`
Expected: applies cleanly.

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db/migrations/0139_stripe_prices_unit_amount.sql packages/db/migrations/meta/_journal.json packages/db/src/schema/stripe-prices.ts
git commit -m "feat(db): 0139 add nullable unit_amount_cents to stripe_prices"
```

---

### Task 5: Stripe price amount backfill script

**Files:**
- Create: `scripts/backfill-stripe-price-amounts.ts`

- [ ] **Step 1: Write the script**

Create `scripts/backfill-stripe-price-amounts.ts`:

```ts
/**
 * One-time backfill: populate stripe_prices.unit_amount_cents from the Stripe API.
 *
 * Idempotent — skips rows that already have a value. Safe to rerun.
 *
 * Usage: scripts/with-env-local.sh pnpm tsx scripts/backfill-stripe-price-amounts.ts
 */
import Stripe from 'stripe';
import { isNull } from 'drizzle-orm';
import { stripePrices } from '@propertypro/db';
import { createUnscopedClient } from '@propertypro/db/unsafe';

async function main() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.error('STRIPE_SECRET_KEY not set');
    process.exit(1);
  }
  const stripe = new Stripe(secretKey);
  const db = createUnscopedClient();

  const rows = await db
    .select()
    .from(stripePrices)
    .where(isNull(stripePrices.unitAmountCents));

  console.log(`Found ${rows.length} rows needing backfill`);

  let ok = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const price = await stripe.prices.retrieve(row.stripePriceId);
      if (price.unit_amount === null) {
        console.warn(`Stripe price ${row.stripePriceId} has null unit_amount; skipping`);
        failed += 1;
        continue;
      }
      await db
        .update(stripePrices)
        .set({ unitAmountCents: price.unit_amount, updatedAt: new Date() })
        .where(isNull(stripePrices.unitAmountCents))
        // Re-narrow by id would be better if multiple nullables exist:
        // We filter by id via a second condition:
        ;
      // ^ The above is imprecise under concurrency — replace with id filter:
      console.log(`Updated ${row.stripePriceId} -> ${price.unit_amount}`);
      ok += 1;
    } catch (err) {
      console.error(`Failed ${row.stripePriceId}:`, err);
      failed += 1;
    }
  }
  console.log(`Done. OK=${ok} FAILED=${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
```

**NOTE:** The above has a bug — the UPDATE filters by `isNull(unit_amount_cents)` not by id. Fix in Step 2.

- [ ] **Step 2: Fix the UPDATE to filter by id**

Replace the UPDATE block with:

```ts
      await db
        .update(stripePrices)
        .set({ unitAmountCents: price.unit_amount, updatedAt: new Date() })
        .where(eq(stripePrices.id, row.id));
```

And add `eq` to the imports:

```ts
import { eq, isNull } from 'drizzle-orm';
```

- [ ] **Step 3: Run against local DB**

Run: `scripts/with-env-local.sh pnpm tsx scripts/backfill-stripe-price-amounts.ts`
Expected: "Found N rows needing backfill" followed by N "Updated ..." lines, then "Done. OK=N FAILED=0". If STRIPE_SECRET_KEY is test-mode and prices exist in live mode, it will fail — document in runbook.

Verify:
Run: `scripts/with-env-local.sh pnpm --filter @propertypro/db exec tsx -e "import {createUnscopedClient} from './src/unsafe'; import {sql} from 'drizzle-orm'; const db=createUnscopedClient(); const r=await db.execute(sql\`SELECT COUNT(*) FROM stripe_prices WHERE unit_amount_cents IS NULL\`); console.log(r.rows); process.exit(0);"`
Expected: `[ { count: '0' } ]` (or the count of prices that legitimately have no amount — e.g. metered prices)

- [ ] **Step 4: Rerun to verify idempotency**

Run: `scripts/with-env-local.sh pnpm tsx scripts/backfill-stripe-price-amounts.ts`
Expected: "Found 0 rows needing backfill" or similar — no changes.

- [ ] **Step 5: Commit**

```bash
git add scripts/backfill-stripe-price-amounts.ts
git commit -m "feat(scripts): backfill stripe_prices.unit_amount_cents from Stripe API"
```

---

### Task 6: Migration 0139a — set unit_amount_cents NOT NULL

**Files:**
- Create: `packages/db/migrations/0139a_stripe_prices_unit_amount_not_null.sql`
- Modify: `packages/db/src/schema/stripe-prices.ts`
- Modify: `packages/db/migrations/meta/_journal.json`

- [ ] **Step 1: Verify no NULLs remain**

Run: `scripts/with-env-local.sh pnpm --filter @propertypro/db exec tsx -e "import {createUnscopedClient} from './src/unsafe'; import {sql} from 'drizzle-orm'; const db=createUnscopedClient(); const r=await db.execute(sql\`SELECT COUNT(*) AS c FROM stripe_prices WHERE unit_amount_cents IS NULL\`); console.log(r.rows); process.exit(0);"`
Expected: `[{ c: '0' }]`. If not zero, STOP and investigate.

- [ ] **Step 2: Write migration SQL**

Create `packages/db/migrations/0139a_stripe_prices_unit_amount_not_null.sql`:

```sql
-- Lock in unit_amount_cents as NOT NULL after Task 5 backfill.
-- Safe if backfill populated all rows; errors otherwise (which is what we want).

ALTER TABLE stripe_prices
  ALTER COLUMN unit_amount_cents SET NOT NULL;
```

- [ ] **Step 3: Update schema — remove nullability**

In `packages/db/src/schema/stripe-prices.ts`, change:

```ts
    unitAmountCents: bigint('unit_amount_cents', { mode: 'number' }),
```

to:

```ts
    unitAmountCents: bigint('unit_amount_cents', { mode: 'number' }).notNull(),
```

- [ ] **Step 4: Register in journal**

Append to `packages/db/migrations/meta/_journal.json`:

```json
{
  "idx": 140,
  "version": "7",
  "when": <CURRENT_UNIX_MS>,
  "tag": "0139a_stripe_prices_unit_amount_not_null",
  "breakpoints": true
}
```

**NOTE:** We're using idx 140 here because Drizzle journal idx must be unique and sequential. The file name 0139a is for human readability; the journal idx is still strictly incremented.

- [ ] **Step 5: Apply migration and typecheck**

Run: `scripts/with-env-local.sh pnpm --filter @propertypro/db db:migrate`
Expected: applies cleanly.

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/db/migrations/0139a_stripe_prices_unit_amount_not_null.sql packages/db/migrations/meta/_journal.json packages/db/src/schema/stripe-prices.ts
git commit -m "feat(db): 0139a set stripe_prices.unit_amount_cents NOT NULL"
```

---

### Task 7: Migration 0140 — revenue_snapshots table

**Files:**
- Create: `packages/db/migrations/0140_revenue_snapshots.sql`
- Create: `packages/db/src/schema/revenue-snapshots.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/migrations/meta/_journal.json`

- [ ] **Step 1: Write migration SQL**

Create `packages/db/migrations/0140_revenue_snapshots.sql`:

```sql
-- Append-only daily revenue snapshots. Platform-wide (not tenant-scoped).
-- Query with DISTINCT ON (snapshot_date) ORDER BY snapshot_date DESC, computed_at DESC
-- to fetch the latest row per day.

CREATE TABLE revenue_snapshots (
  id bigserial PRIMARY KEY,
  snapshot_date date NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  mrr_cents bigint NOT NULL,
  potential_mrr_cents bigint NOT NULL,
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

-- Platform-wide table. Same access pattern as stripe_prices: service_role only.
ALTER TABLE revenue_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_snapshots FORCE ROW LEVEL SECURITY;
REVOKE ALL ON revenue_snapshots FROM anon, authenticated;
GRANT SELECT, INSERT ON revenue_snapshots TO service_role;
GRANT USAGE ON SEQUENCE revenue_snapshots_id_seq TO service_role;
```

- [ ] **Step 2: Write Drizzle schema**

Create `packages/db/src/schema/revenue-snapshots.ts`:

```ts
/**
 * revenue_snapshots — append-only daily MRR snapshots.
 *
 * Platform-wide (not tenant-scoped). Written by the revenue-snapshot cron.
 * Queries use DISTINCT ON (snapshot_date) to fetch latest per day.
 */
import {
  bigint,
  bigserial,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const revenueSnapshots = pgTable(
  'revenue_snapshots',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    snapshotDate: date('snapshot_date').notNull(),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
    mrrCents: bigint('mrr_cents', { mode: 'number' }).notNull(),
    potentialMrrCents: bigint('potential_mrr_cents', { mode: 'number' }).notNull(),
    activeSubscriptions: integer('active_subscriptions').notNull(),
    trialingSubscriptions: integer('trialing_subscriptions').notNull(),
    pastDueSubscriptions: integer('past_due_subscriptions').notNull(),
    byPlan: jsonb('by_plan').notNull(),
    byCommunityType: jsonb('by_community_type').notNull(),
    volumeDiscountSavingsCents: bigint('volume_discount_savings_cents', { mode: 'number' })
      .notNull()
      .default(0),
    freeAccessCostCents: bigint('free_access_cost_cents', { mode: 'number' })
      .notNull()
      .default(0),
    pricesVersion: text('prices_version').notNull(),
    reconciliationDriftPct: numeric('reconciliation_drift_pct', { precision: 5, scale: 2 }),
    communitiesSkipped: integer('communities_skipped').notNull().default(0),
    mrrDeltaPct: numeric('mrr_delta_pct', { precision: 6, scale: 2 }),
  },
  (table) => [
    index('idx_revenue_snapshots_date_computed').on(table.snapshotDate, table.computedAt),
  ],
);

export type RevenueSnapshot = typeof revenueSnapshots.$inferSelect;
export type NewRevenueSnapshot = typeof revenueSnapshots.$inferInsert;
```

- [ ] **Step 3: Export from schema index**

In `packages/db/src/schema/index.ts`, add a line in the export list (alphabetical nearest neighbor):

```ts
export * from './revenue-snapshots';
```

- [ ] **Step 4: Register in journal**

Append to `packages/db/migrations/meta/_journal.json`:

```json
{
  "idx": 141,
  "version": "7",
  "when": <CURRENT_UNIX_MS>,
  "tag": "0140_revenue_snapshots",
  "breakpoints": true
}
```

- [ ] **Step 5: Apply and verify**

Run: `scripts/with-env-local.sh pnpm --filter @propertypro/db db:migrate`
Expected: applies cleanly.

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/db/migrations/0140_revenue_snapshots.sql packages/db/src/schema/revenue-snapshots.ts packages/db/src/schema/index.ts packages/db/migrations/meta/_journal.json
git commit -m "feat(db): 0140 revenue_snapshots append-only table"
```

---

### Task 8: Migration 0141 — metrics query indexes

**Files:**
- Create: `packages/db/migrations/0141_metrics_indexes.sql`
- Modify: `packages/db/migrations/meta/_journal.json`

- [ ] **Step 1: Write migration SQL**

Create `packages/db/migrations/0141_metrics_indexes.sql`:

```sql
-- Indexes to support metrics queries on communities.
-- Partial indexes keep them small: only non-demo, live communities by created_at;
-- only canceled subs for churn queries.

CREATE INDEX IF NOT EXISTS idx_communities_created_at_real
  ON communities (created_at)
  WHERE is_demo = false AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_communities_canceled_at
  ON communities (subscription_canceled_at)
  WHERE subscription_canceled_at IS NOT NULL;
```

- [ ] **Step 2: Register in journal**

Append to `packages/db/migrations/meta/_journal.json`:

```json
{
  "idx": 142,
  "version": "7",
  "when": <CURRENT_UNIX_MS>,
  "tag": "0141_metrics_indexes",
  "breakpoints": true
}
```

- [ ] **Step 3: Apply and verify**

Run: `scripts/with-env-local.sh pnpm --filter @propertypro/db db:migrate`
Expected: applies cleanly.

Verify indexes exist:
Run: `scripts/with-env-local.sh pnpm --filter @propertypro/db exec tsx -e "import {createUnscopedClient} from './src/unsafe'; import {sql} from 'drizzle-orm'; const db=createUnscopedClient(); const r=await db.execute(sql\`SELECT indexname FROM pg_indexes WHERE tablename='communities' AND indexname LIKE 'idx_communities_%'\`); console.log(r.rows); process.exit(0);"`
Expected: includes `idx_communities_created_at_real` and `idx_communities_canceled_at`.

- [ ] **Step 4: Commit**

```bash
git add packages/db/migrations/0141_metrics_indexes.sql packages/db/migrations/meta/_journal.json
git commit -m "feat(db): 0141 partial indexes for metrics queries"
```

---

### Task 9: Revenue snapshot service (pure computation)

**Files:**
- Create: `apps/web/src/lib/services/revenue-snapshot-service.ts`

- [ ] **Step 1: Write the pure computation module**

Create `apps/web/src/lib/services/revenue-snapshot-service.ts`:

```ts
/**
 * Pure computation of a revenue snapshot.
 *
 * Deliberately has zero DB/Stripe dependencies — caller passes in all inputs.
 * This makes the function unit-testable without a database and makes the
 * invariants easier to verify.
 */
import { createHash } from 'node:crypto';
import {
  BILLABLE_STATUSES,
  TRIAL_STATUSES,
  isKnownStatus,
} from '@propertypro/shared/constants/subscription-statuses';

export interface PriceRow {
  planId: string;
  communityType: string;
  billingInterval: string;
  unitAmountCents: number;
}

export interface CommunityRow {
  id: number;
  subscriptionStatus: string | null;
  subscriptionPlan: string | null;
  communityType: string;
  billingGroupId: number | null;
  deletedAt: Date | null;
  isDemo: boolean;
}

export interface BillingGroupRow {
  id: number;
  volumeTier: string; // 'none' | 'tier_10' | 'tier_15' | 'tier_20'
  activeCommunityCount: number;
}

export interface AccessPlanRow {
  communityId: number;
  status: 'active' | 'in_grace';
}

export interface SnapshotComputation {
  mrrCents: number;
  potentialMrrCents: number;
  activeSubscriptions: number;
  trialingSubscriptions: number;
  pastDueSubscriptions: number;
  byPlan: Record<string, { count: number; mrrCents: number }>;
  byCommunityType: Record<string, { count: number; mrrCents: number }>;
  volumeDiscountSavingsCents: number;
  freeAccessCostCents: number;
  pricesVersion: string;
  communitiesSkipped: number;
  skipReasons: Array<{ communityId: number; reason: string }>;
}

const VOLUME_TIER_DISCOUNT_PCT: Record<string, number> = {
  none: 0,
  tier_10: 10,
  tier_15: 15,
  tier_20: 20,
};

export function hashPrices(prices: PriceRow[]): string {
  const sorted = [...prices].sort((a, b) => {
    const k = `${a.planId}|${a.communityType}|${a.billingInterval}`;
    const l = `${b.planId}|${b.communityType}|${b.billingInterval}`;
    return k.localeCompare(l);
  });
  const json = JSON.stringify(
    sorted.map((p) => ({
      p: p.planId,
      t: p.communityType,
      i: p.billingInterval,
      a: p.unitAmountCents,
    })),
  );
  return createHash('sha256').update(json).digest('hex').slice(0, 16);
}

function findPrice(
  prices: PriceRow[],
  planId: string,
  communityType: string,
): PriceRow | undefined {
  return prices.find(
    (p) =>
      p.planId === planId && p.communityType === communityType && p.billingInterval === 'month',
  );
}

export function computeSnapshot(input: {
  communities: CommunityRow[];
  prices: PriceRow[];
  billingGroups: BillingGroupRow[];
  accessPlans: AccessPlanRow[];
}): SnapshotComputation {
  const { communities, prices, billingGroups, accessPlans } = input;

  const result: SnapshotComputation = {
    mrrCents: 0,
    potentialMrrCents: 0,
    activeSubscriptions: 0,
    trialingSubscriptions: 0,
    pastDueSubscriptions: 0,
    byPlan: {},
    byCommunityType: {},
    volumeDiscountSavingsCents: 0,
    freeAccessCostCents: 0,
    pricesVersion: hashPrices(prices),
    communitiesSkipped: 0,
    skipReasons: [],
  };

  const billingGroupById = new Map(billingGroups.map((g) => [g.id, g]));

  for (const c of communities) {
    // Hard filter: skip demo and soft-deleted
    if (c.isDemo || c.deletedAt) continue;
    if (!c.subscriptionStatus || !c.subscriptionPlan) {
      result.communitiesSkipped += 1;
      result.skipReasons.push({
        communityId: c.id,
        reason: 'missing_status_or_plan',
      });
      continue;
    }

    // Loud error on unknown status
    if (!isKnownStatus(c.subscriptionStatus)) {
      throw new Error(
        `Unknown subscription_status "${c.subscriptionStatus}" on community ${c.id}`,
      );
    }

    // Status counters (for all known non-churned)
    if (c.subscriptionStatus === 'active') result.activeSubscriptions += 1;
    if (c.subscriptionStatus === 'trialing') result.trialingSubscriptions += 1;
    if (c.subscriptionStatus === 'past_due') result.pastDueSubscriptions += 1;

    // Only billable + trial statuses contribute to revenue
    const isBillable = (BILLABLE_STATUSES as readonly string[]).includes(c.subscriptionStatus);
    const isTrial = (TRIAL_STATUSES as readonly string[]).includes(c.subscriptionStatus);
    if (!isBillable && !isTrial) continue;

    const price = findPrice(prices, c.subscriptionPlan, c.communityType);
    if (!price) {
      result.communitiesSkipped += 1;
      result.skipReasons.push({
        communityId: c.id,
        reason: `no_price_for_${c.subscriptionPlan}_${c.communityType}`,
      });
      continue;
    }

    const listAmount = price.unitAmountCents;

    // Apply volume discount if billing group present
    let chargedAmount = listAmount;
    if (c.billingGroupId) {
      const group = billingGroupById.get(c.billingGroupId);
      if (group) {
        const pct = VOLUME_TIER_DISCOUNT_PCT[group.volumeTier] ?? 0;
        const discount = Math.round(listAmount * (pct / 100));
        chargedAmount = listAmount - discount;
        result.volumeDiscountSavingsCents += discount;
      }
    }

    if (isBillable) {
      result.mrrCents += chargedAmount;
      result.potentialMrrCents += chargedAmount;
    } else if (isTrial) {
      // Trials don't contribute to billable MRR; they count toward potential at list.
      result.potentialMrrCents += listAmount;
    }

    // By-plan rollup (count only billable + trial for MRR view)
    const planKey = c.subscriptionPlan;
    if (!result.byPlan[planKey]) result.byPlan[planKey] = { count: 0, mrrCents: 0 };
    result.byPlan[planKey].count += 1;
    if (isBillable) result.byPlan[planKey].mrrCents += chargedAmount;

    // By-community-type rollup
    const typeKey = c.communityType;
    if (!result.byCommunityType[typeKey])
      result.byCommunityType[typeKey] = { count: 0, mrrCents: 0 };
    result.byCommunityType[typeKey].count += 1;
    if (isBillable) result.byCommunityType[typeKey].mrrCents += chargedAmount;
  }

  // Free access cost: communities with an active or in_grace access plan
  // forgo their list-price MRR. Compute by looking up each such community's price.
  const accessCommunityIds = new Set(accessPlans.map((a) => a.communityId));
  const communityById = new Map(communities.map((c) => [c.id, c]));
  for (const id of accessCommunityIds) {
    const c = communityById.get(id);
    if (!c || !c.subscriptionPlan) continue;
    const price = findPrice(prices, c.subscriptionPlan, c.communityType);
    if (price) result.freeAccessCostCents += price.unitAmountCents;
  }

  return result;
}

export interface SanityCheckInput {
  computed: SnapshotComputation;
  priorMrrCents: number | null; // null if no prior snapshot exists
}

export interface SanityCheckResult {
  ok: boolean;
  reasons: string[];
}

export function runSanityChecks(input: SanityCheckInput): SanityCheckResult {
  const reasons: string[] = [];
  const { computed, priorMrrCents } = input;

  if (computed.mrrCents < 0) {
    reasons.push(`mrr_cents is negative: ${computed.mrrCents}`);
  }
  if (computed.potentialMrrCents < computed.mrrCents) {
    reasons.push(
      `potential_mrr_cents (${computed.potentialMrrCents}) < mrr_cents (${computed.mrrCents})`,
    );
  }
  if (priorMrrCents !== null && priorMrrCents > 0 && computed.mrrCents > priorMrrCents * 10) {
    reasons.push(
      `mrr_cents ${computed.mrrCents} > 10x prior ${priorMrrCents} — rejecting as anomaly`,
    );
  }

  return { ok: reasons.length === 0, reasons };
}

export function computeMrrDeltaPct(current: number, prior: number | null): number | null {
  if (prior === null || prior === 0) return null;
  return Math.round(((current - prior) / prior) * 10000) / 100; // 2 decimals
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @propertypro/web typecheck`
Expected: PASS. If import of `@propertypro/shared/constants/subscription-statuses` fails, check package.json exports map in packages/shared/package.json and add the constants subpath if needed.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/services/revenue-snapshot-service.ts
git commit -m "feat(web): revenue snapshot pure computation service"
```

---

### Task 10: Invariant tests for snapshot service

**Files:**
- Create: `apps/web/__tests__/services/revenue-snapshot-service.test.ts`

- [ ] **Step 1: Install fast-check if needed**

Run: `pnpm --filter @propertypro/web list fast-check 2>&1 | grep fast-check`
If empty: `pnpm --filter @propertypro/web add -D fast-check`

- [ ] **Step 2: Write invariant tests**

Create `apps/web/__tests__/services/revenue-snapshot-service.test.ts`:

```ts
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  computeSnapshot,
  hashPrices,
  runSanityChecks,
  computeMrrDeltaPct,
  type CommunityRow,
  type PriceRow,
  type BillingGroupRow,
  type AccessPlanRow,
} from '@/lib/services/revenue-snapshot-service';

const PRICES: PriceRow[] = [
  { planId: 'plan_1', communityType: 'condo_718', billingInterval: 'month', unitAmountCents: 10000 },
  { planId: 'plan_1', communityType: 'hoa_720', billingInterval: 'month', unitAmountCents: 8000 },
  { planId: 'plan_2', communityType: 'condo_718', billingInterval: 'month', unitAmountCents: 20000 },
];

function makeCommunity(partial: Partial<CommunityRow>): CommunityRow {
  return {
    id: 1,
    subscriptionStatus: 'active',
    subscriptionPlan: 'plan_1',
    communityType: 'condo_718',
    billingGroupId: null,
    deletedAt: null,
    isDemo: false,
    ...partial,
  };
}

describe('computeSnapshot — basic', () => {
  it('computes mrr_cents from a single active community', () => {
    const r = computeSnapshot({
      communities: [makeCommunity({ id: 1 })],
      prices: PRICES,
      billingGroups: [],
      accessPlans: [],
    });
    expect(r.mrrCents).toBe(10000);
    expect(r.potentialMrrCents).toBe(10000);
    expect(r.activeSubscriptions).toBe(1);
  });

  it('trials count toward potential but not billable MRR', () => {
    const r = computeSnapshot({
      communities: [makeCommunity({ id: 1, subscriptionStatus: 'trialing' })],
      prices: PRICES,
      billingGroups: [],
      accessPlans: [],
    });
    expect(r.mrrCents).toBe(0);
    expect(r.potentialMrrCents).toBe(10000);
    expect(r.trialingSubscriptions).toBe(1);
  });

  it('past_due counts toward billable MRR', () => {
    const r = computeSnapshot({
      communities: [makeCommunity({ id: 1, subscriptionStatus: 'past_due' })],
      prices: PRICES,
      billingGroups: [],
      accessPlans: [],
    });
    expect(r.mrrCents).toBe(10000);
    expect(r.pastDueSubscriptions).toBe(1);
  });

  it('churned statuses are excluded from all MRR buckets', () => {
    for (const status of ['canceled', 'expired', 'unpaid', 'incomplete_expired']) {
      const r = computeSnapshot({
        communities: [makeCommunity({ id: 1, subscriptionStatus: status })],
        prices: PRICES,
        billingGroups: [],
        accessPlans: [],
      });
      expect(r.mrrCents).toBe(0);
      expect(r.potentialMrrCents).toBe(0);
    }
  });

  it('throws loud error on unknown status', () => {
    expect(() =>
      computeSnapshot({
        communities: [makeCommunity({ subscriptionStatus: 'paused' })],
        prices: PRICES,
        billingGroups: [],
        accessPlans: [],
      }),
    ).toThrow(/Unknown subscription_status/);
  });

  it('demo and soft-deleted communities are excluded', () => {
    const r = computeSnapshot({
      communities: [
        makeCommunity({ id: 1, isDemo: true }),
        makeCommunity({ id: 2, deletedAt: new Date() }),
      ],
      prices: PRICES,
      billingGroups: [],
      accessPlans: [],
    });
    expect(r.mrrCents).toBe(0);
    expect(r.activeSubscriptions).toBe(0);
  });

  it('missing stripe_prices row skips community, does not crash', () => {
    const r = computeSnapshot({
      communities: [makeCommunity({ id: 1, subscriptionPlan: 'plan_999' })],
      prices: PRICES,
      billingGroups: [],
      accessPlans: [],
    });
    expect(r.mrrCents).toBe(0);
    expect(r.communitiesSkipped).toBe(1);
    expect(r.skipReasons[0].reason).toContain('no_price_for_plan_999');
  });
});

describe('computeSnapshot — volume discounts', () => {
  it('applies tier_10 discount and records savings', () => {
    const r = computeSnapshot({
      communities: [makeCommunity({ id: 1, billingGroupId: 1 })],
      prices: PRICES,
      billingGroups: [{ id: 1, volumeTier: 'tier_10', activeCommunityCount: 10 }],
      accessPlans: [],
    });
    // 10000 * 10% = 1000 discount => charged 9000
    expect(r.mrrCents).toBe(9000);
    expect(r.volumeDiscountSavingsCents).toBe(1000);
  });
});

describe('computeSnapshot — invariants (property-based)', () => {
  const communityArb = fc.record({
    id: fc.integer({ min: 1, max: 1000000 }),
    subscriptionStatus: fc.constantFrom(
      'active',
      'trialing',
      'past_due',
      'canceled',
      'expired',
      'unpaid',
      'incomplete_expired',
    ),
    subscriptionPlan: fc.constantFrom('plan_1', 'plan_2'),
    communityType: fc.constantFrom('condo_718', 'hoa_720'),
    billingGroupId: fc.constantFrom(null, 1),
    deletedAt: fc.constant(null),
    isDemo: fc.boolean(),
  });

  it('sum of by_plan.mrrCents equals mrr_cents', () => {
    fc.assert(
      fc.property(fc.array(communityArb, { maxLength: 100 }), (communities) => {
        const r = computeSnapshot({
          communities,
          prices: PRICES,
          billingGroups: [{ id: 1, volumeTier: 'none', activeCommunityCount: 0 }],
          accessPlans: [],
        });
        const sumByPlan = Object.values(r.byPlan).reduce((s, v) => s + v.mrrCents, 0);
        expect(sumByPlan).toBe(r.mrrCents);
      }),
    );
  });

  it('potential_mrr >= mrr_cents always', () => {
    fc.assert(
      fc.property(fc.array(communityArb, { maxLength: 100 }), (communities) => {
        const r = computeSnapshot({
          communities,
          prices: PRICES,
          billingGroups: [],
          accessPlans: [],
        });
        expect(r.potentialMrrCents).toBeGreaterThanOrEqual(r.mrrCents);
      }),
    );
  });

  it('mrr_cents is never negative', () => {
    fc.assert(
      fc.property(fc.array(communityArb, { maxLength: 100 }), (communities) => {
        const r = computeSnapshot({
          communities,
          prices: PRICES,
          billingGroups: [],
          accessPlans: [],
        });
        expect(r.mrrCents).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it('active + trialing + past_due counts match status distribution', () => {
    fc.assert(
      fc.property(fc.array(communityArb, { maxLength: 100 }), (communities) => {
        const r = computeSnapshot({
          communities,
          prices: PRICES,
          billingGroups: [],
          accessPlans: [],
        });
        const live = communities.filter((c) => !c.isDemo && !c.deletedAt);
        const a = live.filter((c) => c.subscriptionStatus === 'active').length;
        const t = live.filter((c) => c.subscriptionStatus === 'trialing').length;
        const p = live.filter((c) => c.subscriptionStatus === 'past_due').length;
        expect(r.activeSubscriptions).toBe(a);
        expect(r.trialingSubscriptions).toBe(t);
        expect(r.pastDueSubscriptions).toBe(p);
      }),
    );
  });
});

describe('hashPrices', () => {
  it('produces the same hash for re-ordered input', () => {
    const reordered = [...PRICES].reverse();
    expect(hashPrices(PRICES)).toBe(hashPrices(reordered));
  });

  it('produces a different hash when an amount changes', () => {
    const h1 = hashPrices(PRICES);
    const h2 = hashPrices([{ ...PRICES[0], unitAmountCents: 99999 }, ...PRICES.slice(1)]);
    expect(h1).not.toBe(h2);
  });
});

describe('runSanityChecks', () => {
  const base = {
    mrrCents: 0,
    potentialMrrCents: 0,
    activeSubscriptions: 0,
    trialingSubscriptions: 0,
    pastDueSubscriptions: 0,
    byPlan: {},
    byCommunityType: {},
    volumeDiscountSavingsCents: 0,
    freeAccessCostCents: 0,
    pricesVersion: 'abc',
    communitiesSkipped: 0,
    skipReasons: [],
  };

  it('passes when mrr is 0 and no prior', () => {
    const r = runSanityChecks({ computed: base, priorMrrCents: null });
    expect(r.ok).toBe(true);
  });

  it('fails when mrr is negative', () => {
    const r = runSanityChecks({ computed: { ...base, mrrCents: -1 }, priorMrrCents: null });
    expect(r.ok).toBe(false);
    expect(r.reasons[0]).toMatch(/negative/);
  });

  it('fails when mrr > 10x prior', () => {
    const r = runSanityChecks({
      computed: { ...base, mrrCents: 100001, potentialMrrCents: 100001 },
      priorMrrCents: 10000,
    });
    expect(r.ok).toBe(false);
    expect(r.reasons[0]).toMatch(/10x/);
  });

  it('fails when potential < mrr (impossible state)', () => {
    const r = runSanityChecks({
      computed: { ...base, mrrCents: 500, potentialMrrCents: 100 },
      priorMrrCents: null,
    });
    expect(r.ok).toBe(false);
    expect(r.reasons[0]).toMatch(/potential_mrr_cents.*<.*mrr_cents/);
  });
});

describe('computeMrrDeltaPct', () => {
  it('returns null when prior is null or zero', () => {
    expect(computeMrrDeltaPct(1000, null)).toBeNull();
    expect(computeMrrDeltaPct(1000, 0)).toBeNull();
  });

  it('computes positive delta', () => {
    expect(computeMrrDeltaPct(1100, 1000)).toBe(10);
  });

  it('computes negative delta', () => {
    expect(computeMrrDeltaPct(900, 1000)).toBe(-10);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @propertypro/web test revenue-snapshot-service`
Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/__tests__/services/revenue-snapshot-service.test.ts apps/web/package.json pnpm-lock.yaml
git commit -m "test(web): invariants + property-based tests for revenue snapshot service"
```

---

### Task 11: Snapshot cron route

**Files:**
- Create: `apps/web/src/app/api/v1/internal/revenue-snapshot/route.ts`

- [ ] **Step 1: Add env var**

Add to `.env.local`:
```
REVENUE_SNAPSHOT_CRON_SECRET=dev-snapshot-secret
```

Also add to `.env.example`:
```
REVENUE_SNAPSHOT_CRON_SECRET=
```

- [ ] **Step 2: Write the cron handler**

Create `apps/web/src/app/api/v1/internal/revenue-snapshot/route.ts`:

```ts
/**
 * POST /api/v1/internal/revenue-snapshot
 *
 * Daily cron job — computes MRR snapshot, reconciles against Stripe API,
 * runs sanity checks, and appends one row to revenue_snapshots.
 *
 * Auth: Bearer token matching REVENUE_SNAPSHOT_CRON_SECRET.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { captureMessage } from '@sentry/nextjs';
import { desc, eq, inArray, isNull, gt, sql, and } from '@propertypro/db/filters';
import {
  accessPlans,
  billingGroups,
  communities,
  revenueSnapshots,
  stripePrices,
} from '@propertypro/db';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { requireCronSecret } from '@/lib/api/cron-auth';
import { getStripeClient } from '@/lib/services/stripe-service';
import {
  computeSnapshot,
  computeMrrDeltaPct,
  runSanityChecks,
  type CommunityRow,
  type PriceRow,
  type BillingGroupRow,
  type AccessPlanRow,
} from '@/lib/services/revenue-snapshot-service';

// DO NOT use withErrorHandler — we want explicit control over responses here.
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    requireCronSecret(req, process.env.REVENUE_SNAPSHOT_CRON_SECRET);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createUnscopedClient();

  // Load inputs
  const allCommunities = await db
    .select({
      id: communities.id,
      subscriptionStatus: communities.subscriptionStatus,
      subscriptionPlan: communities.subscriptionPlan,
      communityType: communities.communityType,
      billingGroupId: communities.billingGroupId,
      deletedAt: communities.deletedAt,
      isDemo: communities.isDemo,
    })
    .from(communities);

  const prices = await db
    .select({
      planId: stripePrices.planId,
      communityType: stripePrices.communityType,
      billingInterval: stripePrices.billingInterval,
      unitAmountCents: stripePrices.unitAmountCents,
    })
    .from(stripePrices);

  const groups = await db
    .select({
      id: billingGroups.id,
      volumeTier: billingGroups.volumeTier,
      activeCommunityCount: billingGroups.activeCommunityCount,
    })
    .from(billingGroups)
    .where(isNull(billingGroups.deletedAt));

  const now = new Date();
  const activePlans = await db
    .select({ communityId: accessPlans.communityId })
    .from(accessPlans)
    .where(
      and(
        isNull(accessPlans.revokedAt),
        isNull(accessPlans.convertedAt),
        gt(accessPlans.graceEndsAt, now),
      ),
    );

  // Compute snapshot
  let computation;
  try {
    computation = computeSnapshot({
      communities: allCommunities as CommunityRow[],
      prices: prices as PriceRow[],
      billingGroups: groups as BillingGroupRow[],
      accessPlans: activePlans as AccessPlanRow[],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    captureMessage('revenue_snapshot_compute_error', {
      level: 'error',
      extra: { message },
    });
    return NextResponse.json({ error: 'compute_error', message }, { status: 500 });
  }

  // Fetch latest prior snapshot for delta + sanity check
  const [prior] = await db
    .select({ mrrCents: revenueSnapshots.mrrCents })
    .from(revenueSnapshots)
    .orderBy(desc(revenueSnapshots.snapshotDate), desc(revenueSnapshots.computedAt))
    .limit(1);

  const priorMrr = prior?.mrrCents ?? null;

  // Sanity checks
  const check = runSanityChecks({ computed: computation, priorMrrCents: priorMrr });
  if (!check.ok) {
    captureMessage('revenue_snapshot_sanity_check_failed', {
      level: 'error',
      extra: { reasons: check.reasons, mrrCents: computation.mrrCents, priorMrr },
    });
    return NextResponse.json({ error: 'sanity_check_failed', reasons: check.reasons }, { status: 500 });
  }

  // Reconciliation against Stripe
  let reconciliationDriftPct: number | null = null;
  try {
    const stripe = getStripeClient();
    const activeSubs = await stripe.subscriptions.list({ status: 'active', limit: 100 });
    const stripeActiveCount = activeSubs.data.length;
    const dbActiveCount = computation.activeSubscriptions;
    if (dbActiveCount > 0) {
      reconciliationDriftPct =
        Math.round(
          (Math.abs(stripeActiveCount - dbActiveCount) / dbActiveCount) * 10000,
        ) / 100;
    }
  } catch (err) {
    captureMessage('revenue_snapshot_reconciliation_failed', {
      level: 'warning',
      extra: { error: err instanceof Error ? err.message : String(err) },
    });
    // Do not fail the snapshot — proceed with null drift.
  }

  const deltaPct = computeMrrDeltaPct(computation.mrrCents, priorMrr);

  // Insert the snapshot (append-only)
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  await db.insert(revenueSnapshots).values({
    snapshotDate: today,
    mrrCents: computation.mrrCents,
    potentialMrrCents: computation.potentialMrrCents,
    activeSubscriptions: computation.activeSubscriptions,
    trialingSubscriptions: computation.trialingSubscriptions,
    pastDueSubscriptions: computation.pastDueSubscriptions,
    byPlan: computation.byPlan,
    byCommunityType: computation.byCommunityType,
    volumeDiscountSavingsCents: computation.volumeDiscountSavingsCents,
    freeAccessCostCents: computation.freeAccessCostCents,
    pricesVersion: computation.pricesVersion,
    reconciliationDriftPct: reconciliationDriftPct?.toString() ?? null,
    communitiesSkipped: computation.communitiesSkipped,
    mrrDeltaPct: deltaPct?.toString() ?? null,
  });

  // Structured log for observability
  captureMessage('revenue_snapshot', {
    level: 'info',
    extra: {
      event: 'revenue_snapshot',
      mrr_cents: computation.mrrCents,
      potential_mrr_cents: computation.potentialMrrCents,
      active: computation.activeSubscriptions,
      trialing: computation.trialingSubscriptions,
      past_due: computation.pastDueSubscriptions,
      drift_pct: reconciliationDriftPct,
      delta_pct: deltaPct,
      communities_skipped: computation.communitiesSkipped,
      prices_version: computation.pricesVersion,
    },
  });

  // Drift warnings
  if (reconciliationDriftPct !== null && reconciliationDriftPct > 5) {
    captureMessage('revenue_snapshot_drift_high', {
      level: 'warning',
      extra: { drift_pct: reconciliationDriftPct },
    });
  }
  if (deltaPct !== null && Math.abs(deltaPct) > 20) {
    captureMessage('revenue_snapshot_delta_high', {
      level: 'warning',
      extra: { delta_pct: deltaPct, mrr_cents: computation.mrrCents, prior_mrr_cents: priorMrr },
    });
  }

  return NextResponse.json({
    snapshot_date: today,
    mrr_cents: computation.mrrCents,
    potential_mrr_cents: computation.potentialMrrCents,
    active: computation.activeSubscriptions,
    trialing: computation.trialingSubscriptions,
    past_due: computation.pastDueSubscriptions,
    drift_pct: reconciliationDriftPct,
    delta_pct: deltaPct,
    communities_skipped: computation.communitiesSkipped,
  });
}
```

- [ ] **Step 3: Test with curl**

Run dev server: `scripts/with-env-local.sh pnpm dev` in another shell.

Run: `curl -X POST http://localhost:3000/api/v1/internal/revenue-snapshot -H "Authorization: Bearer dev-snapshot-secret"`
Expected: JSON response with `snapshot_date` and metrics fields. No 500.

Run: `curl -X POST http://localhost:3000/api/v1/internal/revenue-snapshot -H "Authorization: Bearer wrong"`
Expected: `{"error":"Unauthorized"}` with status 401.

Verify row was inserted:
Run: `scripts/with-env-local.sh pnpm --filter @propertypro/db exec tsx -e "import {createUnscopedClient} from './src/unsafe'; import {sql} from 'drizzle-orm'; const db=createUnscopedClient(); const r=await db.execute(sql\`SELECT snapshot_date, mrr_cents, active_subscriptions FROM revenue_snapshots ORDER BY computed_at DESC LIMIT 1\`); console.log(r.rows); process.exit(0);"`
Expected: one row with today's date.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/v1/internal/revenue-snapshot/route.ts .env.example
git commit -m "feat(web): daily revenue-snapshot cron handler with sanity checks and reconciliation"
```

---

### Task 12: Health endpoint

**Files:**
- Create: `apps/web/src/app/api/v1/internal/revenue-snapshot/health/route.ts`

- [ ] **Step 1: Write the handler**

Create `apps/web/src/app/api/v1/internal/revenue-snapshot/health/route.ts`:

```ts
/**
 * GET /api/v1/internal/revenue-snapshot/health
 *
 * Returns 200 if the latest revenue_snapshots row was written within 26 hours.
 * Returns 503 otherwise — wired into external uptime monitor.
 *
 * No auth — health probes must be reachable by monitors.
 */
import { NextResponse } from 'next/server';
import { desc } from '@propertypro/db/filters';
import { revenueSnapshots } from '@propertypro/db';
import { createUnscopedClient } from '@propertypro/db/unsafe';

const STALE_THRESHOLD_MS = 26 * 60 * 60 * 1000;

export async function GET() {
  const db = createUnscopedClient();
  const [latest] = await db
    .select({ computedAt: revenueSnapshots.computedAt })
    .from(revenueSnapshots)
    .orderBy(desc(revenueSnapshots.computedAt))
    .limit(1);

  if (!latest) {
    return NextResponse.json(
      { status: 'unhealthy', reason: 'no_snapshots_ever' },
      { status: 503 },
    );
  }

  const msSince = Date.now() - new Date(latest.computedAt).getTime();
  const hoursSince = msSince / (60 * 60 * 1000);

  if (msSince > STALE_THRESHOLD_MS) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        last_snapshot_at: latest.computedAt,
        hours_since: Math.round(hoursSince * 10) / 10,
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    status: 'healthy',
    last_snapshot_at: latest.computedAt,
    hours_since: Math.round(hoursSince * 10) / 10,
  });
}
```

- [ ] **Step 2: Test**

Run: `curl http://localhost:3000/api/v1/internal/revenue-snapshot/health`
Expected: `{"status":"healthy","last_snapshot_at":"...","hours_since":0.0}` (assumes Task 11 wrote a snapshot).

Simulate staleness:
Run: `scripts/with-env-local.sh pnpm --filter @propertypro/db exec tsx -e "import {createUnscopedClient} from './src/unsafe'; import {sql} from 'drizzle-orm'; const db=createUnscopedClient(); await db.execute(sql\`UPDATE revenue_snapshots SET computed_at = now() - interval '30 hours'\`); process.exit(0);"`

Run: `curl -i http://localhost:3000/api/v1/internal/revenue-snapshot/health`
Expected: HTTP/1.1 503 with `{"status":"unhealthy",...}`.

Restore:
Run: `scripts/with-env-local.sh pnpm --filter @propertypro/db exec tsx -e "import {createUnscopedClient} from './src/unsafe'; import {sql} from 'drizzle-orm'; const db=createUnscopedClient(); await db.execute(sql\`UPDATE revenue_snapshots SET computed_at = now()\`); process.exit(0);"`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/v1/internal/revenue-snapshot/health/route.ts
git commit -m "feat(web): revenue-snapshot health endpoint"
```

---

### Task 13: Chaos integration tests

**Files:**
- Create: `apps/web/__tests__/api/revenue-snapshot-chaos.test.ts`

- [ ] **Step 1: Write chaos tests**

These tests run against the in-memory pure service (not the DB). They verify the scenarios called out in the spec's Layer 2 table.

Create `apps/web/__tests__/api/revenue-snapshot-chaos.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  computeSnapshot,
  runSanityChecks,
  computeMrrDeltaPct,
  type CommunityRow,
  type PriceRow,
} from '@/lib/services/revenue-snapshot-service';

const PRICES: PriceRow[] = [
  { planId: 'plan_1', communityType: 'condo_718', billingInterval: 'month', unitAmountCents: 10000 },
];

function mk(over: Partial<CommunityRow>): CommunityRow {
  return {
    id: 1,
    subscriptionStatus: 'active',
    subscriptionPlan: 'plan_1',
    communityType: 'condo_718',
    billingGroupId: null,
    deletedAt: null,
    isDemo: false,
    ...over,
  };
}

describe('chaos: missing stripe_prices row', () => {
  it('skips community with plan_999, snapshot still completes', () => {
    const r = computeSnapshot({
      communities: [mk({ subscriptionPlan: 'plan_999' }), mk({ id: 2 })],
      prices: PRICES,
      billingGroups: [],
      accessPlans: [],
    });
    expect(r.communitiesSkipped).toBe(1);
    expect(r.mrrCents).toBe(10000); // second community still counted
    expect(r.skipReasons.some((s) => s.communityId === 1)).toBe(true);
  });
});

describe('chaos: unknown subscription_status', () => {
  it('throws loudly (silent skip is wrong)', () => {
    expect(() =>
      computeSnapshot({
        communities: [mk({ subscriptionStatus: 'paused' })],
        prices: PRICES,
        billingGroups: [],
        accessPlans: [],
      }),
    ).toThrow(/Unknown subscription_status/);
  });
});

describe('chaos: deleted community with active status', () => {
  it('excludes from MRR (invariant: deleted_at implies not counted)', () => {
    const r = computeSnapshot({
      communities: [mk({ id: 1, deletedAt: new Date() }), mk({ id: 2 })],
      prices: PRICES,
      billingGroups: [],
      accessPlans: [],
    });
    expect(r.mrrCents).toBe(10000); // only community 2
  });
});

describe('chaos: MRR drop > 20%', () => {
  it('passes sanity check but computes large negative delta_pct', () => {
    const delta = computeMrrDeltaPct(7000, 10000);
    expect(delta).toBe(-30);
    // Sanity check passes; the caller is expected to log a warning at |delta| > 20
  });
});

describe('chaos: MRR 10x jump', () => {
  it('sanity check rejects it', () => {
    const r = runSanityChecks({
      computed: {
        mrrCents: 100_001,
        potentialMrrCents: 100_001,
        activeSubscriptions: 0,
        trialingSubscriptions: 0,
        pastDueSubscriptions: 0,
        byPlan: {},
        byCommunityType: {},
        volumeDiscountSavingsCents: 0,
        freeAccessCostCents: 0,
        pricesVersion: 'x',
        communitiesSkipped: 0,
        skipReasons: [],
      },
      priorMrrCents: 10_000,
    });
    expect(r.ok).toBe(false);
  });
});

describe('chaos: all churned statuses', () => {
  it('none contribute to MRR or counters', () => {
    for (const status of ['canceled', 'expired', 'unpaid', 'incomplete_expired']) {
      const r = computeSnapshot({
        communities: [mk({ subscriptionStatus: status })],
        prices: PRICES,
        billingGroups: [],
        accessPlans: [],
      });
      expect(r.mrrCents).toBe(0);
      expect(r.potentialMrrCents).toBe(0);
      expect(r.activeSubscriptions).toBe(0);
      expect(r.trialingSubscriptions).toBe(0);
      expect(r.pastDueSubscriptions).toBe(0);
    }
  });
});

describe('chaos: null/empty subscription_plan', () => {
  it('community is skipped, snapshot continues', () => {
    const r = computeSnapshot({
      communities: [mk({ subscriptionPlan: null }), mk({ id: 2 })],
      prices: PRICES,
      billingGroups: [],
      accessPlans: [],
    });
    expect(r.communitiesSkipped).toBe(1);
    expect(r.mrrCents).toBe(10000);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm --filter @propertypro/web test revenue-snapshot-chaos`
Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/__tests__/api/revenue-snapshot-chaos.test.ts
git commit -m "test(web): chaos scenarios for revenue snapshot"
```

---

### Task 14: Handle `price.updated` Stripe webhook

**Files:**
- Modify: `apps/web/src/app/api/v1/webhooks/stripe/route.ts`

- [ ] **Step 1: Find the event dispatch switch**

Run: `grep -n "case '" apps/web/src/app/api/v1/webhooks/stripe/route.ts | head -20`
Expected: lines showing existing case statements like `case 'checkout.session.completed':` etc. Note the line number of the switch or the last case.

- [ ] **Step 2: Add the price.updated case**

In `apps/web/src/app/api/v1/webhooks/stripe/route.ts`, locate the switch block where event types are dispatched. Add a new case. Before the `default:` (or at the end of the switch):

```ts
      case 'price.updated': {
        const price = event.data.object as Stripe.Price;
        if (price.unit_amount !== null) {
          await db
            .update(stripePrices)
            .set({ unitAmountCents: price.unit_amount, updatedAt: new Date() })
            .where(eq(stripePrices.stripePriceId, price.id));
        }
        break;
      }
```

Make sure `stripePrices` is imported from `@propertypro/db` (add to existing import if not there) and `eq` is imported from `@propertypro/db/filters`.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Smoke test via Stripe CLI (if available)**

If Stripe CLI is installed locally:
Run: `stripe trigger price.updated` (in another shell while dev server is running)
Expected: webhook fires, log shows `price.updated` handled.

If no CLI, skip this step — integration test will verify in staging.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/v1/webhooks/stripe/route.ts
git commit -m "feat(webhooks): sync stripe_prices.unit_amount_cents on price.updated"
```

---

### Task 15: Vercel cron config

**Files:**
- Modify: `apps/web/vercel.json`

- [ ] **Step 1: Add the cron entry**

Open `apps/web/vercel.json`. Find the `crons` array. Add a new entry:

```json
{ "path": "/api/v1/internal/revenue-snapshot", "schedule": "0 2 * * *" }
```

Preserve JSON formatting and comma-separate from the neighboring entry.

- [ ] **Step 2: Verify JSON is valid**

Run: `python3 -m json.tool apps/web/vercel.json > /dev/null && echo OK`
Expected: `OK`.

- [ ] **Step 3: Document env var**

Add the new secret to the deployment checklist in the runbook (Task 18).

- [ ] **Step 4: Commit**

```bash
git add apps/web/vercel.json
git commit -m "feat(cron): schedule revenue-snapshot daily at 02:00 UTC"
```

---

### Task 16: Cancel route — capture reason + note

**Files:**
- Modify: `apps/web/src/app/api/v1/communities/[id]/cancel/route.ts`

- [ ] **Step 1: Write a failing route test**

Create `apps/web/__tests__/api/cancel-route-reason.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { cancellationReasonSchema } from '@propertypro/shared/constants/cancellation-reasons';

describe('cancellation reason validation', () => {
  it('rejects unknown reason', () => {
    expect(cancellationReasonSchema.safeParse('bogus').success).toBe(false);
  });
  it('accepts known reasons', () => {
    expect(cancellationReasonSchema.safeParse('price').success).toBe(true);
  });
});
```

This is a light guard for the contract; full route integration is covered by integration test suites.

- [ ] **Step 2: Run test**

Run: `pnpm --filter @propertypro/web test cancel-route-reason`
Expected: PASS.

- [ ] **Step 3: Modify the cancel route**

Open `apps/web/src/app/api/v1/communities/[id]/cancel/route.ts`. Change the handler signature and add body parsing.

Replace:
```ts
export const POST = withErrorHandler(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
```

with:
```ts
import { z } from 'zod';
import { cancellationReasonSchema } from '@propertypro/shared/constants/cancellation-reasons';
import { ValidationError } from '@/lib/api/errors';

const cancelBodySchema = z.object({
  reason: cancellationReasonSchema,
  note: z.string().max(2000).optional(),
});

export const POST = withErrorHandler(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new ValidationError('Invalid JSON body');
    }
    const parsed = cancelBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Invalid request body', parsed.error.issues);
    }
    const { reason, note } = parsed.data;
```

(Adjust the `ValidationError` import path if the codebase uses a different error class — grep for existing usage: `grep -rn "ValidationError" apps/web/src/lib/api/errors/`.)

Then find the line:
```ts
    await db
      .update(communities)
      .set({ deletedAt: new Date() })
      .where(eq(communities.id, communityId));
```

Replace `.set(...)` with:
```ts
      .set({
        deletedAt: new Date(),
        cancellationReason: reason,
        cancellationNote: note ?? null,
        cancellationCapturedAt: new Date(),
      })
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

If you hit an import error on `@propertypro/shared/constants/cancellation-reasons`, check the shared package's `exports` field in `packages/shared/package.json` — it may need a subpath export added. If so, add:

```json
"./constants/cancellation-reasons": {
  "types": "./dist/constants/cancellation-reasons.d.ts",
  "default": "./dist/constants/cancellation-reasons.js"
}
```

And rebuild shared: `pnpm --filter @propertypro/shared build`.

- [ ] **Step 5: Manual smoke test**

With dev server running, hit the cancel endpoint via authenticated session (use agent-login). Confirm it rejects missing `reason`.

Alternative: Skip manual test here — integration test in staging covers it.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/v1/communities/[id]/cancel/route.ts apps/web/__tests__/api/cancel-route-reason.test.ts packages/shared/package.json packages/shared/dist
git commit -m "feat(cancel): capture cancellation reason and note at API boundary"
```

---

### Task 17: Seed-today backfill script

**Files:**
- Create: `scripts/seed-revenue-snapshot-today.ts`

- [ ] **Step 1: Write the script**

Create `scripts/seed-revenue-snapshot-today.ts`:

```ts
/**
 * Post-deploy one-shot: write a single revenue_snapshots row for today.
 *
 * Calls the same cron handler in-process. Safe to run multiple times — each
 * invocation appends a new row (append-only table).
 *
 * Usage: scripts/with-env-local.sh pnpm tsx scripts/seed-revenue-snapshot-today.ts
 */
const PORT = process.env.PORT ?? '3000';
const SECRET = process.env.REVENUE_SNAPSHOT_CRON_SECRET;

async function main() {
  if (!SECRET) {
    console.error('REVENUE_SNAPSHOT_CRON_SECRET not set');
    process.exit(1);
  }
  const res = await fetch(`http://localhost:${PORT}/api/v1/internal/revenue-snapshot`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SECRET}` },
  });
  if (!res.ok) {
    console.error('Snapshot failed:', res.status, await res.text());
    process.exit(1);
  }
  const body = await res.json();
  console.log('Snapshot written:', body);
}

main();
```

- [ ] **Step 2: Test locally**

Dev server must be running.
Run: `scripts/with-env-local.sh pnpm tsx scripts/seed-revenue-snapshot-today.ts`
Expected: `Snapshot written: { snapshot_date: ..., mrr_cents: ... }`

- [ ] **Step 3: Commit**

```bash
git add scripts/seed-revenue-snapshot-today.ts
git commit -m "feat(scripts): seed-revenue-snapshot-today one-shot"
```

---

### Task 18: Revenue snapshot runbook

**Files:**
- Create: `docs/runbooks/revenue-snapshot-recovery.md`

- [ ] **Step 1: Write the runbook**

Create `docs/runbooks/revenue-snapshot-recovery.md`:

```markdown
# Revenue Snapshot — Runbook

## Overview

The revenue-snapshot cron fires daily at 02:00 UTC (`apps/web/vercel.json`).
It computes MRR from `communities` + `stripe_prices` + `billing_groups`, reconciles
against the Stripe API, runs sanity checks, and **appends** one row to
`revenue_snapshots`.

This table is append-only. Multiple rows per day are allowed. Queries use
`DISTINCT ON (snapshot_date) ... ORDER BY computed_at DESC` to read the latest.

## Deployment checklist

Before the first cron run after deploy:
1. Set `REVENUE_SNAPSHOT_CRON_SECRET` in Vercel project env (prod + preview).
2. Confirm `/api/v1/internal/revenue-snapshot/health` returns 503 (expected — no rows yet).
3. Run the seed script to write Day 0:
   `scripts/with-env-local.sh pnpm tsx scripts/seed-revenue-snapshot-today.ts`
4. Confirm `/health` now returns 200.

## Manual trigger

```bash
curl -X POST https://<host>/api/v1/internal/revenue-snapshot \
  -H "Authorization: Bearer $REVENUE_SNAPSHOT_CRON_SECRET"
```

Returns JSON with `snapshot_date`, `mrr_cents`, `drift_pct`, `delta_pct`.

## Correcting a bad snapshot

**Do not UPDATE or DELETE rows.** The table is append-only. If a snapshot is wrong:

1. Identify the bad row:
   `SELECT id, computed_at, mrr_cents FROM revenue_snapshots WHERE snapshot_date = 'YYYY-MM-DD' ORDER BY computed_at DESC;`
2. Fix the upstream data (e.g., correct the Stripe subscription status).
3. Run the cron manually. The new row will have a later `computed_at` and
   will be the one that queries return via `DISTINCT ON`.

## Job failure modes and responses

| Symptom | Meaning | Action |
|---|---|---|
| Health = 503, last snapshot > 26h old | Cron did not fire, or it failed | Check Vercel cron logs, manually trigger |
| Sentry: `revenue_snapshot_sanity_check_failed` | Computed MRR negative, <potential, or >10x prior | Investigate data: check for bad subscription_status writes |
| Sentry: `revenue_snapshot_drift_high` (drift_pct > 5) | Stripe active count != DB active count | Webhook processing lag — check stripe_webhook_events for delays |
| Sentry: `revenue_snapshot_delta_high` (|delta| > 20%) | MRR jumped > 20% day-over-day | Verify via Stripe dashboard; may be legitimate |
| Sentry: `revenue_snapshot_compute_error` | Unknown subscription_status encountered | New Stripe status value; update `ALL_STATUSES` constant |
| Sentry: `revenue_snapshot_reconciliation_failed` | Stripe API call failed during reconciliation | Snapshot still wrote with null drift; not blocking |

## Backfilling historical data

We do **not** backfill historical MRR. Day 0 is the seed script above. For
historical revenue before Day 0, query Stripe directly (one-off script, not
automated).

## Testing the runbook (PR 1 merge gate)

On staging:
1. Manually POST to the cron endpoint with the secret, verify a row is written.
2. Simulate staleness:
   `UPDATE revenue_snapshots SET computed_at = now() - interval '30 hours';`
   Verify `/health` returns 503.
3. Manually trigger a new snapshot, verify `/health` returns 200.

All three steps pass = runbook accepted. Record results in the PR description.
```

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/revenue-snapshot-recovery.md
git commit -m "docs: revenue-snapshot runbook with recovery procedures"
```

---

### Task 19: End-to-end verification

- [ ] **Step 1: Run full test suite**

Run: `pnpm test`
Expected: all tests PASS.

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: PASS (includes DB access guard).

- [ ] **Step 4: Verify full snapshot flow end-to-end**

Dev server running + local DB migrated.

1. Run: `scripts/with-env-local.sh pnpm tsx scripts/seed-revenue-snapshot-today.ts`
   Expected: one row inserted.

2. Run: `curl http://localhost:3000/api/v1/internal/revenue-snapshot/health`
   Expected: 200 with `status: healthy`.

3. Run the cron again:
   `curl -X POST http://localhost:3000/api/v1/internal/revenue-snapshot -H "Authorization: Bearer dev-snapshot-secret"`
   Expected: 200 with snapshot body. A second row exists for today.

4. Verify latest query:
   `scripts/with-env-local.sh pnpm --filter @propertypro/db exec tsx -e "import {createUnscopedClient} from './src/unsafe'; import {sql} from 'drizzle-orm'; const db=createUnscopedClient(); const r=await db.execute(sql\`SELECT DISTINCT ON (snapshot_date) snapshot_date, mrr_cents, computed_at FROM revenue_snapshots ORDER BY snapshot_date DESC, computed_at DESC LIMIT 5\`); console.log(r.rows); process.exit(0);"`
   Expected: one row per snapshot_date, latest computed_at.

- [ ] **Step 5: Follow the runbook staging checklist manually**

Deploy to staging. Follow the "Testing the runbook" section of `docs/runbooks/revenue-snapshot-recovery.md`. Record the three-step verification in the PR description.

- [ ] **Step 6: Final commit (if any cleanup) and open PR**

```bash
git push origin <branch-name>
gh pr create --title "feat: admin metrics phase 1 — schema & revenue snapshot cron" --body "..."
```

PR body must include the runbook staging verification output.

---

## Summary

Phase 1 delivers:
- 5 migrations (0138, 0139, 0139a, 0140, 0141) + backfill scripts
- Pure-computation snapshot service with property-based tests
- Daily cron handler with sanity checks + Stripe reconciliation + Sentry observability
- Health endpoint for uptime monitoring
- Cancel-route reason capture at API boundary (no UI changes)
- Stripe webhook sync for `price.updated`
- Runbook with tested recovery procedures

**No UI changes in this phase.** Phases 2-4 (API endpoints, dashboard refresh, metrics pages) will be planned separately after Phase 1 ships and accrues a few days of snapshot data.
