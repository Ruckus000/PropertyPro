# Wave 1b — Access Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile the three existing lifecycles, introduce true 7-day paid grace (replacing the 30-day fiction), align emails, extend guard to must-guard routes only, and pass integration tests for cancel→grace→lock.

**Architecture:** `grace_until` is derived at query time — `subscription_canceled_at + 7 days` — consumed by the **existing** `requireActiveSubscriptionForMutation`. No new enum, no new DB column (schema already has `subscription_canceled_at`). The email scheduler ladder is trimmed to match 7-day reality. Guard is extended only to the ~10 must-guard routes identified by inventory. Demo guard is unchanged.

**Tech Stack:** Next.js 15 App Router, Vitest, Drizzle ORM, `@propertypro/shared`, `@propertypro/email`

**Spec:** [docs/superpowers/specs/2026-07-10-public-ga-shippable-prd-design.md](../specs/2026-07-10-public-ga-shippable-prd-design.md) §7 Wave 1b, §8 billing state machine

**Depends on:** Wave 1a (shipped in PR #764)

**Out of scope:** Wave 2 aha/nav, transparency default-on, UI craft pass (Wave 3), PM portfolio

---

## Lifecycle Matrix

This is the authoritative three-system inventory required by PRD §8.1.

### System 1 — Stripe `subscriptionStatus` + `requireActiveSubscriptionForMutation`

| `subscriptionStatus` | `subscription_canceled_at` | Now < `canceled_at + 7d`? | Mutations allowed? | Notes |
|---|---|---|---|---|
| `active` | — | — | ✅ | Normal paid |
| `trialing` | — | — | ✅ | 30-day trial |
| `past_due` | — | — | ✅ (today) → **⚠️ (Wave 1b)** | See grace-on-dunning discussion |
| `canceled` | set | yes | ✅ **new: grace window** | Grace until `canceled_at + 7d` |
| `canceled` | set | no | ❌ soft lock | After 7-day grace |
| `expired` | set | n/a | ❌ soft lock | Treated same as canceled-past-grace |
| `unpaid` | — | — | ❌ soft lock | Trial lapsed, no card retry |
| `incomplete_expired` | — | — | ❌ soft lock | Checkout failure path |
| `null` | — | — | ✅ fail-open | New/unprovisioned; no Stripe IDs yet |
| Unknown | — | — | ✅ fail-open | Forward compat |

**Override:** `free_access_expires_at > now` → always allowed (platform access plans; existing behavior preserved).

### System 2 — `free_access_expires_at` (platform access plans)

Populated by `account-lifecycle-service.ts` when an admin grants a plan (`grantFreeAccess`). Stored as `grace_ends_at` from `access_plans`. Provides a hard override over locked Stripe status. **Do not change this system in Wave 1b.**

### System 3 — Demo grace (`trial_ends_at` / `demo_expires_at` / `assertNotDemoGrace`)

Applies only to `is_demo = true` communities. Uses `computeDemoStatus` → `grace_period` state. Separate error code (`DEMO_GRACE_READ_ONLY`). **Do not change this system in Wave 1b.**

### Cross-system decision logic (per mutation request)

```
1. is_demo?
   → yes: assertNotDemoGrace → throws DEMO_GRACE_READ_ONLY if in grace
   → no: continue

2. free_access_expires_at > now?
   → yes: ALLOW (access plan override)
   → no: continue

3. Derive effective_locked:
   status in CHURNED_STATUSES
   AND NOT (status === 'canceled' AND subscription_canceled_at AND now < canceled_at + 7d)

4. effective_locked?
   → yes: throw 403 SUBSCRIPTION_REQUIRED
   → no: ALLOW
```

---

## Guard Inventory

### Currently subscription-guarded (17 route files)

| Route | Notes |
|---|---|
| `announcements` | Reference guard route in integration tests |
| `assessments` | Finance feature |
| `assessments/[id]` | Finance feature |
| `assessments/[id]/generate` | Finance feature |
| `delinquency/[unitId]/waive` | Finance feature |
| `documents` | Core compliance doc write |
| `documents/drafts` | Core compliance doc draft |
| `documents/drafts/[id]/publish` | Core compliance doc publish |
| `emergency-broadcasts` | Imported; POST bypasses guard (life-safety) |
| `meetings` | Core |
| `onboarding/apartment` | Onboarding writes |
| `onboarding/condo` | Onboarding writes |
| `payments/create-intent` | Resident payments |
| `residents/invite` | Invite writes |
| `stripe/connect/onboard` | Stripe Connect setup |
| `stripe/connect/complete` | Stripe Connect setup |
| `units` | Unit management |

### Must-guard additions (Wave 1b — highest-impact unguarded mutation routes)

Criteria: admin writes to core community data that create real-world obligations when the account is soft-locked. Residents submitting requests or reading data are **not** soft-locked. Billing-portal, profile, support, and emergency are always exempt.

| Route | Rationale |
|---|---|
| `violations` (POST/PATCH/DELETE) | Board enforcement actions |
| `violations/[id]/fine` | Enforcement — financial |
| `violations/[id]/notice` | Enforcement — legal notice |
| `violations/[id]/resolve` | Enforcement state change |
| `violations/[id]/dismiss` | Enforcement state change |
| `arc` (POST) | Board ARC decisions |
| `arc/[id]/decide` | ARC decision |
| `arc/[id]/review` | ARC review |
| `polls` (POST) | Board governance write |
| `elections/[id]/open` | Election lifecycle |
| `elections/[id]/close` | Election lifecycle |
| `elections/[id]/certify` | Election lifecycle |
| `transparency/settings` | Community visibility toggle |
| `import-residents` | Bulk roster write |

**Total must-guard additions: ~14 routes.** All 14 already call `assertNotDemoGrace`; adding `requireActiveSubscriptionForMutation` is a one-liner each.

### Intentionally exempt (do NOT guard)

| Route / Category | Reason |
|---|---|
| `billing/upgrade-requests` | Always allowed (billing recovery path) |
| `account/profile` | Always allowed (user identity) |
| `account/delete` | Always allowed (user rights) |
| `account/join-requests` | Pre-billing path |
| `community/contact` | Support path |
| `help/*` | Always allowed |
| `webhooks/stripe`, `webhooks/twilio` | System webhooks |
| `internal/*` | Cron handlers |
| `payments/update-intent`, `payments/fee-policy` | Resident-facing reads |
| `payments/statement`, `payments/history` | Reads |
| `notifications/*`, `notification-preferences` | UI reads/prefs |
| `residents` (GET) | Read-only |
| `compliance` (GET) | Read-only |
| `delinquency` (GET) | Read-only |
| `leases` | Tenant data; route already has `assertNotDemoGrace` |
| `invitations` | Invitation accept (pre-session) |
| `elections/[id]/vote` | Resident action; should not lock out during grace |
| `polls/[id]/vote` | Resident action |
| `work-orders`, `maintenance-requests` | Resident-facing |
| `amenities/[id]/reserve` | Resident-facing |
| `visitors/*` | Apartment ops; resident-facing |
| `packages/*` | Apartment ops; resident-facing |
| `accounting/*` | PM/accounting connector; let PM handle |
| `esign/*` | Advanced feature; post-GA priority |
| `contracts` | Advanced feature |
| `forum/*`, `faqs/*` | Community content; resident-facing |
| `move-checklists/*` | Resident-facing |
| `reservations/*` | Resident-facing |
| `calendar/*` | Integration connector |
| `pm/*` | PM-portfolio routes; not self-serve scope |
| `demo/*` | Demo lifecycle paths |
| `export` | Read export |
| `overview`, `ledger/*` | Read-only |
| `upload` | File upload — guard on the consuming routes (documents, etc.) |

---

## What Changes

### Change 1: `requireActiveSubscriptionForMutation` → grace-aware

**File:** `apps/web/src/lib/middleware/subscription-guard.ts`

Add grace computation before the hard lock:

```typescript
const PAID_GRACE_DAYS = 7;
const MS_PER_DAY = 86_400_000;

// ... after reading rows ...
const canceledAt = rows[0]?.subscriptionCanceledAt ?? null;

// Within 7-day grace after cancellation
if (
  status === 'canceled' &&
  canceledAt !== null &&
  Date.now() < canceledAt.getTime() + PAID_GRACE_DAYS * MS_PER_DAY
) {
  return; // grace window — allow mutation
}
```

Add `subscriptionCanceledAt` to the unscoped select. Export `PAID_GRACE_DAYS` constant from `@propertypro/shared` (single source).

### Change 2: `PAID_GRACE_DAYS = 7` constant in `@propertypro/shared`

**File:** `packages/shared/src/billing/lifecycle-constants.ts` (create)

```typescript
/** Days of grace allowed after subscription cancellation for paid GA. */
export const PAID_GRACE_DAYS = 7 as const;

/** Days before lock that the final grace-expiry warning email is sent. */
export const GRACE_EXPIRY_WARNING_OFFSET_DAYS = 2 as const;
```

Export from `packages/shared/src/index.ts`.

### Change 3: Email subject/copy → 7-day

**Files:**
- `packages/email/src/templates/subscription-canceled.tsx`
- `apps/web/src/lib/services/payment-alert-scheduler.ts`

In `sendSubscriptionCanceledEmail`, change:
```typescript
// BEFORE
const gracePeriodEnd = addDays(opts.canceledAt, 30);
// email subject: `… — 30-day grace period begins`

// AFTER
const gracePeriodEnd = addDays(opts.canceledAt, PAID_GRACE_DAYS); // 7
// subject: `… — 7-day grace period begins`
```

In `processPaymentReminders` (post-cancel reminder):
```typescript
// BEFORE: expiryDate = canceledAt + 30d; reminder sent at Day 23
// AFTER: expiryDate = canceledAt + 7d; reminder sent at Day 5
// nextReminderAt in webhook: canceledAt + 5 days (instead of +23)
```

Update the webhook handler `handleSubscriptionUpdated/Deleted` in `route.ts` to set:
```typescript
nextReminderAt: new Date(canceledAt.getTime() + 5 * 24 * 60 * 60 * 1000) // Day 5 (2d before lock)
```

Update `SubscriptionExpiryWarningEmail` copy to reflect 7-day total and 2-day warning.

### Change 4: `past_due` grace alignment (Wave 1b scope decision)

Today `past_due` allows all mutations. This is intentionally preserved in Wave 1b.

**Rationale:** `past_due` is set on the first payment failure. Stripe retries automatically over ~7 days. Blocking mutations immediately on first failure would create a worse UX than the 7-day grace we're giving to cancels. The Day 0 → Day 3 → Day 7 reminder ladder already escalates. If Stripe retries all fail, the subscription eventually transitions to `unpaid` or `canceled` — at which point the 7-day grace (for cancel) or immediate lock (for unpaid) applies. No change needed.

### Change 5: Must-guard route additions (~14 routes)

For each route in the "must-guard additions" list, add `await requireActiveSubscriptionForMutation(communityId)` immediately after the existing `await assertNotDemoGrace(communityId)` call (or before the first mutation if no demo guard exists). This is a single-line addition per route.

### Change 6: UI banners for grace state

**File:** `apps/web/src/components/layout/app-shell.tsx`

Add a grace-state banner (reads from `shellContext`). The shell context already threads `subscriptionStatus` and the community object — add `subscription_canceled_at` to `page-shell-context.ts` read.

Grace banner: "Your subscription was canceled. Full access until [date]. [Update payment]" — shown when `status === 'canceled'` AND `now < canceledAt + 7d`.

Soft-lock banner: "Access paused. [Reactivate subscription]" — shown when `status === 'canceled'` AND `now >= canceledAt + 7d` (or `status === 'unpaid'` etc.).

This is the **minimal banner pass** only; full craft polish deferred to Wave 3.

---

## File Map

| File | Change |
|---|---|
| `packages/shared/src/billing/lifecycle-constants.ts` | Create: `PAID_GRACE_DAYS`, `GRACE_EXPIRY_WARNING_OFFSET_DAYS` |
| `packages/shared/src/index.ts` | Add barrel export |
| `apps/web/src/lib/middleware/subscription-guard.ts` | Add grace-window check; import `PAID_GRACE_DAYS` |
| `apps/web/src/app/api/v1/webhooks/stripe/route.ts` | Update `nextReminderAt` from Day 23 → Day 5 on cancel |
| `apps/web/src/lib/services/payment-alert-scheduler.ts` | Update `expiryDate` calc + `SubscriptionExpiryWarningEmail` copy |
| `packages/email/src/templates/subscription-canceled.tsx` | Update grace days + subject |
| `packages/email/src/templates/subscription-expiry-warning.tsx` | Update copy to match 7d |
| `apps/web/src/lib/request/page-shell-context.ts` | Add `subscriptionCanceledAt` to select |
| `apps/web/src/components/layout/app-shell.tsx` | Grace + soft-lock banners |
| ~14 route files (violations, arc, polls, elections, etc.) | Add `requireActiveSubscriptionForMutation` |
| `apps/web/__tests__/billing/subscription-guard-grace.test.ts` | Create: unit tests for grace math |
| `apps/web/__tests__/lifecycle/cancel-grace-lock.integration.test.ts` | Create: cancel→grace→lock integration test |

---

## Tasks

### Task 1: `PAID_GRACE_DAYS` constant in `@propertypro/shared`

**Files:**
- Create: `packages/shared/src/billing/lifecycle-constants.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/shared/src/__tests__/lifecycle-constants.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/shared/src/__tests__/lifecycle-constants.test.ts
import { describe, expect, it } from 'vitest';
import { PAID_GRACE_DAYS, GRACE_EXPIRY_WARNING_OFFSET_DAYS } from '../billing/lifecycle-constants';

describe('paid lifecycle constants', () => {
  it('grace period is exactly 7 days for Public GA', () => {
    expect(PAID_GRACE_DAYS).toBe(7);
  });

  it('warning offset leaves at least 1 day before lock', () => {
    expect(GRACE_EXPIRY_WARNING_OFFSET_DAYS).toBeGreaterThanOrEqual(1);
    expect(GRACE_EXPIRY_WARNING_OFFSET_DAYS).toBeLessThan(PAID_GRACE_DAYS);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm --filter @propertypro/shared exec vitest run src/__tests__/lifecycle-constants.test.ts
```

- [ ] **Step 3: Implement constants**

```typescript
// packages/shared/src/billing/lifecycle-constants.ts
/** Days of grace after subscription cancellation for paid GA communities. */
export const PAID_GRACE_DAYS = 7 as const;

/**
 * Days before the grace expiry that the final warning email is sent.
 * Reminder fires at canceledAt + (PAID_GRACE_DAYS - GRACE_EXPIRY_WARNING_OFFSET_DAYS).
 */
export const GRACE_EXPIRY_WARNING_OFFSET_DAYS = 2 as const;
```

Add to `packages/shared/src/index.ts`:

```typescript
export * from './billing/lifecycle-constants';
```

- [ ] **Step 4: Run test — expect PASS**

```bash
pnpm --filter @propertypro/shared exec vitest run src/__tests__/lifecycle-constants.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/billing/lifecycle-constants.ts \
  packages/shared/src/__tests__/lifecycle-constants.test.ts \
  packages/shared/src/index.ts
git commit -m "$(cat <<'EOF'
feat(shared): add PAID_GRACE_DAYS=7 lifecycle constant for Public GA

Single source for paid grace period math and email scheduling.
EOF
)"
```

---

### Task 2: Grace-aware subscription guard

**Files:**
- Modify: `apps/web/src/lib/middleware/subscription-guard.ts`
- Create: `apps/web/__tests__/billing/subscription-guard-grace.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/web/__tests__/billing/subscription-guard-grace.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock the unscoped DB client
vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: vi.fn(),
}));
vi.mock('@propertypro/db', () => ({ communities: {} }));
vi.mock('@propertypro/db/filters', () => ({ eq: vi.fn() }));

import { createUnscopedClient } from '@propertypro/db/unsafe';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import { PAID_GRACE_DAYS } from '@propertypro/shared';

function makeMockDb(row: {
  subscriptionStatus: string | null;
  freeAccessExpiresAt: Date | null;
  subscriptionCanceledAt: Date | null;
}) {
  const selectResult = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([row]),
  };
  const db = { select: vi.fn().mockReturnValue(selectResult) };
  (createUnscopedClient as ReturnType<typeof vi.fn>).mockReturnValue(db);
  return db;
}

const MS_PER_DAY = 86_400_000;

describe('requireActiveSubscriptionForMutation — grace window', () => {
  it('allows mutations when canceled within 7-day grace', async () => {
    const canceledAt = new Date(Date.now() - 2 * MS_PER_DAY); // 2 days ago
    makeMockDb({ subscriptionStatus: 'canceled', freeAccessExpiresAt: null, subscriptionCanceledAt: canceledAt });
    await expect(requireActiveSubscriptionForMutation(1)).resolves.toBeUndefined();
  });

  it('blocks mutations when canceled and grace expired', async () => {
    const canceledAt = new Date(Date.now() - (PAID_GRACE_DAYS + 1) * MS_PER_DAY);
    makeMockDb({ subscriptionStatus: 'canceled', freeAccessExpiresAt: null, subscriptionCanceledAt: canceledAt });
    await expect(requireActiveSubscriptionForMutation(1)).rejects.toMatchObject({
      statusCode: 403,
      code: 'SUBSCRIPTION_REQUIRED',
    });
  });

  it('blocks immediately for unpaid (no grace)', async () => {
    makeMockDb({ subscriptionStatus: 'unpaid', freeAccessExpiresAt: null, subscriptionCanceledAt: null });
    await expect(requireActiveSubscriptionForMutation(1)).rejects.toMatchObject({
      code: 'SUBSCRIPTION_REQUIRED',
    });
  });

  it('blocks immediately for canceled with null canceledAt (defensive)', async () => {
    makeMockDb({ subscriptionStatus: 'canceled', freeAccessExpiresAt: null, subscriptionCanceledAt: null });
    await expect(requireActiveSubscriptionForMutation(1)).rejects.toMatchObject({
      code: 'SUBSCRIPTION_REQUIRED',
    });
  });

  it('free_access_expires_at overrides canceled-past-grace', async () => {
    const canceledAt = new Date(Date.now() - 30 * MS_PER_DAY);
    const freeAccess = new Date(Date.now() + 10 * MS_PER_DAY);
    makeMockDb({ subscriptionStatus: 'canceled', freeAccessExpiresAt: freeAccess, subscriptionCanceledAt: canceledAt });
    await expect(requireActiveSubscriptionForMutation(1)).resolves.toBeUndefined();
  });

  it('allows trialing', async () => {
    makeMockDb({ subscriptionStatus: 'trialing', freeAccessExpiresAt: null, subscriptionCanceledAt: null });
    await expect(requireActiveSubscriptionForMutation(1)).resolves.toBeUndefined();
  });

  it('allows active', async () => {
    makeMockDb({ subscriptionStatus: 'active', freeAccessExpiresAt: null, subscriptionCanceledAt: null });
    await expect(requireActiveSubscriptionForMutation(1)).resolves.toBeUndefined();
  });

  it('allows null status (fail-open for unprovisioned)', async () => {
    makeMockDb({ subscriptionStatus: null, freeAccessExpiresAt: null, subscriptionCanceledAt: null });
    await expect(requireActiveSubscriptionForMutation(1)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
pnpm --filter @propertypro/web exec vitest run __tests__/billing/subscription-guard-grace.test.ts
```

- [ ] **Step 3: Update subscription guard**

In `apps/web/src/lib/middleware/subscription-guard.ts`:

1. Add `PAID_GRACE_DAYS` import from `@propertypro/shared`
2. Add `subscriptionCanceledAt` to the select
3. Add grace-window check before the hard lock

```typescript
import { PAID_GRACE_DAYS } from '@propertypro/shared';

const MS_PER_DAY = 86_400_000;

// ... inside requireActiveSubscriptionForMutation, after reading rows:

const status = rows[0]?.subscriptionStatus ?? null;
const freeAccessExpiresAt = rows[0]?.freeAccessExpiresAt ?? null;
const canceledAt = rows[0]?.subscriptionCanceledAt ?? null;

// Free access overrides locked subscription status (existing behavior)
if (freeAccessExpiresAt && freeAccessExpiresAt > new Date()) {
  return;
}

// 7-day grace window after cancellation
if (
  status === 'canceled' &&
  canceledAt !== null &&
  Date.now() < canceledAt.getTime() + PAID_GRACE_DAYS * MS_PER_DAY
) {
  return;
}

// Treat unknown/null status as active (fail-open)
if (status !== null && LOCKED_STATUSES.has(status)) {
  throw new AppError(
    'Your subscription is no longer active. Please reactivate to continue.',
    403,
    'SUBSCRIPTION_REQUIRED',
    { subscriptionStatus: status },
  );
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm --filter @propertypro/web exec vitest run __tests__/billing/subscription-guard-grace.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/middleware/subscription-guard.ts \
  apps/web/__tests__/billing/subscription-guard-grace.test.ts
git commit -m "$(cat <<'EOF'
fix(billing): add 7-day grace window to subscription guard

Canceled communities within PAID_GRACE_DAYS can still write mutations.
Replaces immediate 403 on 'canceled' status.
EOF
)"
```

---

### Task 3: Email + scheduler aligned to 7-day grace

**Files:**
- Modify: `packages/email/src/templates/subscription-canceled.tsx`
- Modify: `packages/email/src/templates/subscription-expiry-warning.tsx`
- Modify: `apps/web/src/lib/services/payment-alert-scheduler.ts`
- Modify: `apps/web/src/app/api/v1/webhooks/stripe/route.ts` (nextReminderAt on cancel)
- Modify: `apps/web/__tests__/billing/payment-scheduler.test.ts` (update assertions)

**Current behavior:**
- Cancel email: subject says "30-day grace period begins"; `gracePeriodEndDate = canceledAt + 30d`
- Day 23 reminder: "Portal access expires [canceledAt + 30d]"
- Webhook: `nextReminderAt = canceledAt + 23d`

**Target behavior:**
- Cancel email: subject "7-day grace period begins"; `gracePeriodEndDate = canceledAt + 7d`
- Day 5 reminder: "Access will be locked in 2 days. [Update payment]"
- Webhook: `nextReminderAt = canceledAt + 5d`

**Subject line constant approach:** add a `SUBSCRIPTION_CANCELED_EMAIL_SUBJECT` helper in the email package or hardcode the number directly (acceptable since `PAID_GRACE_DAYS` is exported from shared and can be imported).

- [ ] **Step 1: Update `subscription-canceled.tsx`**

Change:
```tsx
// BEFORE
const graceDays = 30;
// ...subject: `${communityName} subscription canceled — 30-day grace period begins`

// AFTER  
// Import PAID_GRACE_DAYS from @propertypro/shared
// subject: `${communityName} subscription canceled — ${PAID_GRACE_DAYS}-day grace period begins`
// gracePeriodEndDate prop stays but reflects canceledAt + 7d from scheduler
```

Update template copy: "You have 7 days of full access" (was 30).

- [ ] **Step 2: Update `subscription-expiry-warning.tsx`**

Update copy to reference 7-day window and urgency. The `expiryDate` prop is computed by the scheduler — this is only copy.

- [ ] **Step 3: Update `payment-alert-scheduler.ts`**

```typescript
// sendSubscriptionCanceledEmail
const gracePeriodEnd = addDays(opts.canceledAt, PAID_GRACE_DAYS); // 7

// processPaymentReminders (post-cancel case)
const expiryDate = addDays(canceledAt, PAID_GRACE_DAYS); // 7
// subject: `Final warning: ${community.name} access locked in 2 days`
```

- [ ] **Step 4: Update webhook — `nextReminderAt` on cancel**

In `apps/web/src/app/api/v1/webhooks/stripe/route.ts`, find the cancel handler calls to `cancelCommunitySubscriptionByStripeSubscriptionIfFirst` / `cancelCommunitySubscriptionByIdIfFirst`:

```typescript
// BEFORE
const DAY_23_MS = 23 * 24 * 60 * 60 * 1000;
nextReminderAt: new Date(now.getTime() + DAY_23_MS), // Day 23

// AFTER
import { PAID_GRACE_DAYS, GRACE_EXPIRY_WARNING_OFFSET_DAYS } from '@propertypro/shared';
const warningDay = PAID_GRACE_DAYS - GRACE_EXPIRY_WARNING_OFFSET_DAYS; // 5
nextReminderAt: new Date(now.getTime() + warningDay * 24 * 60 * 60 * 1000),
```

- [ ] **Step 5: Run existing scheduler/webhook tests; update assertions**

```bash
pnpm --filter @propertypro/web exec vitest run __tests__/billing/
```

Fix any `expect(…).toContain('30')` or `DAY_23` assertions to match 7d/5d.

- [ ] **Step 6: Commit**

```bash
git add \
  packages/email/src/templates/subscription-canceled.tsx \
  packages/email/src/templates/subscription-expiry-warning.tsx \
  apps/web/src/lib/services/payment-alert-scheduler.ts \
  apps/web/src/app/api/v1/webhooks/stripe/route.ts
git commit -m "$(cat <<'EOF'
fix(billing): align cancel emails to 7-day grace (replace 30-day fiction)

Email subject, body, and reminder ladder now match the guard grace window.
nextReminderAt fires at Day 5 (2 days before lock).
EOF
)"
```

---

### Task 4: Must-guard route additions (~14 routes)

**Files:** All 14 routes listed in the guard inventory "must-guard additions" section.

This task is mechanical: one-liner per route, immediately after the existing `assertNotDemoGrace(communityId)` call.

- [ ] **Step 1: Write guard-coverage smoke test**

```typescript
// apps/web/__tests__/billing/must-guard-routes.test.ts
// Import each route handler and check that calling it with a canceled-past-grace
// communityId returns 403 SUBSCRIPTION_REQUIRED.
// Use the same mock pattern as subscription-guard-grace.test.ts.
// Spot-check 3–4 must-guard routes (violations, arc, polls, elections/open).
```

- [ ] **Step 2: Add `requireActiveSubscriptionForMutation` to each must-guard route**

For each route file, find the `assertNotDemoGrace` call and add:

```typescript
await assertNotDemoGrace(communityId);
await requireActiveSubscriptionForMutation(communityId); // Wave 1b — soft lock
```

Ensure `requireActiveSubscriptionForMutation` is imported from `@/lib/middleware/subscription-guard`.

Routes to update:
- `violations/route.ts` (POST mutations)
- `violations/[id]/fine/route.ts`
- `violations/[id]/notice/route.ts`
- `violations/[id]/resolve/route.ts`
- `violations/[id]/dismiss/route.ts`
- `arc/route.ts` (POST)
- `arc/[id]/decide/route.ts`
- `arc/[id]/review/route.ts`
- `polls/route.ts` (POST)
- `elections/[id]/open/route.ts`
- `elections/[id]/close/route.ts`
- `elections/[id]/certify/route.ts`
- `transparency/settings/route.ts`
- `import-residents/route.ts`

- [ ] **Step 3: Run typecheck**

```bash
pnpm --filter @propertypro/web typecheck
```

- [ ] **Step 4: Commit**

```bash
git add \
  apps/web/src/app/api/v1/violations/route.ts \
  apps/web/src/app/api/v1/violations/\[id\]/fine/route.ts \
  apps/web/src/app/api/v1/violations/\[id\]/notice/route.ts \
  apps/web/src/app/api/v1/violations/\[id\]/resolve/route.ts \
  apps/web/src/app/api/v1/violations/\[id\]/dismiss/route.ts \
  apps/web/src/app/api/v1/arc/route.ts \
  apps/web/src/app/api/v1/arc/\[id\]/decide/route.ts \
  apps/web/src/app/api/v1/arc/\[id\]/review/route.ts \
  apps/web/src/app/api/v1/polls/route.ts \
  apps/web/src/app/api/v1/elections/\[id\]/open/route.ts \
  apps/web/src/app/api/v1/elections/\[id\]/close/route.ts \
  apps/web/src/app/api/v1/elections/\[id\]/certify/route.ts \
  apps/web/src/app/api/v1/transparency/settings/route.ts \
  apps/web/src/app/api/v1/import-residents/route.ts
git commit -m "$(cat <<'EOF'
fix(billing): extend subscription guard to must-guard mutation routes

14 high-impact admin mutation routes now respect soft lock.
Exempt: reads, resident-facing, billing, support, emergency, PM routes.
EOF
)"
```

---

### Task 5: Shell context + minimal grace/lock banners

**Files:**
- Modify: `apps/web/src/lib/request/page-shell-context.ts`
- Modify: `apps/web/src/components/layout/app-shell.tsx`

- [ ] **Step 1: Add `subscriptionCanceledAt` to shell context**

In `page-shell-context.ts`, add `subscriptionCanceledAt` to the unscoped select on the communities row (already has `subscriptionStatus` and `freeAccessExpiresAt`).

Pass it through `ShellContext` type → `AppShell` props.

- [ ] **Step 2: Add grace and soft-lock banners to `AppShell`**

```tsx
// Derive grace state
const PAID_GRACE_MS = PAID_GRACE_DAYS * 24 * 60 * 60 * 1000;
const isInGrace =
  subscriptionStatus === 'canceled' &&
  subscriptionCanceledAt !== null &&
  Date.now() < new Date(subscriptionCanceledAt).getTime() + PAID_GRACE_MS;

const isSoftLocked =
  LOCKED_STATUSES.has(subscriptionStatus ?? '') && !isInGrace && !freeAccessActive;

// Render above existing banners:
{isInGrace && (
  <GraceBanner
    gracePeriodEndsAt={new Date(new Date(subscriptionCanceledAt!).getTime() + PAID_GRACE_MS)}
    billingPortalHref={billingPortalHref}
  />
)}
{isSoftLocked && (
  <SoftLockBanner billingPortalHref={billingPortalHref} />
)}
```

Use the existing banner component pattern in `app-shell.tsx`. Keep banners as simple `<div>` elements matching existing `past_due` / `FreeAccessBanner` style — **no new design tokens in Wave 1b**.

- [ ] **Step 3: Typecheck and visual smoke**

```bash
pnpm --filter @propertypro/web typecheck
# Then manually trigger a canceled-within-grace community and verify banner appears.
```

- [ ] **Step 4: Commit**

```bash
git add \
  apps/web/src/lib/request/page-shell-context.ts \
  apps/web/src/components/layout/app-shell.tsx
git commit -m "$(cat <<'EOF'
feat(billing): grace and soft-lock banners in AppShell

7-day grace banner + post-grace soft-lock banner replacing silent 403.
EOF
)"
```

---

### Task 6: Integration test — cancel → grace → lock

**Files:**
- Create: `apps/web/__tests__/lifecycle/cancel-grace-lock.integration.test.ts`

This is an integration test requiring a real DB connection. Follow the `no-mock-guard` rule: no `vi.mock()` in this file.

- [ ] **Step 1: Write the test**

The test should:
1. Create a test community with an active subscription
2. Simulate the cancel webhook flow (set `subscription_status = 'canceled'`, `subscription_canceled_at = now`)
3. Assert that `requireActiveSubscriptionForMutation` allows a write (within grace)
4. Advance the effective "now" to `canceledAt + 8 days`
5. Assert that `requireActiveSubscriptionForMutation` throws 403

Since the guard uses `Date.now()` internally, this requires either a test helper that accepts a `now` param (preferred) or time mocking via `vi.setSystemTime`.

```typescript
// apps/web/__tests__/lifecycle/cancel-grace-lock.integration.test.ts
// Integration: cancel → grace → lock
// No vi.mock() — uses real DB via createUnscopedClient()
// Requires: DATABASE_URL in env (run via scripts/with-env-local.sh)
```

Core assertions:
- `status=canceled, canceledAt=2d ago` → ALLOW
- `status=canceled, canceledAt=(PAID_GRACE_DAYS+1)d ago` → THROW 403
- `status=canceled, canceledAt=8d ago, freeAccessExpiresAt=future` → ALLOW
- `status=unpaid, canceledAt=null` → THROW 403 immediately (no grace for unpaid)

- [ ] **Step 2: Run integration test**

```bash
scripts/with-env-local.sh pnpm exec vitest run \
  apps/web/__tests__/lifecycle/cancel-grace-lock.integration.test.ts \
  --config apps/web/vitest.integration.config.ts
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/__tests__/lifecycle/cancel-grace-lock.integration.test.ts
git commit -m "$(cat <<'EOF'
test(billing): integration test for cancel→grace→lock lifecycle

Covers grace-window allow, post-grace block, free-access override,
and unpaid immediate-lock cases.
EOF
)"
```

---

### Task 7: Lifecycle matrix doc + Wave 1b verification gate

- [ ] **Step 1: Publish lifecycle matrix as `/docs/adr/ADR-009-paid-grace-lifecycle.md`** *(optional — can inline in PR description instead)*

Capture the lifecycle matrix table from this plan in a short ADR. Reference the three systems, the `PAID_GRACE_DAYS` constant, and the guard inventory decision.

- [ ] **Step 2: Unit + typecheck slice**

```bash
pnpm --filter @propertypro/shared exec vitest run src/__tests__/lifecycle-constants.test.ts
pnpm --filter @propertypro/web exec vitest run \
  __tests__/billing/subscription-guard-grace.test.ts \
  __tests__/billing/must-guard-routes.test.ts
pnpm --filter @propertypro/web typecheck
```

Expected: all PASS.

- [ ] **Step 3: Integration test slice (requires DB)**

```bash
scripts/with-env-local.sh pnpm exec vitest run \
  apps/web/__tests__/lifecycle/cancel-grace-lock.integration.test.ts \
  --config apps/web/vitest.integration.config.ts
```

Expected: PASS.

- [ ] **Step 4: Manual lifecycle smoke**

1. In local Stripe test mode: trigger `customer.subscription.deleted` webhook → verify Day 5 `nextReminderAt` set in DB
2. With `subscription_canceled_at = now`, call a must-guard route → expect 200 (in grace)
3. With `subscription_canceled_at = now - 8d`, call same route → expect 403 `SUBSCRIPTION_REQUIRED`
4. Open app shell → verify grace banner appears for case 2
5. Demo community: cancel → verify `assertNotDemoGrace` still independent

- [ ] **Step 5: Open PR summarizing Wave 1b**

PR body should link PRD §8, include the lifecycle matrix table, and list Wave 2 as still TODO.

---

## Spec Coverage (self-review)

| Wave 1b requirement | Task |
|---|---|
| Three lifecycle inventory / matrix | Tasks 1–2 (code) + lifecycle matrix table in this doc |
| `grace_until` / 7-day grace in guard | Task 2 |
| Emails aligned to 7-day | Task 3 |
| Guard extended to must-guard routes only | Task 4 |
| No blanket spray | Task 4 (explicit exempt list) |
| Demo guard unchanged | Verified — not touched |
| No fourth status system | Verified — no new column, no new enum |
| `free_access_expires_at` preserved | Task 2 (override preserved first) |
| UI grace + soft-lock banners | Task 5 |
| Integration tests cancel→grace→lock | Task 6 |

**Not in this plan (Wave 3):** Grace banner craft polish, full dunning UX, `maxAdmins: 3` invite flow, compliance writes explicitly allowed during grace (they already are — documents/announcements/meetings are already guarded to allow during grace since grace = allow).

---

## Edge Cases Covered

| Case | How handled |
|---|---|
| Webhook out of order — subscription.updated arrives after deleted | `cancelCommunitySubscriptionByIdIfFirst` is atomic/idempotent |
| Card update mid-grace → back to `active` | `markCommunityPaymentSucceeded` clears status → guard allows normally |
| `incomplete_expired` after failed Checkout | No canceledAt → immediate lock (correct) |
| Demo cancel → paid grace confusion | Demo guard fires first, independent path |
| `past_due` for 20 days (Stripe retry loop) | Still allowed; locks only on `canceled`/`unpaid` after retries exhaust |
| Grace ends Friday night | `PAID_GRACE_DAYS` is pure millisecond math; no weekend adjustment needed for lock (lock happens when they next try to write, which will 403 cleanly with billing CTA) |

---

## Open Engineering Notes (not blockers)

1. **`past_due` → eventual cancel:** Today `past_due` allows all mutations. When Stripe retries exhaust and transitions to `unpaid` or `canceled`, the 7-day grace (cancel path) or immediate lock (unpaid path) kicks in. This is coherent. No change to `past_due` behavior in Wave 1b.

2. **`LOCKED_STATUSES` set:** `'canceled'` remains in `LOCKED_STATUSES` for the hard-lock case after grace. The grace-window check is a bypass that runs before the set check.

3. **`subscriptionCanceledAt` DB column:** Already exists as `subscription_canceled_at` in the schema (`stripe-webhook-service.ts` writes it). No migration needed.

4. **Soft-lock compliance doc writes:** Documents, meetings, announcements are already subscription-guarded and will naturally pass during grace. The PRD intent ("compliance doc writes allowed through grace") is already satisfied because grace = allow.

---

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-07-11-wave-1b-access-lifecycle.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks
2. **Inline Execution** — execute tasks in this session with checkpoints

Which approach?
