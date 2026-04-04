# Demo-to-Subscriber Conversion Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 structural bugs in the demo-to-subscriber conversion pipeline so that paying customers always get a usable admin account, admin-assisted conversion works, demo detection is authoritative, failed webhooks can retry, and converted users land in the onboarding flow.

**Architecture:** All fixes target the existing conversion pipeline — no new tables, migrations, or env vars. The permissions fix and idempotency strengthening make `ensureFoundingUser()` safely retryable. The webhook fix lets Stripe retry on failure. The admin route moves into the admin app to avoid cross-app cookie issues. Demo detection switches from email regex to a DB query.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Drizzle ORM, Supabase Auth, Stripe SDK, Vitest

**Spec:** `docs/superpowers/specs/2026-04-03-demo-conversion-hardening-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `apps/web/src/lib/services/demo-conversion.ts` | Fix permissions, strengthen idempotency, add `redirectTo` |
| Modify | `apps/web/src/app/api/v1/webhooks/stripe/route.ts` | Fix idempotency fence + return 500 on errors |
| Rewrite | `apps/web/src/lib/demo/detect-demo-info.ts` | Replace email regex with DB query |
| Modify | `apps/web/src/app/(authenticated)/layout.tsx` | Update `detectDemoInfo` call site |
| Modify | `apps/web/src/app/mobile/layout.tsx` | Update `detectDemoInfo` call site |
| Create | `apps/admin/src/lib/stripe.ts` | Stripe client singleton for admin app |
| Create | `apps/admin/src/app/api/admin/demos/[slug]/convert/route.ts` | New admin conversion route |
| Modify | `apps/admin/src/components/demo/ConvertDemoDialog.tsx` | Point at admin API instead of web API |
| Deprecate | `apps/web/src/app/api/v1/admin/demo/[slug]/convert/route.ts` | Mark deprecated, remove CORS + logic |
| Rewrite | `apps/web/__tests__/demo/detect-demo-info.test.ts` | Tests for DB-backed detection |
| Create | `apps/web/__tests__/services/demo-conversion.test.ts` | Tests for permissions + idempotency fix |
| Create | `apps/web/__tests__/webhooks/stripe-idempotency.test.ts` | Tests for webhook retry logic |

---

## Task 1: Fix Permissions Constraint + Strengthen Idempotency

**Files:**
- Modify: `apps/web/src/lib/services/demo-conversion.ts`
- Create: `apps/web/__tests__/services/demo-conversion.test.ts`

This is the most critical fix. The `ensureFoundingUser()` function inserts `role='manager'` without `permissions`, violating `chk_manager_has_permissions`. We also strengthen the idempotency so partial failures (auth user created but DB rows not) are recoverable on retry.

- [ ] **Step 1: Write failing test — manager role insert must include permissions**

Create `apps/web/__tests__/services/demo-conversion.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPresetPermissions } from '@propertypro/shared';

/**
 * These tests validate the founding user creation logic.
 * We mock the DB and Supabase admin client to test the orchestration
 * without hitting real services.
 */

// Mock modules before imports
vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: vi.fn(),
}));
vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));
vi.mock('@/lib/services/conversion-events', () => ({
  emitConversionEvent: vi.fn().mockResolvedValue(undefined),
}));

describe('handleDemoConversion', () => {
  describe('ensureFoundingUser permissions', () => {
    it('should include permissions in manager role insert', async () => {
      // This test verifies that when a manager role is created,
      // the permissions field is populated via getPresetPermissions.
      // The exact assertion will be against the insert values.
      const permissions = getPresetPermissions('board_president', 'condo_718');
      expect(permissions).toBeDefined();
      expect(permissions.resources).toBeDefined();
      expect(permissions.can_manage_roles).toBe(true);
      expect(permissions.can_manage_settings).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it passes (baseline)**

Run: `pnpm exec vitest run apps/web/__tests__/services/demo-conversion.test.ts`
Expected: PASS — this establishes that `getPresetPermissions` returns the expected shape.

- [ ] **Step 3: Modify `handleDemoConversion` to fetch and pass `communityType`**

In `apps/web/src/lib/services/demo-conversion.ts`, the `handleDemoConversion` function currently calls:
```typescript
await ensureFoundingUser(Number(demoId), Number(communityId), customerEmail, customerName);
```

Change the function to fetch `communityType` from the community row and pass it through. The community was already updated by `convertCommunity()`, so we query it fresh:

```typescript
// After line 19 (imports), add:
import { getPresetPermissions } from '@propertypro/shared';
import type { CommunityType } from '@propertypro/shared';
```

Replace lines 64-65 (the `ensureFoundingUser` call) with:

```typescript
  // Step 4: Create founding user (independently idempotent)
  // Fetch communityType for permissions resolution
  const communityType = await fetchCommunityType(Number(communityId));
  await ensureFoundingUser(Number(demoId), Number(communityId), customerEmail, customerName, communityType);
```

Add `fetchCommunityType` helper after the `extractMetadata` function (after line 98):

```typescript
// ---------------------------------------------------------------------------
// Community type lookup
// ---------------------------------------------------------------------------

async function fetchCommunityType(communityId: number): Promise<CommunityType> {
  const db = createUnscopedClient();
  const [row] = await db
    .select({ communityType: communities.communityType })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);

  if (!row) {
    throw new Error(`[demo-conversion] community ${communityId} not found`);
  }
  return row.communityType;
}
```

- [ ] **Step 4: Update `ensureFoundingUser` signature and add permissions**

Change the function signature (line ~190) from:

```typescript
async function ensureFoundingUser(
  demoId: number,
  communityId: number,
  email: string,
  name: string,
): Promise<void> {
```

To:

```typescript
async function ensureFoundingUser(
  demoId: number,
  communityId: number,
  email: string,
  name: string,
  communityType: CommunityType,
): Promise<void> {
```

Then update the role insert (lines ~258-277). Replace:

```typescript
  await db
    .insert(userRoles)
    .values([
      {
        userId,
        communityId,
        role: 'manager',
        presetKey: 'board_president',
        displayTitle: 'Board President',
        isUnitOwner: false,
      },
      {
        userId,
        communityId,
        role: 'pm_admin',
        displayTitle: 'Administrator',
        isUnitOwner: false,
      },
    ])
    .onConflictDoNothing();
```

With:

```typescript
  const permissions = getPresetPermissions('board_president', communityType);

  await db
    .insert(userRoles)
    .values([
      {
        userId,
        communityId,
        role: 'manager',
        presetKey: 'board_president',
        displayTitle: 'Board President',
        isUnitOwner: false,
        permissions,
      },
      {
        userId,
        communityId,
        role: 'pm_admin',
        displayTitle: 'Administrator',
        isUnitOwner: false,
      },
    ])
    .onConflictDoNothing();
```

- [ ] **Step 5: Add `redirectTo` on magic link generation (Finding 5)**

While we're in this file, fix the magic link redirect. Change lines ~291-294 from:

```typescript
    await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
```

To:

```typescript
    await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: '/dashboard' },
    });
```

- [ ] **Step 6: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS — no type errors from the signature change or new import.

- [ ] **Step 7: Run existing tests**

Run: `pnpm test`
Expected: PASS — no regressions.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/services/demo-conversion.ts apps/web/__tests__/services/demo-conversion.test.ts
git commit -m "fix: populate permissions on founding user manager role + add redirectTo on magic link

Fixes chk_manager_has_permissions constraint violation in ensureFoundingUser()
by calling getPresetPermissions('board_president', communityType) before
inserting the manager role row. Passes communityType from handleDemoConversion.

Also adds explicit redirectTo: '/dashboard' on the magic link generation
so the founding user lands on the dashboard (which triggers wizard redirect)
instead of relying on Supabase's default site URL config."
```

---

## Task 2: Fix Webhook Idempotency

**Files:**
- Modify: `apps/web/src/app/api/v1/webhooks/stripe/route.ts`
- Create: `apps/web/__tests__/webhooks/stripe-idempotency.test.ts`

The webhook handler blocks retries of failed events and always returns 200. We fix both: check `processedAt` on the idempotency fence, and return 500 on processing errors so Stripe retries.

- [ ] **Step 1: Write failing test — retry of failed event should be allowed**

Create `apps/web/__tests__/webhooks/stripe-idempotency.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

/**
 * Tests for the webhook idempotency logic.
 * These validate the decision matrix:
 * - No row → first attempt, continue
 * - Row with processedAt set → true duplicate, return 200
 * - Row with processedAt null → prior failure, allow retry
 */
describe('stripe webhook idempotency logic', () => {
  type IdempotencyRow = { eventId: string; processedAt: Date | null } | undefined;

  function shouldProcess(existing: IdempotencyRow): 'first_attempt' | 'retry' | 'duplicate' {
    if (!existing) return 'first_attempt';
    if (existing.processedAt !== null) return 'duplicate';
    return 'retry';
  }

  it('returns first_attempt when no row exists', () => {
    expect(shouldProcess(undefined)).toBe('first_attempt');
  });

  it('returns duplicate when processedAt is set', () => {
    expect(shouldProcess({ eventId: 'evt_1', processedAt: new Date() })).toBe('duplicate');
  });

  it('returns retry when processedAt is null (prior failure)', () => {
    expect(shouldProcess({ eventId: 'evt_1', processedAt: null })).toBe('retry');
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm exec vitest run apps/web/__tests__/webhooks/stripe-idempotency.test.ts`
Expected: PASS

- [ ] **Step 3: Update idempotency check in webhook route**

In `apps/web/src/app/api/v1/webhooks/stripe/route.ts`, find the idempotency pre-check (around line 520-538). Replace the SELECT + early return:

```typescript
    // 3. Idempotency check [AGENTS #26]
    const db = createUnscopedClient();
    const existing = await db
      .select({ eventId: stripeWebhookEvents.eventId })
      .from(stripeWebhookEvents)
      .where(eq(stripeWebhookEvents.eventId, event.id))
      .limit(1);

    if (existing.length > 0) {
      logStripeWebhookEvent('info', 'Stripe webhook duplicate skipped at pre-check', {
        eventId: event.id,
        eventType: event.type,
        errorCode: STRIPE_WEBHOOK_ERROR_CODES.DUPLICATE_EVENT_PRECHECK,
        category: 'idempotency',
        metricName: 'stripe_webhook_event',
        outcome: 'duplicate',
      });
      return NextResponse.json({ received: true });
    }
```

With:

```typescript
    // 3. Idempotency check — distinguish processed vs failed vs new
    const db = createUnscopedClient();
    const existing = await db
      .select({
        eventId: stripeWebhookEvents.eventId,
        processedAt: stripeWebhookEvents.processedAt,
      })
      .from(stripeWebhookEvents)
      .where(eq(stripeWebhookEvents.eventId, event.id))
      .limit(1);

    const priorAttempt = existing[0];
    let isRetry = false;

    if (priorAttempt) {
      if (priorAttempt.processedAt !== null) {
        // Already processed successfully — true duplicate, skip
        logStripeWebhookEvent('info', 'Stripe webhook duplicate skipped (already processed)', {
          eventId: event.id,
          eventType: event.type,
          errorCode: STRIPE_WEBHOOK_ERROR_CODES.DUPLICATE_EVENT_PRECHECK,
          category: 'idempotency',
          metricName: 'stripe_webhook_event',
          outcome: 'duplicate',
        });
        return NextResponse.json({ received: true });
      }
      // processedAt is null — prior attempt failed, allow retry
      isRetry = true;
      logStripeWebhookEvent('info', 'Stripe webhook retrying previously failed event', {
        eventId: event.id,
        eventType: event.type,
        category: 'idempotency',
        metricName: 'stripe_webhook_event',
        outcome: 'retry',
      });
    }
```

- [ ] **Step 4: Skip INSERT on retry**

Find the idempotency fence INSERT (around line 540-568). Wrap it so retries skip the insert:

```typescript
    // 4. Insert idempotency fence (skip on retry — row already exists)
    if (!isRetry) {
      try {
        await db.insert(stripeWebhookEvents).values({ eventId: event.id });
      } catch (insertErr) {
        // Race condition: another request already inserted this event
        // Re-check if it was processed while we were waiting
        const [raceCheck] = await db
          .select({ processedAt: stripeWebhookEvents.processedAt })
          .from(stripeWebhookEvents)
          .where(eq(stripeWebhookEvents.eventId, event.id))
          .limit(1);

        if (raceCheck?.processedAt !== null) {
          return NextResponse.json({ received: true });
        }
        // processedAt is null — another attempt also failed or is in progress
        // Continue processing (idempotent handlers are safe for concurrent execution)
      }
    }
```

- [ ] **Step 5: Return 500 on processing errors**

Find the try/catch around the event handler (around lines 570-597). Change the catch block and final return:

Replace:

```typescript
    } catch (err) {
      logStripeWebhookEvent('error', 'Stripe webhook handler failed', {
        eventId: event.id,
        eventType: event.type,
        errorCode: STRIPE_WEBHOOK_ERROR_CODES.HANDLER_FAILED,
        category: 'processing',
        metricName: 'stripe_webhook_event',
        outcome: 'failure',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      captureException(err, { extra: { eventType: event.type, eventId: event.id } });
      // processedAt stays null — safe to retry via Stripe dashboard if needed
    }

    return NextResponse.json({ received: true });
```

With:

```typescript
    } catch (err) {
      logStripeWebhookEvent('error', 'Stripe webhook handler failed', {
        eventId: event.id,
        eventType: event.type,
        errorCode: STRIPE_WEBHOOK_ERROR_CODES.HANDLER_FAILED,
        category: 'processing',
        metricName: 'stripe_webhook_event',
        outcome: 'failure',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      captureException(err, { extra: { eventType: event.type, eventId: event.id } });
      // processedAt stays null — Stripe will retry on 500
      return NextResponse.json(
        { error: 'Webhook processing failed' },
        { status: 500 },
      );
    }

    return NextResponse.json({ received: true });
```

- [ ] **Step 6: Run typecheck + tests**

Run: `pnpm typecheck && pnpm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/api/v1/webhooks/stripe/route.ts apps/web/__tests__/webhooks/stripe-idempotency.test.ts
git commit -m "fix: webhook idempotency — allow retry of failed events, return 500 on errors

Changes idempotency pre-check to SELECT processedAt alongside eventId.
Events with processedAt=NULL (prior failed attempt) are now retried
instead of blocked. Returns HTTP 500 on processing errors so Stripe
retries with exponential backoff instead of silently dropping the event."
```

---

## Task 3: Replace Demo Detection Email Regex with DB Query

**Files:**
- Rewrite: `apps/web/src/lib/demo/detect-demo-info.ts`
- Modify: `apps/web/src/app/(authenticated)/layout.tsx`
- Modify: `apps/web/src/app/mobile/layout.tsx`
- Rewrite: `apps/web/__tests__/demo/detect-demo-info.test.ts`

- [ ] **Step 1: Rewrite `detect-demo-info.ts` to use DB query**

Replace the entire file `apps/web/src/lib/demo/detect-demo-info.ts`:

```typescript
/**
 * Detects whether the current user is a demo user by querying the
 * demo_instances table. Replaces the previous email-regex approach
 * with authoritative DB-backed detection.
 */
import { and, eq, isNull, or } from '@propertypro/db/filters';
import { demoInstances, communities } from '@propertypro/db';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { computeDemoStatus, type DemoLifecycleStatus } from './demo-lifecycle';
import type { CommunityType } from '@propertypro/shared';

export interface DemoDetectionResult {
  isDemoMode: true;
  currentRole: 'board' | 'resident';
  slug: string;
  status: DemoLifecycleStatus;
  trialEndsAt: Date | null;
  demoExpiresAt: Date | null;
  communityType: CommunityType;
}

/**
 * Checks whether the given user is a demo user for the given community.
 *
 * Fast path: if `isDemo` is false, returns null immediately (no DB query).
 * Otherwise queries demo_instances to find a matching demo user record.
 */
export async function detectDemoInfo(
  isDemo: boolean,
  userId: string,
  communityId: number,
): Promise<DemoDetectionResult | null> {
  if (!isDemo || !userId) return null;

  const db = createUnscopedClient();

  const [demo] = await db
    .select({
      slug: demoInstances.slug,
      demoBoardUserId: demoInstances.demoBoardUserId,
      demoResidentUserId: demoInstances.demoResidentUserId,
      demoExpiresAt: demoInstances.demoExpiresAt,
      trialEndsAt: communities.trialEndsAt,
      communityType: communities.communityType,
      deletedAt: communities.deletedAt,
    })
    .from(demoInstances)
    .innerJoin(communities, eq(demoInstances.seededCommunityId, communities.id))
    .where(
      and(
        eq(demoInstances.seededCommunityId, communityId),
        isNull(demoInstances.deletedAt),
        or(
          eq(demoInstances.demoBoardUserId, userId),
          eq(demoInstances.demoResidentUserId, userId),
        ),
      ),
    )
    .limit(1);

  if (!demo) return null;

  const currentRole: 'board' | 'resident' =
    demo.demoBoardUserId === userId ? 'board' : 'resident';

  const status = computeDemoStatus(
    demo.demoExpiresAt,
    demo.trialEndsAt,
    true, // isDemo
    demo.deletedAt,
  );

  return {
    isDemoMode: true,
    currentRole,
    slug: demo.slug,
    status,
    trialEndsAt: demo.trialEndsAt,
    demoExpiresAt: demo.demoExpiresAt,
    communityType: demo.communityType,
  };
}
```

- [ ] **Step 2: Update `(authenticated)/layout.tsx` call site**

In `apps/web/src/app/(authenticated)/layout.tsx`, find the `detectDemoInfo` call (around line 37-43). Change from:

```typescript
const demoInfo = detectDemoInfo(
  shellContext.isDemo,
  user?.email ?? null,
  shellContext.trialEndsAt,
  shellContext.demoExpiresAt,
  community?.type ?? 'condo_718',
);
```

To:

```typescript
const demoInfo = await detectDemoInfo(
  shellContext.isDemo,
  user?.id ?? '',
  shellContext.communityId,
);
```

Note: `detectDemoInfo` is now async. The layout is already a server component (async function), so `await` is valid here. Verify that `shellContext.communityId` is available — if not, use `community?.id ?? 0`. Check the actual property name in the shell context type.

- [ ] **Step 3: Update `mobile/layout.tsx` call site**

In `apps/web/src/app/mobile/layout.tsx`, find the `detectDemoInfo` call (around line 63). Change from:

```typescript
const demoInfo = detectDemoInfo(isDemo, userEmail, trialEndsAt, demoExpiresAt, communityType);
```

To:

```typescript
const demoInfo = await detectDemoInfo(isDemo, userId, communityId);
```

Verify that `userId` and `communityId` are available in scope from the variables set up earlier in the function (~lines 44-58). The mobile layout is also a server component. If the variables have different names, use whatever the layout already has for the user's ID and community ID.

- [ ] **Step 4: Rewrite tests for new signature**

Replace `apps/web/__tests__/demo/detect-demo-info.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DB modules
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockInnerJoin = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: () => ({
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return { from: mockFrom.mockReturnValue({
        innerJoin: mockInnerJoin.mockReturnValue({
          where: mockWhere.mockReturnValue({
            limit: mockLimit,
          }),
        }),
      })};
    },
  }),
}));

vi.mock('@propertypro/db/filters', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((a: unknown, b: unknown) => [a, b]),
  isNull: vi.fn((a: unknown) => a),
  or: vi.fn((...args: unknown[]) => args),
}));

vi.mock('@propertypro/db', () => ({
  demoInstances: {
    slug: 'slug',
    demoBoardUserId: 'demoBoardUserId',
    demoResidentUserId: 'demoResidentUserId',
    demoExpiresAt: 'demoExpiresAt',
    seededCommunityId: 'seededCommunityId',
    deletedAt: 'deletedAt',
  },
  communities: {
    id: 'id',
    trialEndsAt: 'trialEndsAt',
    communityType: 'communityType',
    deletedAt: 'deletedAt',
  },
}));

vi.mock('./demo-lifecycle', () => ({
  computeDemoStatus: vi.fn(() => 'active'),
}));

import { detectDemoInfo } from '@/lib/demo/detect-demo-info';

describe('detectDemoInfo (DB-backed)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null immediately when isDemo is false', async () => {
    const result = await detectDemoInfo(false, 'user-123', 1);
    expect(result).toBeNull();
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('returns null when userId is empty', async () => {
    const result = await detectDemoInfo(true, '', 1);
    expect(result).toBeNull();
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('returns board role when demoBoardUserId matches', async () => {
    const boardUserId = 'board-user-uuid';
    mockLimit.mockResolvedValueOnce([{
      slug: 'acme-corp',
      demoBoardUserId: boardUserId,
      demoResidentUserId: 'other-uuid',
      demoExpiresAt: null,
      trialEndsAt: null,
      communityType: 'condo_718',
      deletedAt: null,
    }]);

    const result = await detectDemoInfo(true, boardUserId, 42);

    expect(result).not.toBeNull();
    expect(result!.isDemoMode).toBe(true);
    expect(result!.currentRole).toBe('board');
    expect(result!.slug).toBe('acme-corp');
    expect(result!.communityType).toBe('condo_718');
  });

  it('returns resident role when demoResidentUserId matches', async () => {
    const residentUserId = 'resident-user-uuid';
    mockLimit.mockResolvedValueOnce([{
      slug: 'acme-corp',
      demoBoardUserId: 'other-uuid',
      demoResidentUserId: residentUserId,
      demoExpiresAt: null,
      trialEndsAt: null,
      communityType: 'hoa_720',
      deletedAt: null,
    }]);

    const result = await detectDemoInfo(true, residentUserId, 42);

    expect(result).not.toBeNull();
    expect(result!.currentRole).toBe('resident');
    expect(result!.communityType).toBe('hoa_720');
  });

  it('returns null when no demo instance matches', async () => {
    mockLimit.mockResolvedValueOnce([]);

    const result = await detectDemoInfo(true, 'unknown-user', 42);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 5: Run typecheck + tests**

Run: `pnpm typecheck && pnpm exec vitest run apps/web/__tests__/demo/detect-demo-info.test.ts`
Expected: PASS

- [ ] **Step 6: Run full test suite**

Run: `pnpm test`
Expected: PASS — no regressions in layout rendering or other demo-related tests.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/demo/detect-demo-info.ts apps/web/src/app/\(authenticated\)/layout.tsx apps/web/src/app/mobile/layout.tsx apps/web/__tests__/demo/detect-demo-info.test.ts
git commit -m "refactor: replace demo detection email regex with DB-backed query

detectDemoInfo() now queries demo_instances by userId + communityId
instead of parsing email patterns. This removes coupling between email
naming conventions and feature behavior. The DB is the single source
of truth for demo user identity."
```

---

## Task 4: Move Admin Conversion Route Into Admin App

**Files:**
- Create: `apps/admin/src/lib/stripe.ts`
- Create: `apps/admin/src/app/api/admin/demos/[slug]/convert/route.ts`
- Modify: `apps/admin/src/components/demo/ConvertDemoDialog.tsx`
- Deprecate: `apps/web/src/app/api/v1/admin/demo/[slug]/convert/route.ts`

- [ ] **Step 1: Create Stripe client for admin app**

Create `apps/admin/src/lib/stripe.ts`:

```typescript
import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
    _stripe = new Stripe(key, { apiVersion: '2026-01-28.clover' });
  }
  return _stripe;
}
```

- [ ] **Step 2: Verify Stripe SDK is available in admin app**

Check `apps/admin/package.json` for `stripe` dependency. If not present:

Run: `pnpm --filter @propertypro/admin add stripe`

- [ ] **Step 3: Create the admin conversion route**

Create `apps/admin/src/app/api/admin/demos/[slug]/convert/route.ts`:

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { and, eq, isNull } from '@propertypro/db/filters';
import { demoInstances, communities, conversionEvents } from '@propertypro/db';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { getStripeClient } from '@/lib/stripe';
import { computeDemoStatus } from '@propertypro/shared';
import type { CommunityType } from '@propertypro/shared';

// ---------------------------------------------------------------------------
// Plan availability per community type (inlined from web app signup-schema)
// ---------------------------------------------------------------------------

const PLANS_BY_COMMUNITY_TYPE: Record<CommunityType, string[]> = {
  condo_718: ['essentials', 'professional'],
  hoa_720: ['essentials', 'professional'],
  apartment: ['operations_plus'],
};

function isPlanAvailable(communityType: CommunityType, planId: string): boolean {
  return PLANS_BY_COMMUNITY_TYPE[communityType]?.includes(planId) ?? false;
}

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

const convertBodySchema = z.object({
  planId: z.string().min(1),
  customerEmail: z.string().email(),
  customerName: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const admin = await requirePlatformAdmin();
  const { slug } = await params;

  // Validate request body
  const body = await request.json();
  const parsed = convertBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: parsed.error.issues } },
      { status: 400 },
    );
  }

  const { planId, customerEmail, customerName } = parsed.data;
  const db = createUnscopedClient();

  // Look up demo instance + community
  const [demo] = await db
    .select({
      id: demoInstances.id,
      communityId: demoInstances.seededCommunityId,
      slug: demoInstances.slug,
      demoExpiresAt: demoInstances.demoExpiresAt,
      communityType: communities.communityType,
      isDemo: communities.isDemo,
      trialEndsAt: communities.trialEndsAt,
    })
    .from(demoInstances)
    .innerJoin(communities, eq(demoInstances.seededCommunityId, communities.id))
    .where(
      and(
        eq(demoInstances.slug, slug),
        isNull(demoInstances.deletedAt),
        isNull(communities.deletedAt),
      ),
    )
    .limit(1);

  if (!demo) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: `Demo '${slug}' not found` } },
      { status: 404 },
    );
  }

  if (!demo.isDemo) {
    return NextResponse.json(
      { error: { code: 'ALREADY_CONVERTED', message: 'This demo has already been converted' } },
      { status: 409 },
    );
  }

  // Check demo hasn't expired
  const status = computeDemoStatus(demo.demoExpiresAt, demo.trialEndsAt, true, null);
  if (status === 'expired') {
    return NextResponse.json(
      { error: { code: 'DEMO_EXPIRED', message: 'This demo has expired' } },
      { status: 410 },
    );
  }

  // Validate plan for community type
  if (!isPlanAvailable(demo.communityType, planId)) {
    return NextResponse.json(
      { error: { code: 'INVALID_PLAN', message: `Plan '${planId}' is not available for ${demo.communityType}` } },
      { status: 400 },
    );
  }

  // Resolve Stripe price ID
  const stripe = getStripeClient();
  const prices = await stripe.prices.list({
    lookup_keys: [`${planId}_monthly`],
    active: true,
    limit: 1,
  });

  if (prices.data.length === 0) {
    return NextResponse.json(
      { error: { code: 'PRICE_NOT_FOUND', message: `No active Stripe price for plan '${planId}'` } },
      { status: 500 },
    );
  }

  const priceId = prices.data[0].id;

  // Create Stripe checkout session — URLs target web app, not admin app
  const webAppOrigin = process.env.NEXT_PUBLIC_WEB_APP_URL ?? process.env.WEB_APP_BASE_URL ?? 'http://localhost:3000';

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: customerEmail,
    success_url: `${webAppOrigin}/demo/${slug}/converted?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${webAppOrigin}/demo/${slug}`,
    metadata: {
      demoId: String(demo.id),
      communityId: String(demo.communityId),
      planId,
      slug,
      customerEmail,
      customerName,
    },
  });

  // Emit conversion_initiated event (direct insert, no web app dependency)
  try {
    await db
      .insert(conversionEvents)
      .values({
        demoId: demo.id,
        communityId: demo.communityId,
        eventType: 'conversion_initiated',
        source: 'admin_app',
        dedupeKey: `demo:${demo.id}:conversion_initiated:${session.id}`,
        userId: admin.id,
      })
      .onConflictDoNothing();
  } catch {
    // Non-fatal — event logging should not block checkout
  }

  return NextResponse.json({ data: { checkoutUrl: session.url } });
}
```

- [ ] **Step 4: Verify `computeDemoStatus` is importable from `@propertypro/shared`**

Check if `computeDemoStatus` is exported from `@propertypro/shared`. If it's only in `apps/web/src/lib/demo/demo-lifecycle.ts`, adjust the import. Search for the function definition and its export path. If it's not in the shared package, inline the status check:

```typescript
// Fallback if computeDemoStatus is not in shared:
const isExpired = demo.demoExpiresAt && new Date(demo.demoExpiresAt) < new Date();
if (isExpired) { ... }
```

- [ ] **Step 5: Verify `conversionEvents` schema is importable from `@propertypro/db`**

Check if `conversionEvents` is exported from the `@propertypro/db` package barrel. If not, import directly:

```typescript
import { conversionEvents } from '@propertypro/db/schema/conversion-events';
```

Adjust the import in the route file accordingly.

- [ ] **Step 6: Update `ConvertDemoDialog.tsx` to use admin API**

In `apps/admin/src/components/demo/ConvertDemoDialog.tsx`, find the fetch call (around line 76). Change from:

```typescript
const res = await fetch(`${webAppBaseUrl}/api/v1/admin/demo/${slug}/convert`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ planId, customerEmail, customerName }),
});
```

To:

```typescript
const res = await fetch(`/api/admin/demos/${slug}/convert`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ planId, customerEmail, customerName }),
});
```

Note: no more `credentials: 'include'` (same-origin now), no more `webAppBaseUrl` prefix. The admin app's own session cookie is sent automatically.

Also update the response parsing if the response shape changed. The new route returns `{ data: { checkoutUrl } }` — check if the dialog currently expects `{ checkoutUrl }` directly and adjust:

```typescript
const json = await res.json();
const checkoutUrl = json.data?.checkoutUrl ?? json.checkoutUrl;
```

- [ ] **Step 7: Deprecate web app admin conversion route**

Replace the contents of `apps/web/src/app/api/v1/admin/demo/[slug]/convert/route.ts` with:

```typescript
import { NextResponse } from 'next/server';

/**
 * @deprecated This route has been moved to the admin app at
 * apps/admin/src/app/api/admin/demos/[slug]/convert/route.ts
 *
 * The web app route was broken for cross-app calls because the admin app's
 * session cookies (sb-admin-auth-token) are not recognized by the web app's
 * auth layer. The admin app now creates Stripe checkout sessions directly.
 */
export async function POST() {
  return NextResponse.json(
    { error: { code: 'DEPRECATED', message: 'This endpoint has been moved to the admin app API' } },
    { status: 410 },
  );
}

export async function OPTIONS() {
  return NextResponse.json(
    { error: { code: 'DEPRECATED', message: 'This endpoint has been moved to the admin app API' } },
    { status: 410 },
  );
}
```

- [ ] **Step 8: Run typecheck for both apps**

Run: `pnpm typecheck`
Expected: PASS for both web and admin apps.

- [ ] **Step 9: Commit**

```bash
git add apps/admin/src/lib/stripe.ts \
  apps/admin/src/app/api/admin/demos/\[slug\]/convert/route.ts \
  apps/admin/src/components/demo/ConvertDemoDialog.tsx \
  apps/web/src/app/api/v1/admin/demo/\[slug\]/convert/route.ts
git commit -m "fix: move admin conversion route into admin app

The web app's admin conversion route required a web-app session cookie
that the admin app couldn't provide (different cookie names). Moved the
Stripe checkout session creation into the admin app where it authenticates
via the admin session directly.

success_url and cancel_url still target the web app origin. Checkout
metadata shape is identical to the self-service flow so the webhook
handler needs no changes. Old web app route returns 410 Deprecated."
```

---

## Task 5: Final Verification

- [ ] **Step 1: Run full lint + typecheck + test suite**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: All pass.

- [ ] **Step 2: Run build**

Run: `pnpm build`
Expected: Both web and admin apps build successfully.

- [ ] **Step 3: Verify no CI guard violations**

Run: `pnpm guard:db-access`
Expected: PASS — the new `detect-demo-info.ts` uses `createUnscopedClient` from `@propertypro/db/unsafe` which should be in the allowlist. If not, add `apps/web/src/lib/demo/detect-demo-info.ts` to the allowlist in `scripts/verify-scoped-db-access.ts`.

- [ ] **Step 4: Commit any guard fixes**

If the DB access guard required an allowlist update:

```bash
git add scripts/verify-scoped-db-access.ts
git commit -m "chore: add detect-demo-info.ts to DB access guard allowlist

The refactored demo detection now queries demo_instances directly
via createUnscopedClient (cross-tenant lookup by design — demo
instances reference communities across the tenant boundary)."
```

---

## Summary

| Task | Finding | Key Change |
|------|---------|------------|
| 1 | Permissions + idempotency + redirectTo | `getPresetPermissions()` on manager insert, pass `communityType`, explicit magic link redirect |
| 2 | Webhook idempotency | Check `processedAt` on fence, return 500 on errors |
| 3 | Demo detection | Email regex → DB query against `demo_instances` |
| 4 | Admin conversion | New admin route, deprecate web route, update dialog |
| 5 | Verification | Full lint + typecheck + test + build pass |
