# Billing Groups & Gated Add-Community Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plug the free-community add hole, introduce `billing_groups`, gate `POST /api/v1/pm/communities` behind Stripe checkout, apply volume discounts (10/15/20%) via Stripe `discounts[]` API, handle tier up/down recalculation with a downgrade confirmation UX and admin notifications.

**Architecture:** Adds one new entity (`billing_groups`) linked to `communities` via nullable FK. Reuses existing `pending_signups` → Stripe checkout → webhook → `provisioning_jobs` flow by adding a new `kind='add_to_group'` path. Volume discounts are applied per-subscription using Stripe's modern `discounts[]` array with metadata tagging (`origin: 'volume_discount'`) for safe identification and replacement.

**Tech Stack:** Next.js 15, TypeScript, Drizzle ORM, PostgreSQL (Supabase), Stripe SDK 20.3.1 (API `2026-01-28.clover`), Vitest, Zod, TanStack Query, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-04-04-multi-community-billing-and-ownership-design.md`

---

## File Structure

### Create

- `packages/db/migrations/0135_billing_groups.sql` — new tables + column
- `packages/db/src/schema/billing-groups.ts` — Drizzle schema
- `packages/db/src/queries/billing-groups.ts` — scoped read helpers
- `apps/web/src/lib/billing/tier-calculator.ts` — pure functions for tier math
- `apps/web/src/lib/billing/volume-discounts.ts` — Stripe discount orchestration
- `apps/web/src/lib/billing/billing-group-service.ts` — billing group CRUD
- `apps/web/src/lib/billing/pricing-preview.ts` — shared calc used by UI + API
- `apps/web/src/app/api/v1/billing-groups/[id]/preview/route.ts` — pricing preview endpoint
- `apps/web/src/app/api/v1/communities/[id]/cancel-preview/route.ts` — downgrade impact preview
- `apps/web/src/app/api/v1/internal/coupon-sync-retry/route.ts` — cron retry worker
- `apps/web/src/components/pm/add-community-modal.tsx` — form + pricing preview UI
- `apps/web/src/components/pm/cancel-community-dialog.tsx` — two-step confirm with impact breakdown
- `apps/web/__tests__/billing/tier-calculator.test.ts`
- `apps/web/__tests__/billing/volume-discounts.test.ts`
- `apps/web/__tests__/billing/billing-group-service.integration.test.ts`
- `apps/web/__tests__/api/pm-communities-gated.integration.test.ts`
- `scripts/seed-volume-coupons.ts` — creates 4 Stripe coupons (idempotent)

### Modify

- `packages/db/src/schema/communities.ts` — add `billing_group_id` column
- `packages/db/src/schema/index.ts` — export new schema
- `packages/db/migrations/meta/_journal.json` — add entry 135
- `apps/web/src/app/api/v1/pm/communities/route.ts` — gate POST behind Stripe checkout
- `apps/web/src/app/api/v1/webhooks/stripe/route.ts` — handle `kind='add_to_group'` metadata
- `apps/web/src/lib/services/stripe-service.ts` — add `createAddCommunityCheckout()` helper
- `apps/web/src/lib/services/provisioning-service.ts` — new step `billing_group_linked`
- `apps/web/src/app/(authenticated)/pm/dashboard/page.tsx` — wire up Add Community button

---

## Task 1: Database schema — billing_groups and community FK

**Files:**
- Create: `packages/db/migrations/0135_billing_groups.sql`
- Create: `packages/db/src/schema/billing-groups.ts`
- Modify: `packages/db/src/schema/communities.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/migrations/meta/_journal.json`

- [ ] **Step 1: Create migration SQL**

Create `packages/db/migrations/0135_billing_groups.sql`:

```sql
CREATE TABLE billing_groups (
  id                     bigserial PRIMARY KEY,
  name                   text NOT NULL,
  stripe_customer_id     text UNIQUE NOT NULL,
  owner_user_id          uuid NOT NULL REFERENCES users(id),
  volume_tier            text NOT NULL DEFAULT 'none'
                           CHECK (volume_tier IN ('none', 'tier_10', 'tier_15', 'tier_20')),
  active_community_count integer NOT NULL DEFAULT 0,
  coupon_sync_status     text NOT NULL DEFAULT 'synced'
                           CHECK (coupon_sync_status IN ('synced', 'pending', 'failed')),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  deleted_at             timestamptz
);

CREATE INDEX idx_billing_groups_owner ON billing_groups(owner_user_id);

ALTER TABLE communities ADD COLUMN billing_group_id bigint
  REFERENCES billing_groups(id) ON DELETE SET NULL;

CREATE INDEX idx_communities_billing_group ON communities(billing_group_id);

-- RLS: billing_groups are owner-scoped, not community-scoped
ALTER TABLE billing_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_groups FORCE ROW LEVEL SECURITY;

CREATE POLICY billing_groups_owner_read ON billing_groups
  FOR SELECT USING (owner_user_id = auth.uid());

-- Writes only via service role (server code)
CREATE POLICY billing_groups_service_write ON billing_groups
  FOR ALL USING (auth.role() = 'service_role');
```

- [ ] **Step 2: Add Drizzle schema**

Create `packages/db/src/schema/billing-groups.ts`:

```typescript
import {
  bigint,
  bigserial,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const billingGroups = pgTable(
  'billing_groups',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    name: text('name').notNull(),
    stripeCustomerId: text('stripe_customer_id').notNull().unique(),
    ownerUserId: uuid('owner_user_id').notNull(),
    volumeTier: text('volume_tier').notNull().default('none'),
    activeCommunityCount: integer('active_community_count').notNull().default(0),
    couponSyncStatus: text('coupon_sync_status').notNull().default('synced'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_billing_groups_owner').on(table.ownerUserId),
    check(
      'billing_groups_volume_tier_check',
      sql`${table.volumeTier} IN ('none', 'tier_10', 'tier_15', 'tier_20')`,
    ),
    check(
      'billing_groups_coupon_sync_status_check',
      sql`${table.couponSyncStatus} IN ('synced', 'pending', 'failed')`,
    ),
  ],
);

export type BillingGroup = typeof billingGroups.$inferSelect;
export type NewBillingGroup = typeof billingGroups.$inferInsert;
```

- [ ] **Step 3: Add billing_group_id to communities schema**

In `packages/db/src/schema/communities.ts`, add after existing Stripe fields:

```typescript
billingGroupId: bigint('billing_group_id', { mode: 'number' }).references(
  () => billingGroups.id,
  { onDelete: 'set null' },
),
```

Add import at top: `import { billingGroups } from './billing-groups';`

- [ ] **Step 4: Export from schema index**

In `packages/db/src/schema/index.ts`, add: `export * from './billing-groups';`

- [ ] **Step 5: Update migration journal**

Add entry to `packages/db/migrations/meta/_journal.json` entries array:

```json
{
  "idx": 135,
  "version": "7",
  "when": 1775550000000,
  "tag": "0135_billing_groups",
  "breakpoints": true
}
```

- [ ] **Step 6: Apply migration**

Run: `pnpm --filter @propertypro/db db:migrate`
Expected: "Migration 0135_billing_groups applied successfully"

- [ ] **Step 7: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no type errors)

- [ ] **Step 8: Commit**

```bash
git add packages/db/migrations/0135_billing_groups.sql \
  packages/db/src/schema/billing-groups.ts \
  packages/db/src/schema/communities.ts \
  packages/db/src/schema/index.ts \
  packages/db/migrations/meta/_journal.json
git commit -m "feat(db): add billing_groups table and community FK"
```

---

## Task 2: Tier calculator — pure functions (TDD)

**Files:**
- Create: `apps/web/__tests__/billing/tier-calculator.test.ts`
- Create: `apps/web/src/lib/billing/tier-calculator.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/web/__tests__/billing/tier-calculator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  determineTier,
  tierToCouponId,
  tierToPercentOff,
  type VolumeTier,
} from '@/lib/billing/tier-calculator';

describe('determineTier', () => {
  it.each([
    [0, 'none'],
    [1, 'none'],
    [2, 'none'],
    [3, 'tier_10'],
    [4, 'tier_10'],
    [5, 'tier_10'],
    [6, 'tier_15'],
    [7, 'tier_15'],
    [10, 'tier_15'],
    [11, 'tier_20'],
    [50, 'tier_20'],
  ])('count=%i returns tier %s', (count, expected) => {
    expect(determineTier(count)).toBe(expected);
  });
});

describe('tierToCouponId', () => {
  it.each([
    ['none', null],
    ['tier_10', 'volume_10pct'],
    ['tier_15', 'volume_15pct'],
    ['tier_20', 'volume_20pct'],
  ] as [VolumeTier, string | null][])('tier=%s returns %s', (tier, expected) => {
    expect(tierToCouponId(tier)).toBe(expected);
  });
});

describe('tierToPercentOff', () => {
  it('returns correct percentages', () => {
    expect(tierToPercentOff('none')).toBe(0);
    expect(tierToPercentOff('tier_10')).toBe(10);
    expect(tierToPercentOff('tier_15')).toBe(15);
    expect(tierToPercentOff('tier_20')).toBe(20);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter web test tier-calculator`
Expected: FAIL — module not found

- [ ] **Step 3: Implement tier-calculator.ts**

Create `apps/web/src/lib/billing/tier-calculator.ts`:

```typescript
export type VolumeTier = 'none' | 'tier_10' | 'tier_15' | 'tier_20';

export function determineTier(activeCommunityCount: number): VolumeTier {
  if (activeCommunityCount >= 11) return 'tier_20';
  if (activeCommunityCount >= 6) return 'tier_15';
  if (activeCommunityCount >= 3) return 'tier_10';
  return 'none';
}

export function tierToCouponId(tier: VolumeTier): string | null {
  switch (tier) {
    case 'tier_10': return 'volume_10pct';
    case 'tier_15': return 'volume_15pct';
    case 'tier_20': return 'volume_20pct';
    case 'none': return null;
  }
}

export function tierToPercentOff(tier: VolumeTier): number {
  switch (tier) {
    case 'tier_10': return 10;
    case 'tier_15': return 15;
    case 'tier_20': return 20;
    case 'none': return 0;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter web test tier-calculator`
Expected: PASS (all 18 cases)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/billing/tier-calculator.ts apps/web/__tests__/billing/tier-calculator.test.ts
git commit -m "feat(billing): add tier calculator pure functions"
```

---

## Task 3: Pricing preview calculator

**Files:**
- Create: `apps/web/__tests__/billing/pricing-preview.test.ts`
- Create: `apps/web/src/lib/billing/pricing-preview.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/web/__tests__/billing/pricing-preview.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { calculatePricingImpact } from '@/lib/billing/pricing-preview';

describe('calculatePricingImpact', () => {
  it('computes discounted price with no discount (1 community)', () => {
    const result = calculatePricingImpact({
      basePricesUsd: [349],
      currentGroupSize: 0,
      changeType: 'add',
    });
    expect(result.newTier).toBe('none');
    expect(result.previousTier).toBe('none');
    expect(result.perCommunityBreakdown).toEqual([
      { basePriceUsd: 349, discountedPriceUsd: 349, discountPercent: 0 },
    ]);
    expect(result.portfolioMonthlyDeltaUsd).toBe(0);
  });

  it('crosses from tier_none to tier_10 on 3rd add', () => {
    const result = calculatePricingImpact({
      basePricesUsd: [349, 349, 199], // existing + new one
      currentGroupSize: 2,
      changeType: 'add',
    });
    expect(result.previousTier).toBe('none');
    expect(result.newTier).toBe('tier_10');
    // All three get 10% off
    expect(result.perCommunityBreakdown[0].discountedPriceUsd).toBeCloseTo(314.10);
    expect(result.perCommunityBreakdown[1].discountedPriceUsd).toBeCloseTo(314.10);
    expect(result.perCommunityBreakdown[2].discountedPriceUsd).toBeCloseTo(179.10);
  });

  it('computes downgrade impact when removing drops 6→5', () => {
    const result = calculatePricingImpact({
      basePricesUsd: [349, 349, 349, 349, 349], // 5 remaining after removal
      currentGroupSize: 6,
      changeType: 'remove',
    });
    expect(result.previousTier).toBe('tier_15');
    expect(result.newTier).toBe('tier_10');
    // Each community price goes up from $296.65 (15% off) to $314.10 (10% off) = +$17.45
    expect(result.portfolioMonthlyDeltaUsd).toBeCloseTo(5 * 17.45, 1);
  });

  it('no tier change returns zero delta', () => {
    const result = calculatePricingImpact({
      basePricesUsd: [349, 349, 349, 349], // 4 remain
      currentGroupSize: 5,
      changeType: 'remove',
    });
    expect(result.previousTier).toBe('tier_10');
    expect(result.newTier).toBe('tier_10');
    expect(result.portfolioMonthlyDeltaUsd).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter web test pricing-preview`
Expected: FAIL — module not found

- [ ] **Step 3: Implement pricing-preview.ts**

Create `apps/web/src/lib/billing/pricing-preview.ts`:

```typescript
import { determineTier, tierToPercentOff, type VolumeTier } from './tier-calculator';

export interface PricingImpactInput {
  basePricesUsd: number[];
  currentGroupSize: number;
  changeType: 'add' | 'remove';
}

export interface CommunityPriceBreakdown {
  basePriceUsd: number;
  discountedPriceUsd: number;
  discountPercent: number;
}

export interface PricingImpactResult {
  previousTier: VolumeTier;
  newTier: VolumeTier;
  perCommunityBreakdown: CommunityPriceBreakdown[];
  portfolioMonthlyDeltaUsd: number;
}

export function calculatePricingImpact(input: PricingImpactInput): PricingImpactResult {
  const newGroupSize = input.basePricesUsd.length;
  const previousTier = determineTier(input.currentGroupSize);
  const newTier = determineTier(newGroupSize);

  const prevPct = tierToPercentOff(previousTier);
  const newPct = tierToPercentOff(newTier);

  const perCommunityBreakdown: CommunityPriceBreakdown[] = input.basePricesUsd.map((base) => ({
    basePriceUsd: base,
    discountedPriceUsd: roundCents(base * (1 - newPct / 100)),
    discountPercent: newPct,
  }));

  // Delta = (new monthly total with newPct) - (previous monthly total with prevPct on same set)
  const newTotal = input.basePricesUsd.reduce(
    (sum, b) => sum + b * (1 - newPct / 100),
    0,
  );
  const prevTotal = input.basePricesUsd.reduce(
    (sum, b) => sum + b * (1 - prevPct / 100),
    0,
  );
  const portfolioMonthlyDeltaUsd = roundCents(newTotal - prevTotal);

  return {
    previousTier,
    newTier,
    perCommunityBreakdown,
    portfolioMonthlyDeltaUsd,
  };
}

function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter web test pricing-preview`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/billing/pricing-preview.ts apps/web/__tests__/billing/pricing-preview.test.ts
git commit -m "feat(billing): add pricing impact calculator"
```

---

## Task 4: Seed Stripe volume coupons

**Files:**
- Create: `scripts/seed-volume-coupons.ts`

- [ ] **Step 1: Create seed script**

Create `scripts/seed-volume-coupons.ts`:

```typescript
#!/usr/bin/env tsx
/**
 * Seeds four volume-discount Stripe Coupons. Idempotent.
 * Run with: pnpm tsx scripts/seed-volume-coupons.ts
 */
import Stripe from 'stripe';

const VOLUME_COUPONS = [
  { id: 'volume_10pct', percent_off: 10 },
  { id: 'volume_15pct', percent_off: 15 },
  { id: 'volume_20pct', percent_off: 20 },
] as const;

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  const stripe = new Stripe(key, { apiVersion: '2026-01-28.clover' });

  for (const config of VOLUME_COUPONS) {
    try {
      const existing = await stripe.coupons.retrieve(config.id);
      console.log(`✓ Coupon ${config.id} already exists (${existing.percent_off}% off)`);
    } catch (err: unknown) {
      if (err instanceof Stripe.errors.StripeError && err.code === 'resource_missing') {
        const created = await stripe.coupons.create({
          id: config.id,
          percent_off: config.percent_off,
          duration: 'forever',
          name: `Volume Discount ${config.percent_off}%`,
          metadata: { origin: 'volume_discount' },
        });
        console.log(`+ Created coupon ${created.id} (${created.percent_off}% off)`);
      } else {
        throw err;
      }
    }
  }
  console.log('Done.');
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Run script against Stripe test mode**

Run: `scripts/with-env-local.sh pnpm tsx scripts/seed-volume-coupons.ts`
Expected: 3 "+ Created coupon" lines, then "Done."

- [ ] **Step 3: Verify in Stripe dashboard**

Open Stripe test mode dashboard → Products → Coupons. Confirm 3 coupons exist with `metadata.origin = 'volume_discount'`.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-volume-coupons.ts
git commit -m "feat(billing): add volume coupon seed script"
```

---

## Task 5: Volume discount orchestration service (integration TDD)

**Files:**
- Create: `apps/web/__tests__/billing/volume-discounts.test.ts`
- Create: `apps/web/src/lib/billing/volume-discounts.ts`

- [ ] **Step 1: Write failing tests (with mocked Stripe)**

Create `apps/web/__tests__/billing/volume-discounts.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockListSubs = vi.fn();
const mockUpdateSub = vi.fn();
const mockDeleteDiscount = vi.fn();

vi.mock('stripe', () => ({
  default: vi.fn(() => ({
    subscriptions: {
      list: mockListSubs,
      update: mockUpdateSub,
      deleteDiscount: mockDeleteDiscount,
    },
  })),
}));

import { applyVolumeDiscountToSubscriptions } from '@/lib/billing/volume-discounts';

beforeEach(() => {
  mockListSubs.mockReset();
  mockUpdateSub.mockReset();
  mockDeleteDiscount.mockReset();
});

describe('applyVolumeDiscountToSubscriptions', () => {
  it('applies new coupon when no existing volume discount', async () => {
    mockListSubs.mockResolvedValue({
      data: [{ id: 'sub_1', discounts: [] }],
    });
    mockUpdateSub.mockResolvedValue({ id: 'sub_1' });

    await applyVolumeDiscountToSubscriptions('cus_123', 'tier_10');

    expect(mockDeleteDiscount).not.toHaveBeenCalled();
    expect(mockUpdateSub).toHaveBeenCalledWith('sub_1', {
      discounts: [{ coupon: 'volume_10pct' }],
    });
  });

  it('removes existing volume discount before applying new one', async () => {
    mockListSubs.mockResolvedValue({
      data: [{
        id: 'sub_1',
        discounts: [{
          id: 'di_abc',
          coupon: { id: 'volume_10pct', metadata: { origin: 'volume_discount' } },
        }],
      }],
    });
    mockUpdateSub.mockResolvedValue({ id: 'sub_1' });
    mockDeleteDiscount.mockResolvedValue({ deleted: true });

    await applyVolumeDiscountToSubscriptions('cus_123', 'tier_15');

    expect(mockDeleteDiscount).toHaveBeenCalledWith('sub_1', 'di_abc');
    expect(mockUpdateSub).toHaveBeenCalledWith('sub_1', {
      discounts: [{ coupon: 'volume_15pct' }],
    });
  });

  it('removes volume discount when tier becomes none', async () => {
    mockListSubs.mockResolvedValue({
      data: [{
        id: 'sub_1',
        discounts: [{
          id: 'di_abc',
          coupon: { id: 'volume_10pct', metadata: { origin: 'volume_discount' } },
        }],
      }],
    });
    mockDeleteDiscount.mockResolvedValue({ deleted: true });

    await applyVolumeDiscountToSubscriptions('cus_123', 'none');

    expect(mockDeleteDiscount).toHaveBeenCalledWith('sub_1', 'di_abc');
    expect(mockUpdateSub).not.toHaveBeenCalled();
  });

  it('ignores non-volume discounts (promo codes)', async () => {
    mockListSubs.mockResolvedValue({
      data: [{
        id: 'sub_1',
        discounts: [{
          id: 'di_promo',
          coupon: { id: 'PROMO50', metadata: { origin: 'marketing' } },
        }],
      }],
    });
    mockUpdateSub.mockResolvedValue({ id: 'sub_1' });

    await applyVolumeDiscountToSubscriptions('cus_123', 'tier_10');

    // Should NOT delete the promo discount
    expect(mockDeleteDiscount).not.toHaveBeenCalled();
    // Should still apply volume discount
    expect(mockUpdateSub).toHaveBeenCalledWith('sub_1', {
      discounts: [{ coupon: 'volume_10pct' }],
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter web test volume-discounts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement volume-discounts.ts**

Create `apps/web/src/lib/billing/volume-discounts.ts`:

```typescript
import Stripe from 'stripe';
import { tierToCouponId, type VolumeTier } from './tier-calculator';

const VOLUME_DISCOUNT_ORIGIN = 'volume_discount';

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  return new Stripe(key, { apiVersion: '2026-01-28.clover' });
}

/**
 * Applies the target volume discount tier to every active subscription
 * on the given Stripe customer. Removes any existing volume discount
 * (identified by metadata.origin='volume_discount') before applying
 * the new one. Non-volume discounts (promos, etc.) are left untouched.
 */
export async function applyVolumeDiscountToSubscriptions(
  stripeCustomerId: string,
  newTier: VolumeTier,
): Promise<void> {
  const stripe = getStripe();
  const newCouponId = tierToCouponId(newTier);

  const subs = await stripe.subscriptions.list({
    customer: stripeCustomerId,
    status: 'active',
    limit: 100,
  });

  for (const sub of subs.data) {
    const existingVolume = findVolumeDiscount(sub.discounts);

    if (existingVolume) {
      await stripe.subscriptions.deleteDiscount(sub.id, existingVolume.id);
    }

    if (newCouponId) {
      await stripe.subscriptions.update(sub.id, {
        discounts: [{ coupon: newCouponId }],
      });
    }
  }
}

interface DiscountLike {
  id: string;
  coupon?: { id: string; metadata?: Record<string, string> } | null;
}

function findVolumeDiscount(
  discounts: Array<DiscountLike | string> | undefined | null,
): DiscountLike | null {
  if (!discounts) return null;
  for (const d of discounts) {
    if (typeof d === 'string') continue;
    if (d.coupon?.metadata?.origin === VOLUME_DISCOUNT_ORIGIN) {
      return d;
    }
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter web test volume-discounts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/billing/volume-discounts.ts apps/web/__tests__/billing/volume-discounts.test.ts
git commit -m "feat(billing): add Stripe volume discount orchestration"
```

---

## Task 6: Billing group service (CRUD + tier recalc with advisory lock)

**Files:**
- Create: `apps/web/src/lib/billing/billing-group-service.ts`
- Create: `apps/web/__tests__/billing/billing-group-service.integration.test.ts`

- [ ] **Step 1: Write integration tests**

Create `apps/web/__tests__/billing/billing-group-service.integration.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the Stripe layer — we test DB logic + orchestration, not Stripe
vi.mock('@/lib/billing/volume-discounts', () => ({
  applyVolumeDiscountToSubscriptions: vi.fn().mockResolvedValue(undefined),
}));

import { createUnscopedClient } from '@propertypro/db/unsafe';
import { billingGroups, communities } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import {
  recalculateVolumeTier,
  createBillingGroup,
  linkCommunityToBillingGroup,
} from '@/lib/billing/billing-group-service';
import { applyVolumeDiscountToSubscriptions } from '@/lib/billing/volume-discounts';

describe('recalculateVolumeTier (integration)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const db = createUnscopedClient();
    // Clean slate: delete test billing groups + test communities
    await db.delete(billingGroups).where(eq(billingGroups.stripeCustomerId, 'cus_test_recalc'));
  });

  it('upgrades from none to tier_10 when count hits 3', async () => {
    // Arrange: create a billing group with 2 active communities
    const db = createUnscopedClient();
    const [group] = await db
      .insert(billingGroups)
      .values({
        name: 'Test Group',
        stripeCustomerId: 'cus_test_recalc',
        ownerUserId: '00000000-0000-0000-0000-000000000001',
        volumeTier: 'none',
        activeCommunityCount: 2,
      })
      .returning();

    // Insert 3 communities linked to this group
    await db.insert(communities).values([
      { name: 'C1', slug: 't-c1-recalc', communityType: 'condo_718', billingGroupId: group.id, stripeCustomerId: 'cus_test_recalc' } as any,
      { name: 'C2', slug: 't-c2-recalc', communityType: 'condo_718', billingGroupId: group.id, stripeCustomerId: 'cus_test_recalc' } as any,
      { name: 'C3', slug: 't-c3-recalc', communityType: 'condo_718', billingGroupId: group.id, stripeCustomerId: 'cus_test_recalc' } as any,
    ]);

    // Act
    const result = await recalculateVolumeTier(group.id);

    // Assert
    expect(result.previousTier).toBe('none');
    expect(result.newTier).toBe('tier_10');
    expect(applyVolumeDiscountToSubscriptions).toHaveBeenCalledWith('cus_test_recalc', 'tier_10');

    const [updated] = await db.select().from(billingGroups).where(eq(billingGroups.id, group.id));
    expect(updated.volumeTier).toBe('tier_10');
    expect(updated.activeCommunityCount).toBe(3);
    expect(updated.couponSyncStatus).toBe('synced');
  });

  it('sets coupon_sync_status to failed on Stripe error', async () => {
    vi.mocked(applyVolumeDiscountToSubscriptions).mockRejectedValueOnce(new Error('Stripe API down'));

    const db = createUnscopedClient();
    const [group] = await db
      .insert(billingGroups)
      .values({
        name: 'Test Group 2',
        stripeCustomerId: 'cus_test_recalc',
        ownerUserId: '00000000-0000-0000-0000-000000000001',
        volumeTier: 'none',
        activeCommunityCount: 0,
      })
      .returning();

    await db.insert(communities).values([
      { name: 'C1', slug: 't-fail-c1', communityType: 'condo_718', billingGroupId: group.id, stripeCustomerId: 'cus_test_recalc' } as any,
      { name: 'C2', slug: 't-fail-c2', communityType: 'condo_718', billingGroupId: group.id, stripeCustomerId: 'cus_test_recalc' } as any,
      { name: 'C3', slug: 't-fail-c3', communityType: 'condo_718', billingGroupId: group.id, stripeCustomerId: 'cus_test_recalc' } as any,
    ]);

    await expect(recalculateVolumeTier(group.id)).rejects.toThrow('Stripe API down');

    const [updated] = await db.select().from(billingGroups).where(eq(billingGroups.id, group.id));
    expect(updated.couponSyncStatus).toBe('failed');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `scripts/with-env-local.sh pnpm exec vitest run --config apps/web/vitest.integration.config.ts billing-group-service`
Expected: FAIL — module not found

- [ ] **Step 3: Implement billing-group-service.ts**

Create `apps/web/src/lib/billing/billing-group-service.ts`:

```typescript
import { sql } from 'drizzle-orm';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { billingGroups, communities } from '@propertypro/db';
import { eq, and, isNull } from '@propertypro/db/filters';
import { determineTier, type VolumeTier } from './tier-calculator';
import { applyVolumeDiscountToSubscriptions } from './volume-discounts';

export interface RecalculateResult {
  billingGroupId: number;
  previousTier: VolumeTier;
  newTier: VolumeTier;
  activeCount: number;
  tierChanged: boolean;
}

/**
 * Recalculates the volume tier for a billing group based on the count
 * of non-deleted communities linked to it. Applies the correct Stripe
 * discount across all active subscriptions on the group's customer.
 *
 * Uses a PostgreSQL advisory lock to serialize concurrent recalculations
 * for the same group.
 */
export async function recalculateVolumeTier(billingGroupId: number): Promise<RecalculateResult> {
  const db = createUnscopedClient();

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${billingGroupId})`);

    const [group] = await tx
      .select()
      .from(billingGroups)
      .where(eq(billingGroups.id, billingGroupId))
      .limit(1);

    if (!group) throw new Error(`Billing group ${billingGroupId} not found`);

    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(communities)
      .where(
        and(
          eq(communities.billingGroupId, billingGroupId),
          isNull(communities.deletedAt),
        ),
      );

    const previousTier = group.volumeTier as VolumeTier;
    const newTier = determineTier(count);
    const tierChanged = previousTier !== newTier;

    // Mark sync pending before Stripe calls
    await tx
      .update(billingGroups)
      .set({
        activeCommunityCount: count,
        couponSyncStatus: 'pending',
        updatedAt: new Date(),
      })
      .where(eq(billingGroups.id, billingGroupId));

    if (tierChanged) {
      try {
        await applyVolumeDiscountToSubscriptions(group.stripeCustomerId, newTier);
      } catch (err) {
        await tx
          .update(billingGroups)
          .set({ couponSyncStatus: 'failed', updatedAt: new Date() })
          .where(eq(billingGroups.id, billingGroupId));
        throw err;
      }
    }

    await tx
      .update(billingGroups)
      .set({
        volumeTier: newTier,
        couponSyncStatus: 'synced',
        updatedAt: new Date(),
      })
      .where(eq(billingGroups.id, billingGroupId));

    return { billingGroupId, previousTier, newTier, activeCount: count, tierChanged };
  });
}

export interface CreateBillingGroupInput {
  name: string;
  stripeCustomerId: string;
  ownerUserId: string;
}

export async function createBillingGroup(input: CreateBillingGroupInput): Promise<number> {
  const db = createUnscopedClient();
  const [row] = await db.insert(billingGroups).values(input).returning({ id: billingGroups.id });
  return row.id;
}

export async function linkCommunityToBillingGroup(
  communityId: number,
  billingGroupId: number,
): Promise<void> {
  const db = createUnscopedClient();
  await db
    .update(communities)
    .set({ billingGroupId })
    .where(eq(communities.id, communityId));
}

export async function getBillingGroupByOwner(ownerUserId: string) {
  const db = createUnscopedClient();
  const [row] = await db
    .select()
    .from(billingGroups)
    .where(and(eq(billingGroups.ownerUserId, ownerUserId), isNull(billingGroups.deletedAt)))
    .limit(1);
  return row ?? null;
}
```

- [ ] **Step 4: Add scoped DB access allowlist entry**

In `scripts/verify-scoped-db-access.ts`, add `apps/web/src/lib/billing/billing-group-service.ts` to the allowlist for `createUnscopedClient` usage (billing groups are owner-scoped, not community-scoped, so they require unsafe access by design).

- [ ] **Step 5: Run tests to verify they pass**

Run: `scripts/with-env-local.sh pnpm exec vitest run --config apps/web/vitest.integration.config.ts billing-group-service`
Expected: PASS (2 tests)

- [ ] **Step 6: Run DB access guard**

Run: `pnpm guard:db-access`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/billing/billing-group-service.ts \
  apps/web/__tests__/billing/billing-group-service.integration.test.ts \
  scripts/verify-scoped-db-access.ts
git commit -m "feat(billing): add billing group service with tier recalculation"
```

---

## Task 7: Gate POST /api/v1/pm/communities behind Stripe checkout

**Files:**
- Modify: `apps/web/src/app/api/v1/pm/communities/route.ts`
- Modify: `apps/web/src/lib/services/stripe-service.ts`
- Create: `apps/web/__tests__/api/pm-communities-gated.integration.test.ts`

- [ ] **Step 1: Write failing integration test**

Create `apps/web/__tests__/api/pm-communities-gated.integration.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/services/stripe-service', async (original) => {
  const actual = await original<typeof import('@/lib/services/stripe-service')>();
  return {
    ...actual,
    createAddCommunityCheckout: vi.fn().mockResolvedValue({
      clientSecret: 'cs_test_secret',
      sessionId: 'cs_test_123',
      pendingSignupId: 42,
    }),
  };
});

import { POST } from '@/app/api/v1/pm/communities/route';
import { NextRequest } from 'next/server';

describe('POST /api/v1/pm/communities (gated)', () => {
  it('returns 202 with checkout clientSecret (does NOT create community directly)', async () => {
    // Skip auth in test mode via the existing pattern; see __tests__/setup.ts
    const req = new NextRequest('http://localhost/api/v1/pm/communities', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test Condo',
        communityType: 'condo_718',
        planId: 'essentials',
        addressLine1: '123 Main St',
        city: 'Miami',
        state: 'FL',
        zipCode: '33101',
        subdomain: 'test-condo-gated',
        timezone: 'America/New_York',
        unitCount: 20,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.data.clientSecret).toBe('cs_test_secret');
    expect(body.data.pendingSignupId).toBe(42);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `scripts/with-env-local.sh pnpm exec vitest run --config apps/web/vitest.integration.config.ts pm-communities-gated`
Expected: FAIL — `createAddCommunityCheckout` not exported

- [ ] **Step 3: Add createAddCommunityCheckout to stripe-service.ts**

Append to `apps/web/src/lib/services/stripe-service.ts`:

```typescript
/**
 * Create an Embedded Checkout session for a PM adding a community to their
 * existing billing group. No trial (PM is already a paying customer).
 */
export async function createAddCommunityCheckout(input: {
  billingGroupId: number;
  stripeCustomerId: string;
  pendingSignupId: number;
  communityType: CommunityType;
  planId: PlanId;
  candidateSlug: string;
  returnBaseUrl: string;
}): Promise<{ clientSecret: string; sessionId: string }> {
  const stripe = getStripe();
  const priceId = await resolveStripePrice(input.planId, input.communityType, 'month');

  const session = await stripe.checkout.sessions.create({
    ui_mode: 'embedded',
    mode: 'subscription',
    customer: input.stripeCustomerId,
    line_items: [{ price: priceId, quantity: 1 }],
    return_url: `${input.returnBaseUrl}/pm/dashboard?added_session_id={CHECKOUT_SESSION_ID}`,
    metadata: {
      kind: 'add_to_group',
      billingGroupId: String(input.billingGroupId),
      pendingSignupId: String(input.pendingSignupId),
      communityType: input.communityType,
      selectedPlan: input.planId,
      candidateSlug: input.candidateSlug,
    },
  });

  if (!session.client_secret) {
    throw new AppError('Stripe did not return client_secret', 500, 'STRIPE_NO_CLIENT_SECRET');
  }

  return { clientSecret: session.client_secret, sessionId: session.id };
}
```

- [ ] **Step 4: Rewrite POST handler in route.ts**

Replace the POST handler in `apps/web/src/app/api/v1/pm/communities/route.ts`:

```typescript
export const POST = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();

  const isPm = await isPmAdminInAnyCommunity(userId);
  if (!isPm) {
    throw new ForbiddenError('This endpoint is only available to property managers');
  }

  const body = await req.json();
  const parseResult = createCommunitySchema.safeParse(body);
  if (!parseResult.success) {
    throw new ValidationError('Invalid community data', { issues: parseResult.error.issues });
  }

  const input = parseResult.data;

  const slugCheck = await checkSignupSubdomainAvailability(input.subdomain);
  if (!slugCheck.available) {
    throw new ValidationError('Subdomain is not available', {
      field: 'subdomain',
      reason: slugCheck.reason,
      message: slugCheck.message,
    });
  }

  // 1. Get or create billing group for this PM
  const { billingGroupId, stripeCustomerId } = await getOrCreateBillingGroupForPm(userId);

  // 2. Create pending_signups row for add-to-group flow
  const pendingSignupId = await createPendingAddToGroupSignup({
    userId,
    billingGroupId,
    input: { ...input, subdomain: slugCheck.normalizedSubdomain },
  });

  // 3. Create Stripe Checkout session (no trial)
  const { clientSecret } = await createAddCommunityCheckout({
    billingGroupId,
    stripeCustomerId,
    pendingSignupId,
    communityType: input.communityType,
    planId: input.planId,
    candidateSlug: slugCheck.normalizedSubdomain,
    returnBaseUrl: process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000',
  });

  return NextResponse.json(
    { data: { clientSecret, pendingSignupId, billingGroupId } },
    { status: 202 },
  );
});
```

Also update `createCommunitySchema` to add `planId` field:

```typescript
const createCommunitySchema = z.object({
  name: z.string().trim().min(1).max(200),
  communityType: z.enum(COMMUNITY_TYPES),
  planId: z.enum(['essentials', 'professional', 'operations_plus']),
  addressLine1: z.string().trim().min(1).max(200),
  // ... existing fields
});
```

Add imports:

```typescript
import { createAddCommunityCheckout } from '@/lib/services/stripe-service';
import { getOrCreateBillingGroupForPm, createPendingAddToGroupSignup } from '@/lib/billing/billing-group-service';
```

- [ ] **Step 5: Add helpers to billing-group-service.ts**

Append to `apps/web/src/lib/billing/billing-group-service.ts`:

```typescript
export async function getOrCreateBillingGroupForPm(
  userId: string,
): Promise<{ billingGroupId: number; stripeCustomerId: string }> {
  const db = createUnscopedClient();

  // Check if PM already has a billing group
  const existing = await getBillingGroupByOwner(userId);
  if (existing) {
    return { billingGroupId: existing.id, stripeCustomerId: existing.stripeCustomerId };
  }

  // Find PM's first community (from signup) to get its Stripe Customer
  const [firstCommunity] = await db
    .select({
      id: communities.id,
      stripeCustomerId: communities.stripeCustomerId,
      name: communities.name,
    })
    .from(communities)
    .innerJoin(sql`user_roles ur`, sql`ur.community_id = ${communities.id}`)
    .where(and(sql`ur.user_id = ${userId}::uuid`, sql`ur.role = 'pm_admin'`, isNull(communities.deletedAt)))
    .limit(1);

  if (!firstCommunity?.stripeCustomerId) {
    throw new Error('PM has no community with a Stripe customer ID; cannot create billing group');
  }

  const billingGroupId = await createBillingGroup({
    name: firstCommunity.name + ' Portfolio',
    stripeCustomerId: firstCommunity.stripeCustomerId,
    ownerUserId: userId,
  });

  await linkCommunityToBillingGroup(firstCommunity.id, billingGroupId);

  return { billingGroupId, stripeCustomerId: firstCommunity.stripeCustomerId };
}

export async function createPendingAddToGroupSignup(input: {
  userId: string;
  billingGroupId: number;
  input: {
    name: string;
    communityType: string;
    planId: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    zipCode: string;
    subdomain: string;
    timezone: string;
    unitCount: number;
  };
}): Promise<number> {
  const db = createUnscopedClient();
  const signupRequestId = `add-${input.billingGroupId}-${Date.now()}`;
  const [row] = await db
    .insert(pendingSignups)
    .values({
      signupRequestId,
      authUserId: input.userId,
      primaryContactName: 'PM Admin', // placeholder; not used for add-to-group
      email: 'pm-add@placeholder.local', // placeholder
      emailNormalized: `pm-add-${signupRequestId}@placeholder.local`,
      communityName: input.input.name,
      address: `${input.input.addressLine1}, ${input.input.city}, ${input.input.state} ${input.input.zipCode}`,
      county: input.input.state,
      unitCount: input.input.unitCount,
      communityType: input.input.communityType as any,
      planKey: input.input.planId,
      candidateSlug: input.input.subdomain,
      termsAcceptedAt: new Date(),
      status: 'checkout_started',
      payload: {
        kind: 'add_to_group',
        billingGroupId: input.billingGroupId,
        fullInput: input.input,
      },
    })
    .returning({ id: pendingSignups.id });
  return Number(row.id);
}
```

Add import: `import { pendingSignups } from '@propertypro/db';`

- [ ] **Step 6: Run test to verify it passes**

Run: `scripts/with-env-local.sh pnpm exec vitest run --config apps/web/vitest.integration.config.ts pm-communities-gated`
Expected: PASS

- [ ] **Step 7: Typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/api/v1/pm/communities/route.ts \
  apps/web/src/lib/services/stripe-service.ts \
  apps/web/src/lib/billing/billing-group-service.ts \
  apps/web/__tests__/api/pm-communities-gated.integration.test.ts
git commit -m "feat(billing): gate POST /api/v1/pm/communities behind Stripe checkout"
```

---

## Task 8: Webhook handler — add_to_group path

**Files:**
- Modify: `apps/web/src/app/api/v1/webhooks/stripe/route.ts`
- Modify: `apps/web/src/lib/services/provisioning-service.ts`

- [ ] **Step 1: Add add_to_group routing in webhook handler**

In `apps/web/src/app/api/v1/webhooks/stripe/route.ts`, find `handleCheckoutSessionCompleted` and add a new branch:

```typescript
if (session.metadata?.kind === 'add_to_group') {
  const billingGroupId = Number(session.metadata.billingGroupId);
  const pendingSignupId = Number(session.metadata.pendingSignupId);

  // Enqueue provisioning job with add_to_group flag
  await enqueueProvisioningJob({
    pendingSignupId,
    kind: 'add_to_group',
    billingGroupId,
    stripeSubscriptionId: session.subscription as string,
  });
  return;
}
```

- [ ] **Step 2: Extend provisioning service**

In `apps/web/src/lib/services/provisioning-service.ts`, add a new state `billing_group_linked` to the state machine. Add a handler that:

1. Calls `createCommunityForPm()` with the saved input from `pending_signups.payload.fullInput`
2. Links the new community to the billing group via `linkCommunityToBillingGroup()`
3. Saves `stripeCustomerId` and `stripeSubscriptionId` on the new community
4. Calls `recalculateVolumeTier(billingGroupId)`

```typescript
// New provisioning step for add_to_group flow
async function provisionAddToGroup(ctx: ProvisioningContext): Promise<void> {
  const payload = ctx.signup.payload as {
    kind: 'add_to_group';
    billingGroupId: number;
    fullInput: {
      name: string;
      communityType: CommunityType;
      addressLine1: string;
      addressLine2?: string;
      city: string;
      state: string;
      zipCode: string;
      subdomain: string;
      timezone: string;
      unitCount: number;
    };
  };

  // 1. Create the community (reuses existing function)
  const { communityId } = await createCommunityForPm({
    userId: ctx.signup.authUserId!,
    ...payload.fullInput,
  });

  // 2. Link to billing group
  await linkCommunityToBillingGroup(communityId, payload.billingGroupId);

  // 3. Save Stripe IDs on the new community
  const db = createUnscopedClient();
  await db
    .update(communities)
    .set({
      stripeCustomerId: ctx.stripeCustomerId,
      stripeSubscriptionId: ctx.stripeSubscriptionId,
      subscriptionStatus: 'active',
    })
    .where(eq(communities.id, communityId));

  // 4. Recalculate volume tier (may upgrade tier for whole group)
  await recalculateVolumeTier(payload.billingGroupId);
}
```

Wire this into the state machine: when `ctx.signup.payload.kind === 'add_to_group'`, call `provisionAddToGroup` instead of the standard signup provisioning flow.

- [ ] **Step 3: Add integration test for webhook routing**

Create `apps/web/__tests__/billing/webhook-add-to-group.integration.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/services/provisioning-service', () => ({
  enqueueProvisioningJob: vi.fn().mockResolvedValue({ jobId: 99 }),
  runProvisioning: vi.fn().mockResolvedValue(undefined),
}));

import { handleCheckoutSessionCompleted } from '@/app/api/v1/webhooks/stripe/handlers';
import { enqueueProvisioningJob } from '@/lib/services/provisioning-service';

describe('webhook: add_to_group checkout.session.completed', () => {
  it('enqueues add_to_group provisioning job', async () => {
    const session = {
      id: 'cs_test_add',
      subscription: 'sub_test_abc',
      metadata: {
        kind: 'add_to_group',
        billingGroupId: '42',
        pendingSignupId: '7',
      },
    } as any;

    await handleCheckoutSessionCompleted(session);

    expect(enqueueProvisioningJob).toHaveBeenCalledWith({
      pendingSignupId: 7,
      kind: 'add_to_group',
      billingGroupId: 42,
      stripeSubscriptionId: 'sub_test_abc',
    });
  });
});
```

- [ ] **Step 4: Run tests**

Run: `scripts/with-env-local.sh pnpm exec vitest run --config apps/web/vitest.integration.config.ts webhook-add-to-group`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/v1/webhooks/stripe/route.ts \
  apps/web/src/lib/services/provisioning-service.ts \
  apps/web/__tests__/billing/webhook-add-to-group.integration.test.ts
git commit -m "feat(billing): webhook + provisioning for add-to-group flow"
```

---

## Task 9: Pricing preview API endpoint

**Files:**
- Create: `apps/web/src/app/api/v1/billing-groups/[id]/preview/route.ts`

- [ ] **Step 1: Create endpoint**

Create `apps/web/src/app/api/v1/billing-groups/[id]/preview/route.ts`:

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { ForbiddenError, ValidationError } from '@/lib/api/errors';
import { calculatePricingImpact } from '@/lib/billing/pricing-preview';
import { getBillingGroupByOwner } from '@/lib/billing/billing-group-service';
import { resolveStripePrice } from '@/lib/services/stripe-service';
import { PLAN_MONTHLY_PRICES_USD } from '@propertypro/shared';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { communities } from '@propertypro/db';
import { eq, and, isNull } from '@propertypro/db/filters';

const querySchema = z.object({
  planId: z.enum(['essentials', 'professional', 'operations_plus']),
  communityType: z.enum(['condo_718', 'hoa_720', 'apartment']),
});

export const GET = withErrorHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const userId = await requireAuthenticatedUserId();
  const billingGroupId = Number(ctx.params.id);

  const group = await getBillingGroupByOwner(userId);
  if (!group || group.id !== billingGroupId) {
    throw new ForbiddenError('You do not own this billing group');
  }

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    planId: searchParams.get('planId'),
    communityType: searchParams.get('communityType'),
  });
  if (!parsed.success) {
    throw new ValidationError('Invalid query', { issues: parsed.error.issues });
  }

  // Fetch existing community base prices for this group
  const db = createUnscopedClient();
  const existing = await db
    .select({
      planKey: communities.subscriptionPlan,
      communityType: communities.communityType,
    })
    .from(communities)
    .where(and(eq(communities.billingGroupId, billingGroupId), isNull(communities.deletedAt)));

  const existingBasePrices = existing.map((c) =>
    PLAN_MONTHLY_PRICES_USD[c.planKey as keyof typeof PLAN_MONTHLY_PRICES_USD] ?? 0,
  );

  const newPrice = PLAN_MONTHLY_PRICES_USD[parsed.data.planId];
  const impact = calculatePricingImpact({
    basePricesUsd: [...existingBasePrices, newPrice],
    currentGroupSize: existing.length,
    changeType: 'add',
  });

  return NextResponse.json({ data: impact });
});
```

Note: `PLAN_MONTHLY_PRICES_USD` must be added to `@propertypro/shared` if not present. Check `packages/shared/src/features/plan-features.ts` — the display prices exist there; export them as a map.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (fix any import errors by exporting `PLAN_MONTHLY_PRICES_USD` from shared)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/v1/billing-groups/[id]/preview/route.ts packages/shared/src/features/plan-features.ts
git commit -m "feat(billing): add pricing preview endpoint"
```

---

## Task 10: Cancel community preview endpoint

**Files:**
- Create: `apps/web/src/app/api/v1/communities/[id]/cancel-preview/route.ts`

- [ ] **Step 1: Create endpoint**

Create `apps/web/src/app/api/v1/communities/[id]/cancel-preview/route.ts`:

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { ForbiddenError, NotFoundError } from '@/lib/api/errors';
import { calculatePricingImpact } from '@/lib/billing/pricing-preview';
import { PLAN_MONTHLY_PRICES_USD } from '@propertypro/shared';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { communities, billingGroups } from '@propertypro/db';
import { eq, and, isNull, ne } from '@propertypro/db/filters';

export const GET = withErrorHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const userId = await requireAuthenticatedUserId();
  const communityId = Number(ctx.params.id);

  const db = createUnscopedClient();

  const [target] = await db
    .select({
      id: communities.id,
      billingGroupId: communities.billingGroupId,
      subscriptionPlan: communities.subscriptionPlan,
    })
    .from(communities)
    .where(and(eq(communities.id, communityId), isNull(communities.deletedAt)))
    .limit(1);

  if (!target) throw new NotFoundError('Community not found');
  if (!target.billingGroupId) {
    return NextResponse.json({
      data: { previousTier: 'none', newTier: 'none', perCommunityBreakdown: [], portfolioMonthlyDeltaUsd: 0 },
    });
  }

  const [group] = await db
    .select()
    .from(billingGroups)
    .where(eq(billingGroups.id, target.billingGroupId))
    .limit(1);

  if (!group || group.ownerUserId !== userId) {
    throw new ForbiddenError('You do not own this billing group');
  }

  // Remaining communities after this one is canceled
  const remaining = await db
    .select({ planKey: communities.subscriptionPlan })
    .from(communities)
    .where(
      and(
        eq(communities.billingGroupId, target.billingGroupId),
        isNull(communities.deletedAt),
        ne(communities.id, communityId),
      ),
    );

  const remainingBasePrices = remaining.map((c) =>
    PLAN_MONTHLY_PRICES_USD[c.planKey as keyof typeof PLAN_MONTHLY_PRICES_USD] ?? 0,
  );

  const currentCount = remaining.length + 1; // include the one being removed
  const impact = calculatePricingImpact({
    basePricesUsd: remainingBasePrices,
    currentGroupSize: currentCount,
    changeType: 'remove',
  });

  return NextResponse.json({ data: impact });
});
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/v1/communities/[id]/cancel-preview/route.ts
git commit -m "feat(billing): add cancel preview endpoint for downgrade impact"
```

---

## Task 11: Admin notification on tier downgrade

**Files:**
- Create: `apps/web/src/lib/billing/downgrade-notifications.ts`
- Modify: `apps/web/src/lib/billing/billing-group-service.ts`

- [ ] **Step 1: Create notification helper**

Create `apps/web/src/lib/billing/downgrade-notifications.ts`:

```typescript
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { communities, userRoles } from '@propertypro/db';
import { eq, and, isNull, inArray } from '@propertypro/db/filters';
import { createNotification } from '@/lib/services/notification-service';
import { tierToPercentOff, type VolumeTier } from './tier-calculator';

const ADMIN_ROLES = ['board_member', 'board_president', 'cam', 'site_manager', 'pm_admin'] as const;

export async function notifyDowngrade(input: {
  billingGroupId: number;
  previousTier: VolumeTier;
  newTier: VolumeTier;
  canceledCommunityName: string;
}): Promise<void> {
  const prevPct = tierToPercentOff(input.previousTier);
  const newPct = tierToPercentOff(input.newTier);

  const db = createUnscopedClient();

  // Get all remaining communities in the group
  const groupCommunities = await db
    .select({ id: communities.id })
    .from(communities)
    .where(and(eq(communities.billingGroupId, input.billingGroupId), isNull(communities.deletedAt)));

  if (groupCommunities.length === 0) return;

  // Get all admin users across those communities
  const admins = await db
    .selectDistinct({ userId: userRoles.userId, communityId: userRoles.communityId })
    .from(userRoles)
    .where(
      and(
        inArray(userRoles.communityId, groupCommunities.map((c) => c.id)),
        inArray(userRoles.role, ADMIN_ROLES as any),
      ),
    );

  // Fire one notification per admin per community
  const title = 'Portfolio discount changed';
  const body = `Your volume discount dropped from ${prevPct}% to ${newPct}% because ${input.canceledCommunityName} was canceled. Your next invoice will reflect the new rate.`;

  for (const admin of admins) {
    await createNotification({
      userId: admin.userId,
      communityId: admin.communityId,
      title,
      body,
      category: 'billing',
      priority: 'aware',
    });
  }
}
```

- [ ] **Step 2: Wire into recalculateVolumeTier**

In `apps/web/src/lib/billing/billing-group-service.ts`, modify `recalculateVolumeTier` to accept an optional context and call `notifyDowngrade` when `tierChanged && newTier < previousTier`:

```typescript
export async function recalculateVolumeTier(
  billingGroupId: number,
  context?: { canceledCommunityName?: string },
): Promise<RecalculateResult> {
  // ... existing logic ...

  // After successful tier change:
  const isDowngrade =
    tierChanged &&
    tierRank(previousTier) > tierRank(newTier) &&
    context?.canceledCommunityName;
  if (isDowngrade) {
    await notifyDowngrade({
      billingGroupId,
      previousTier,
      newTier,
      canceledCommunityName: context.canceledCommunityName!,
    });
  }

  return { billingGroupId, previousTier, newTier, activeCount: count, tierChanged };
}

function tierRank(t: VolumeTier): number {
  return { none: 0, tier_10: 1, tier_15: 2, tier_20: 3 }[t];
}
```

Add import: `import { notifyDowngrade } from './downgrade-notifications';`

- [ ] **Step 3: Add test**

Create `apps/web/__tests__/billing/downgrade-notifications.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreateNotification = vi.fn();
vi.mock('@/lib/services/notification-service', () => ({
  createNotification: mockCreateNotification,
}));

// Stub DB with admin users
vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: () => ({
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([{ id: 1 }, { id: 2 }]),
      }),
    }),
    selectDistinct: () => ({
      from: () => ({
        where: () => Promise.resolve([
          { userId: 'u1', communityId: 1 },
          { userId: 'u2', communityId: 2 },
        ]),
      }),
    }),
  }),
}));

import { notifyDowngrade } from '@/lib/billing/downgrade-notifications';

describe('notifyDowngrade', () => {
  beforeEach(() => mockCreateNotification.mockReset());

  it('notifies every admin with correct message', async () => {
    await notifyDowngrade({
      billingGroupId: 1,
      previousTier: 'tier_15',
      newTier: 'tier_10',
      canceledCommunityName: 'Sunset Condos',
    });

    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        title: 'Portfolio discount changed',
        body: expect.stringContaining('from 15% to 10%'),
      }),
    );
  });
});
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter web test downgrade-notifications`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/billing/downgrade-notifications.ts \
  apps/web/src/lib/billing/billing-group-service.ts \
  apps/web/__tests__/billing/downgrade-notifications.test.ts
git commit -m "feat(billing): notify admins on volume tier downgrade"
```

---

## Task 12: Coupon sync retry worker

**Files:**
- Create: `apps/web/src/app/api/v1/internal/coupon-sync-retry/route.ts`

- [ ] **Step 1: Create retry endpoint**

Create `apps/web/src/app/api/v1/internal/coupon-sync-retry/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { billingGroups } from '@propertypro/db';
import { eq, and, lt, inArray, isNull } from '@propertypro/db/filters';
import { recalculateVolumeTier } from '@/lib/billing/billing-group-service';

// Cron: every 10 minutes
export async function POST(req: Request): Promise<Response> {
  // Auth via cron secret header (existing pattern from other cron endpoints)
  const cronSecret = req.headers.get('x-cron-secret');
  if (cronSecret !== process.env.CRON_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  const db = createUnscopedClient();
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

  const stuck = await db
    .select({ id: billingGroups.id })
    .from(billingGroups)
    .where(
      and(
        inArray(billingGroups.couponSyncStatus, ['failed', 'pending']),
        lt(billingGroups.updatedAt, fiveMinAgo),
        isNull(billingGroups.deletedAt),
      ),
    )
    .limit(50);

  const results: Array<{ id: number; ok: boolean; error?: string }> = [];
  for (const row of stuck) {
    try {
      await recalculateVolumeTier(row.id);
      results.push({ id: row.id, ok: true });
    } catch (e) {
      results.push({ id: row.id, ok: false, error: e instanceof Error ? e.message : 'unknown' });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
```

- [ ] **Step 2: Add cron schedule to vercel.json or similar**

Add to `vercel.json` (or project's cron config):

```json
{
  "crons": [
    { "path": "/api/v1/internal/coupon-sync-retry", "schedule": "*/10 * * * *" }
  ]
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/v1/internal/coupon-sync-retry/route.ts vercel.json
git commit -m "feat(billing): add coupon sync retry cron worker"
```

---

## Task 13: Add Community modal UI

**Files:**
- Create: `apps/web/src/components/pm/add-community-modal.tsx`
- Modify: `apps/web/src/app/(authenticated)/pm/dashboard/page.tsx`

- [ ] **Step 1: Create modal component**

Create `apps/web/src/components/pm/add-community-modal.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertBanner } from '@propertypro/ui';
import { loadStripe } from '@stripe/stripe-js';
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface PricingPreview {
  previousTier: string;
  newTier: string;
  perCommunityBreakdown: Array<{ basePriceUsd: number; discountedPriceUsd: number; discountPercent: number }>;
  portfolioMonthlyDeltaUsd: number;
}

export function AddCommunityModal({ open, onClose, billingGroupId }: {
  open: boolean;
  onClose: () => void;
  billingGroupId: number | null;
}) {
  const [form, setForm] = useState({
    name: '', communityType: 'condo_718', planId: 'essentials',
    addressLine1: '', city: '', state: 'FL', zipCode: '', subdomain: '', unitCount: 1,
  });
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  const preview = useQuery<{ data: PricingPreview }>({
    queryKey: ['pricing-preview', billingGroupId, form.planId, form.communityType],
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/billing-groups/${billingGroupId}/preview?planId=${form.planId}&communityType=${form.communityType}`,
      );
      return res.json();
    },
    enabled: !!billingGroupId && open,
  });

  const submit = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/v1/pm/communities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Checkout creation failed');
      return res.json();
    },
    onSuccess: (data) => setClientSecret(data.data.clientSecret),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        {!clientSecret ? (
          <>
            <DialogHeader>
              <DialogTitle>Add a Community</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <Input
                placeholder="Community name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <Select value={form.planId} onValueChange={(v) => setForm({ ...form, planId: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="essentials">Essentials — $199/mo</SelectItem>
                  <SelectItem value="professional">Professional — $349/mo</SelectItem>
                  <SelectItem value="operations_plus">Operations Plus — $499/mo</SelectItem>
                </SelectContent>
              </Select>
              {/* Other fields: address, subdomain, etc. — same pattern */}

              {preview.data && (
                <div className="rounded-md border border-default bg-surface-muted p-4">
                  <p className="text-sm font-medium">Portfolio Pricing</p>
                  <p className="text-sm text-secondary">
                    Volume discount: {preview.data.data.perCommunityBreakdown[0]?.discountPercent}%
                  </p>
                  {preview.data.data.previousTier !== preview.data.data.newTier && (
                    <AlertBanner variant="info" className="mt-2">
                      Adding this community will unlock a new discount tier for your entire portfolio.
                    </AlertBanner>
                  )}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
                {submit.isPending ? 'Starting checkout…' : 'Continue to Payment'}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret }}>
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Wire into PM dashboard**

In `apps/web/src/app/(authenticated)/pm/dashboard/page.tsx`, add an "Add Community" button that opens the modal. Fetch the PM's `billingGroupId` via a new helper or pass from server-side props.

- [ ] **Step 3: Typecheck + visual verification**

Run: `pnpm typecheck`
Run: `preview_start("web")` then navigate to `/pm/dashboard` and verify the modal opens and shows pricing preview.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/pm/add-community-modal.tsx apps/web/src/app/\(authenticated\)/pm/dashboard/page.tsx
git commit -m "feat(billing): add community modal with pricing preview and embedded checkout"
```

---

## Task 14: Cancel community dialog with two-step confirm

**Files:**
- Create: `apps/web/src/components/pm/cancel-community-dialog.tsx`

- [ ] **Step 1: Create dialog component**

Create `apps/web/src/components/pm/cancel-community-dialog.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertBanner } from '@propertypro/ui';

export function CancelCommunityDialog({
  open, onClose, communityId, communityName,
}: {
  open: boolean;
  onClose: () => void;
  communityId: number;
  communityName: string;
}) {
  const [confirmText, setConfirmText] = useState('');

  const preview = useQuery({
    queryKey: ['cancel-preview', communityId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/communities/${communityId}/cancel-preview`);
      return res.json();
    },
    enabled: open,
  });

  const cancel = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/communities/${communityId}/cancel`, { method: 'POST' });
      if (!res.ok) throw new Error('Cancel failed');
      return res.json();
    },
    onSuccess: onClose,
  });

  const impact = preview.data?.data;
  const hasDowngrade = impact && impact.previousTier !== impact.newTier;
  const canConfirm = confirmText === 'CONFIRM';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Cancel {communityName}?</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {hasDowngrade && impact && (
            <AlertBanner variant="danger">
              <div className="space-y-2">
                <p className="font-medium">Portfolio discount will decrease</p>
                <p className="text-sm">
                  Your volume discount will drop from {impact.previousTier} to {impact.newTier}.
                  Your remaining communities will cost ${Math.abs(impact.portfolioMonthlyDeltaUsd).toFixed(2)}/mo MORE.
                </p>
              </div>
            </AlertBanner>
          )}
          <div>
            <label className="text-sm font-medium">Type CONFIRM to proceed</label>
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Keep Community</Button>
          <Button
            variant="destructive"
            disabled={!canConfirm || cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            {cancel.isPending ? 'Canceling…' : 'Cancel Community'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/pm/cancel-community-dialog.tsx
git commit -m "feat(billing): add cancel community dialog with two-step confirm"
```

---

## Task 15: Full E2E test

**Files:**
- Create: `apps/web/e2e/add-community.spec.ts`

- [ ] **Step 1: Write E2E test**

Create `apps/web/e2e/add-community.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { devLogin } from './helpers/dev-login';

test.describe('PM Add Community Flow', () => {
  test('PM can initiate add-community checkout', async ({ page }) => {
    await devLogin(page, 'pm_admin');
    await page.goto('/pm/dashboard');

    await page.getByRole('button', { name: /add community/i }).click();
    await page.getByPlaceholder('Community name').fill('Test Community E2E');
    await page.getByRole('combobox').selectOption('professional');

    await expect(page.getByText(/portfolio pricing/i)).toBeVisible();

    await page.getByRole('button', { name: /continue to payment/i }).click();

    // Stripe embedded checkout iframe appears
    await expect(page.frameLocator('iframe[name^="embedded-checkout"]').first()).toBeVisible({ timeout: 10000 });
  });
});
```

- [ ] **Step 2: Run E2E**

Run: `pnpm --filter web exec playwright test add-community`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/add-community.spec.ts
git commit -m "test(billing): E2E test for PM add community flow"
```

---

## Final Verification

- [ ] **All tests pass**

Run: `pnpm test && scripts/with-env-local.sh pnpm exec vitest run --config apps/web/vitest.integration.config.ts`

- [ ] **Typecheck + lint + guard pass**

Run: `pnpm typecheck && pnpm lint && pnpm guard:db-access`

- [ ] **Build succeeds**

Run: `pnpm build`

- [ ] **Manual QA checklist**

- Seed script creates 3 coupons in Stripe test mode
- POST /api/v1/pm/communities returns 202 with `clientSecret`, NOT 201
- After Stripe checkout completes, new community appears in PM dashboard
- Volume discount applied on all group subscriptions (verify in Stripe dashboard)
- Canceling a community that crosses tier fires notifications to all admins
- Cancel dialog requires "CONFIRM" text entry
