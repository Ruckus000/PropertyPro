# Lapsed-State Admin Read Gating + Stripe Mode Fail-Fast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Withhold *admin* reads from a `lapsed` community (churned + past the 7-day paid grace) while leaving resident reads untouched; take the public §718.111(12)(g) transparency page offline only after grace expires; and turn a prod Stripe key/price mode mismatch into a named operator error instead of a raw 500.

**Architecture:** Two independent tracks in one branch. **Track 1 (lapsed reads)** adds one shared guard, `requireEntitledForAdminRead`, that mirrors the existing write-guard `requireActiveSubscriptionForMutation` but short-circuits for non-admin callers, then applies it at admin GET routes and at the public transparency chokepoint. **Track 2 (Stripe mode)** adds a fail-fast check in `resolveStripePrice` that confirms the resolved price is retrievable with the configured key. No schema changes — every state is derived from existing columns via `resolveLifecycleState` / `isEntitledState`, already live on `main`.

**Tech Stack:** Next.js 15 App Router route handlers, `@propertypro/shared` lifecycle predicates, `@propertypro/db/unsafe` unscoped reads (root `communities` table cannot be community-scoped), Vitest, Stripe Node SDK.

---

## Decisions locked in (from the requester)

| Question | Decision | Consequence encoded below |
|---|---|---|
| What does a lapsed community lose? | **Lock all admin reads, residents unaffected** | Guard short-circuits when `membership.isAdmin === false`. |
| Public transparency page when lapsed? | **Online through grace, then offline** | Gate at `public-transparency/page.tsx`: `grace` → online, `lapsed` → `notFound()`. |
| Stripe mismatch verification | **Fail-fast assertion in code** | Track 2. |
| Delivery | **Written plan first** (this document) | — |

### ⚠️ Accepted statutory risk — restate at review time

"Online through grace, then offline" means that on **day 8** after a condo/HOA cancellation, the association's public document-posting page goes dark. §718.111(12)(g) (condos, 25+ units) and §720.303 (HOAs, 100+ parcels) require that website to be *maintained*. Taking it offline for a billing lapse puts the association out of statutory compliance and makes PropertyPro the proximate cause. This is a deliberate product decision, not an oversight — it is called out here so a reviewer signs off on it knowingly. If that trade is not acceptable, change Task 9 to keep transparency always-online (the "Always stays online" option) and delete Tasks 8–10's `lapsed` branch.

---

## Scope & rollout honesty

Track 1 is caller-tier gating, not a per-route feature. The guard is the whole mechanism; applying it is mechanical repetition. To avoid a silent partial rollout reading as "done", Task 7 enumerates the **complete** target list and Task 11 adds a CI guard that fails if a new admin GET route ships without the read gate. The first PR wires the enumerated wave; the CI guard prevents backslide.

Track 2 is fully self-contained (Tasks 12–14) and can ship even if Track 1 is split into a follow-up.

---

## File Structure

**Track 1 — lapsed read gating**
- Create `apps/web/src/lib/middleware/read-entitlement-guard.ts` — the shared `requireEntitledForAdminRead` guard. One responsibility: given a community + membership, throw `SUBSCRIPTION_REQUIRED` iff the caller is admin-tier and the community is `lapsed`.
- Create `apps/web/__tests__/middleware/read-entitlement-guard.test.ts` — unit tests for the guard.
- Modify admin GET route handlers (enumerated in Task 7) — one guard call each.
- Modify `apps/web/src/app/public-transparency/page.tsx` — add the grace-then-offline gate.
- Create `apps/web/__tests__/app/public-transparency/transparency-lapsed-gate.test.tsx` — transparency gate tests.
- Create `scripts/verify-read-entitlement-coverage.ts` — CI guard that every admin GET route calls the gate.
- Modify `package.json` — register `guard:read-entitlement`.

**Track 2 — Stripe mode fail-fast**
- Modify `apps/web/src/lib/services/stripe-service.ts` — add `assertPriceRetrievable` and call it from `resolveStripePrice`.
- Modify `apps/web/__tests__/**` (new file) `apps/web/__tests__/services/stripe-mode-assertion.test.ts` — unit tests for the assertion.

---

## Track 1 — Lapsed-State Admin Read Gating

### Task 1: The shared read-entitlement guard (failing test first)

**Files:**
- Create: `apps/web/__tests__/middleware/read-entitlement-guard.test.ts`
- Create: `apps/web/src/lib/middleware/read-entitlement-guard.ts`

Reference existing pattern: `apps/web/src/lib/middleware/subscription-guard.ts` (the write-side twin — same unscoped-lookup shape, same `AppError(403,'SUBSCRIPTION_REQUIRED')`).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/__tests__/middleware/read-entitlement-guard.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { limitMock } = vi.hoisted(() => ({ limitMock: vi.fn() }));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: limitMock }) }) }),
  }),
}));
vi.mock('@propertypro/db', () => ({
  communities: {
    id: 'communities.id',
    subscriptionStatus: 'communities.subscription_status',
    subscriptionCanceledAt: 'communities.subscription_canceled_at',
    freeAccessExpiresAt: 'communities.free_access_expires_at',
  },
}));
vi.mock('@propertypro/db/filters', () => ({ eq: (a: unknown, b: unknown) => ({ _eq: [a, b] }) }));

import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { AppError } from '@/lib/api/errors/AppError';

// canceled 30 days ago → past the 7-day paid grace → lapsed.
const LAPSED_ROW = {
  subscriptionStatus: 'canceled',
  subscriptionCanceledAt: new Date(Date.now() - 30 * 864e5),
  freeAccessExpiresAt: null,
};
const ACTIVE_ROW = {
  subscriptionStatus: 'active',
  subscriptionCanceledAt: null,
  freeAccessExpiresAt: null,
};

function admin() {
  return { isAdmin: true, role: 'property_manager' as const };
}
function resident(isUnitOwner = false) {
  return { isAdmin: false, role: 'resident' as const, isUnitOwner };
}

describe('requireEntitledForAdminRead', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws SUBSCRIPTION_REQUIRED for an admin on a lapsed community', async () => {
    limitMock.mockResolvedValue([LAPSED_ROW]);
    await expect(requireEntitledForAdminRead(42, admin())).rejects.toMatchObject({
      statusCode: 403,
      code: 'SUBSCRIPTION_REQUIRED',
    });
    expect(limitMock).toHaveBeenCalledTimes(1);
  });

  it('allows an admin on an active community', async () => {
    limitMock.mockResolvedValue([ACTIVE_ROW]);
    await expect(requireEntitledForAdminRead(42, admin())).resolves.toBeUndefined();
  });

  it('never gates a resident, and never even hits the DB for one', async () => {
    // A lapsed community must not affect residents (their reads stay open),
    // and we must not pay for a lookup we will not act on.
    await expect(requireEntitledForAdminRead(42, resident(false))).resolves.toBeUndefined();
    await expect(requireEntitledForAdminRead(42, resident(true))).resolves.toBeUndefined();
    expect(limitMock).not.toHaveBeenCalled();
  });

  it('allows an admin on a community still inside the paid grace window', async () => {
    limitMock.mockResolvedValue([
      {
        subscriptionStatus: 'canceled',
        subscriptionCanceledAt: new Date(Date.now() - 2 * 864e5), // 2 days ago → grace
        freeAccessExpiresAt: null,
      },
    ]);
    await expect(requireEntitledForAdminRead(42, admin())).resolves.toBeUndefined();
  });

  it('propagates AppError type for withErrorHandler to catch', async () => {
    limitMock.mockResolvedValue([LAPSED_ROW]);
    await expect(requireEntitledForAdminRead(42, admin())).rejects.toBeInstanceOf(AppError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm exec vitest run __tests__/middleware/read-entitlement-guard.test.ts`
Expected: FAIL — `Cannot find module '@/lib/middleware/read-entitlement-guard'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/lib/middleware/read-entitlement-guard.ts
/**
 * Read-entitlement guard — lapsed-state admin read gating.
 *
 * The write twin `requireActiveSubscriptionForMutation` blocks mutations for a
 * churned community. This blocks *admin reads* for a community that is `lapsed`
 * (canceled AND past the 7-day paid grace) — and ONLY for admin-tier callers.
 *
 * Residents are never gated: a resident must not lose read access because the
 * association stopped paying. The `membership.isAdmin` short-circuit returns
 * before any DB work, so a resident read costs nothing here.
 *
 * `lapsed` is the single non-entitled `LifecycleState`; every other state
 * (unprovisioned/comped/trialing/active/past_due/grace) passes. Unrecognized
 * Stripe statuses resolve to `active` inside `resolveLifecycleState`, preserving
 * the long-standing fail-open on a Stripe vocabulary change.
 */
import { eq } from '@propertypro/db/filters';
import { communities } from '@propertypro/db';
// AUTHZ: Reads communities row by primary key — communities is the root tenant table and cannot be scoped by community_id (it IS the community_id).
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { resolveLifecycleState, isEntitledState } from '@propertypro/shared';
import { AppError } from '@/lib/api/errors/AppError';

/** The subset of CommunityMembership this guard needs. */
export interface ReadEntitlementActor {
  isAdmin: boolean;
}

export async function requireEntitledForAdminRead(
  communityId: number,
  membership: ReadEntitlementActor,
): Promise<void> {
  // Residents keep full read access even on a lapsed community. Short-circuit
  // BEFORE the DB lookup so their reads pay nothing for this guard.
  if (!membership.isAdmin) return;

  const db = createUnscopedClient();
  const rows = await db
    .select({
      subscriptionStatus: communities.subscriptionStatus,
      subscriptionCanceledAt: communities.subscriptionCanceledAt,
      freeAccessExpiresAt: communities.freeAccessExpiresAt,
    })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);

  const status = rows[0]?.subscriptionStatus ?? null;
  const state = resolveLifecycleState({
    subscriptionStatus: status,
    subscriptionCanceledAt: rows[0]?.subscriptionCanceledAt ?? null,
    freeAccessExpiresAt: rows[0]?.freeAccessExpiresAt ?? null,
  });

  if (!isEntitledState(state)) {
    throw new AppError(
      'This community’s subscription has lapsed. Reactivate to restore access.',
      403,
      'SUBSCRIPTION_REQUIRED',
      { subscriptionStatus: status },
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm exec vitest run __tests__/middleware/read-entitlement-guard.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/middleware/read-entitlement-guard.ts apps/web/__tests__/middleware/read-entitlement-guard.test.ts
git commit -m "feat(billing): add requireEntitledForAdminRead guard for lapsed-state read gating"
```

---

### Task 2: Confirm the guard's AppError shape matches withErrorHandler

**Files:**
- Read only: `apps/web/src/lib/api/errors/AppError.ts`, `apps/web/src/lib/api/error-handler.ts`

- [ ] **Step 1: Verify AppError constructor signature**

Run: `grep -n "constructor" apps/web/src/lib/api/errors/AppError.ts`
Expected: `constructor(message, statusCode, code, details?)` — matching the call in Task 1 Step 3. If the property is named `status` not `statusCode`, fix the test's `toMatchObject` in Task 1 to match; do NOT change AppError.

- [ ] **Step 2: Verify withErrorHandler serializes AppError as its status/code**

Run: `grep -n "AppError\|statusCode\|instanceof" apps/web/src/lib/api/error-handler.ts`
Expected: a branch that returns `err.statusCode` + `err.code` for `AppError`. This is why the guard throws `AppError` and not a bare `Error` — a bare throw becomes a 500 + Sentry event.

- [ ] **Step 3: No commit** (verification only).

---

### Task 3: Worked example — gate one admin GET route (`/api/v1/finance`)

This is the canonical insertion. Every route in Task 7 gets the identical two-line change; this task proves the pattern end-to-end with a test before the sweep.

**Files:**
- Modify: `apps/web/src/app/api/v1/finance/route.ts`
- Test: `apps/web/__tests__/finance/finance-read-entitlement.test.ts` (create)

- [ ] **Step 1: Read the current handler to find the insertion point**

Run: `grep -n "export const GET\|requireCommunityMembership\|requirePermission\|withErrorHandler" apps/web/src/app/api/v1/finance/route.ts`
Expected: a `GET` that resolves `membership` via `requireCommunityMembership` then calls `requirePermission`. Insert the read gate immediately AFTER `requirePermission` (permission first so an unauthorized caller still gets 403 FORBIDDEN, not a billing message).

> If `/api/v1/finance/route.ts` has no `GET` export, skip this exact file and use the first route from Task 7's list that does; keep the same step structure.

- [ ] **Step 2: Write the failing test**

```ts
// apps/web/__tests__/finance/finance-read-entitlement.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { requireEntitledForAdminReadMock } = vi.hoisted(() => ({
  requireEntitledForAdminReadMock: vi.fn(),
}));

vi.mock('@/lib/middleware/read-entitlement-guard', () => ({
  requireEntitledForAdminRead: requireEntitledForAdminReadMock,
}));

// Reuse this file's existing GET test harness mocks. Import the route AFTER the
// mock above so the guard is stubbed.
import { GET } from '@/app/api/v1/finance/route';
import { NextRequest } from 'next/server';

describe('GET /api/v1/finance — read entitlement', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls requireEntitledForAdminRead with the resolved community + membership', async () => {
    requireEntitledForAdminReadMock.mockResolvedValue(undefined);
    // ...set up the same auth/membership mocks the other finance GET tests use...
    await GET(new NextRequest('http://localhost/api/v1/finance?communityId=42')).catch(() => {});
    expect(requireEntitledForAdminReadMock).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ isAdmin: expect.any(Boolean) }),
    );
  });
});
```

> The engineer must copy the auth/membership/paginate mocks already present in the neighboring finance GET test file. Grep for them first: `grep -rl "app/api/v1/finance/route" apps/web/__tests__/`.

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/web && pnpm exec vitest run __tests__/finance/finance-read-entitlement.test.ts`
Expected: FAIL — `requireEntitledForAdminRead` was never called (not yet wired).

- [ ] **Step 4: Wire the guard into the route**

Add the import beside the existing guards:

```ts
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
```

Immediately after the existing `requirePermission(membership, ...)` line in the `GET` handler:

```ts
    // Lapsed communities lose ADMIN reads (residents keep theirs — the guard
    // short-circuits on membership.isAdmin === false). Mirrors the write-side
    // requireActiveSubscriptionForMutation.
    await requireEntitledForAdminRead(effectiveCommunityId, membership);
```

> Use whatever the handler already names the resolved id (`effectiveCommunityId`, `communityId`) and membership variable. Do not introduce a second membership lookup.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && pnpm exec vitest run __tests__/finance/finance-read-entitlement.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the route's existing GET suite to confirm no regression**

Run: `cd apps/web && pnpm exec vitest run __tests__/finance/`
Expected: all pre-existing finance tests still PASS (the mocked guard resolves to undefined by default).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/api/v1/finance/route.ts apps/web/__tests__/finance/finance-read-entitlement.test.ts
git commit -m "feat(billing): gate GET /api/v1/finance behind read-entitlement (lapsed lockout)"
```

---

### Task 4: Verify the guard fires end-to-end against real lifecycle logic (integration)

A unit test with a mocked guard proves wiring, not behavior. This task proves a *lapsed* admin actually gets 403 through the real guard.

**Files:**
- Test: `apps/web/__tests__/integration/read-entitlement-lapsed.integration.test.ts` (create)

- [ ] **Step 1: Write an integration test using the real guard (no guard mock)**

```ts
// apps/web/__tests__/integration/read-entitlement-lapsed.integration.test.ts
import { describe, expect, it } from 'vitest';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';

// This runs under the integration config which provides DATABASE_URL. It seeds a
// community into a lapsed state and asserts the real guard throws for an admin
// and resolves for a resident.
describe('read-entitlement guard — real lifecycle', () => {
  it('throws for an admin when the community is lapsed', async () => {
    const communityId = /* seed a canceled+expired-grace community, return its id */ 0;
    await expect(
      requireEntitledForAdminRead(communityId, { isAdmin: true }),
    ).rejects.toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' });
  });

  it('resolves for a resident on the same lapsed community', async () => {
    const communityId = /* same seeded community */ 0;
    await expect(
      requireEntitledForAdminRead(communityId, { isAdmin: false }),
    ).resolves.toBeUndefined();
  });
});
```

> Follow the seeding pattern in an existing file under `apps/web/__tests__/integration/` — grep for one that inserts a `communities` row and sets `subscription_status`/`subscription_canceled_at`. Set `subscription_status='canceled'` and `subscription_canceled_at = now() - interval '30 days'`.

- [ ] **Step 2: Run it**

Run: `scripts/with-env-local.sh pnpm exec vitest run --config apps/web/vitest.integration.config.ts __tests__/integration/read-entitlement-lapsed.integration.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 3: Commit**

```bash
git add apps/web/__tests__/integration/read-entitlement-lapsed.integration.test.ts
git commit -m "test(billing): integration proof that lapsed admins get 403 and residents pass"
```

---

### Task 5: Regression fence — the guard must fail against pre-guard behavior

**Files:**
- Read only (confirmation task).

- [ ] **Step 1: Temporarily neutralize the guard body and confirm Task 3's test fails**

Comment out the `await requireEntitledForAdminRead(...)` line in `finance/route.ts`, run:
`cd apps/web && pnpm exec vitest run __tests__/finance/finance-read-entitlement.test.ts`
Expected: FAIL (the `toHaveBeenCalledWith` assertion). Then **restore the line** and re-run — PASS.

- [ ] **Step 2: No commit** (the file must end unchanged). Confirm with `git diff --stat` showing no changes.

---

### Task 6: Extend the membership object is NOT required — confirm

**Files:**
- Read only: `apps/web/src/lib/api/community-membership.ts`

- [ ] **Step 1: Confirm `CommunityMembership.isAdmin` exists and means management-tier**

Run: `grep -n "isAdmin" apps/web/src/lib/api/community-membership.ts`
Expected: `isAdmin: boolean;` documented as "property_manager or root_manager". The guard consumes exactly this — no membership shape change, no new import in routes beyond the guard itself.

- [ ] **Step 2: No commit.**

---

### Task 7: Apply the gate to every admin GET route (mechanical sweep)

**The change per file is identical to Task 3 Steps 4–7:** add the import, add the one `await requireEntitledForAdminRead(<communityId>, membership)` line after `requirePermission`, add a wiring test mirroring Task 3 Step 2, run the file's suite, commit.

**Target list — admin/manager-facing GET routes that expose management data.** Confirm each has a `GET` that resolves `membership`; skip resident-facing reads (documents, announcements, maintenance-requests the resident owns, payments) — those must stay open:

- [ ] `apps/web/src/app/api/v1/finance/route.ts` *(done in Task 3)*
- [ ] `apps/web/src/app/api/v1/accounting/**/route.ts`
- [ ] `apps/web/src/app/api/v1/ledger/**/route.ts`
- [ ] `apps/web/src/app/api/v1/delinquency/**/route.ts`
- [ ] `apps/web/src/app/api/v1/assessments/**/route.ts`
- [ ] `apps/web/src/app/api/v1/billing/**/route.ts` (reads only; not the webhook)
- [ ] `apps/web/src/app/api/v1/pm/reports/**/route.ts`
- [ ] `apps/web/src/app/api/v1/pm/dashboard/**/route.ts`
- [ ] `apps/web/src/app/api/v1/vendors/**/route.ts`
- [ ] `apps/web/src/app/api/v1/contracts/**/route.ts`
- [ ] `apps/web/src/app/api/v1/work-orders/**/route.ts`
- [ ] `apps/web/src/app/api/v1/violations/**/route.ts`
- [ ] `apps/web/src/app/api/v1/elections/**/route.ts` (admin management views)
- [ ] `apps/web/src/app/api/v1/arc/**/route.ts` (admin review views)

- [ ] **Step 1: Enumerate the actual matching routes**

Run:
```bash
grep -rln "export const GET" apps/web/src/app/api/v1/{finance,accounting,ledger,delinquency,assessments,billing,pm,vendors,contracts,work-orders,violations,elections,arc} 2>/dev/null
```
Cross-check each hit calls `requireCommunityMembership`. Build the concrete file list from the output — do NOT gate a route that resolves tenancy differently (token-auth, cron, webhook) or that is resident-facing.

- [ ] **Step 2: For each file, apply Task 3 Steps 4–7.** One commit per route (or one commit per coherent group), message `feat(billing): gate GET <route> behind read-entitlement`.

- [ ] **Step 3: Log the coverage explicitly** (no silent cap)

In the PR description, list every route gated AND every admin GET route deliberately left ungated with a one-line reason. This is the "no silent truncation" requirement — a partial sweep must read as partial.

---

### Task 8: Transparency gate — read the current page + failing test

**Files:**
- Read: `apps/web/src/app/public-transparency/page.tsx`
- Test: `apps/web/__tests__/app/public-transparency/transparency-lapsed-gate.test.tsx` (create)

- [ ] **Step 1: Confirm the resolve → render flow**

Run: `grep -n "resolveCommunityId\|getCommunityPublicInfo\|notFound\|hasTransparencyPage\|getTransparencyPageData" apps/web/src/app/public-transparency/page.tsx`
Expected: `communityId` resolved, `getCommunityPublicInfo`, a `hasTransparencyPage` feature check that `notFound()`s, then render. The lapsed gate goes right after the community is resolved and before render.

- [ ] **Step 2: Write the failing test**

```tsx
// apps/web/__tests__/app/public-transparency/transparency-lapsed-gate.test.tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { notFoundMock, lifecycleRowMock } = vi.hoisted(() => ({
  notFoundMock: vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); }),
  lifecycleRowMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({ notFound: notFoundMock }));
// ...mock headers(), getCommunityPublicInfo, getTransparencyPageData, and the
// unscoped lifecycle-column lookup added in Task 9 (lifecycleRowMock) exactly as
// the existing site-page tests do...

import Page from '@/app/public-transparency/page';

describe('public transparency — lapsed gate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders (does NOT notFound) for a community in the paid grace window', async () => {
    lifecycleRowMock.mockResolvedValue([{
      subscriptionStatus: 'canceled',
      subscriptionCanceledAt: new Date(Date.now() - 2 * 864e5), // grace
      freeAccessExpiresAt: null,
    }]);
    await Page();
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('notFound()s for a lapsed community (grace expired)', async () => {
    lifecycleRowMock.mockResolvedValue([{
      subscriptionStatus: 'canceled',
      subscriptionCanceledAt: new Date(Date.now() - 30 * 864e5), // lapsed
      freeAccessExpiresAt: null,
    }]);
    await expect(Page()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('renders for an active community', async () => {
    lifecycleRowMock.mockResolvedValue([{
      subscriptionStatus: 'active', subscriptionCanceledAt: null, freeAccessExpiresAt: null,
    }]);
    await Page();
    expect(notFoundMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `scripts/with-env-local.sh pnpm exec vitest run apps/web/__tests__/app/public-transparency/transparency-lapsed-gate.test.tsx`
Expected: FAIL — the lapsed case renders instead of `notFound()`.

- [ ] **Step 4: No commit** (implementation is Task 9).

---

### Task 9: Transparency gate — implement grace-then-offline

**Files:**
- Modify: `apps/web/src/app/public-transparency/page.tsx`

- [ ] **Step 1: Add the lifecycle lookup + gate after the community is resolved**

After `getCommunityPublicInfo(communityId)` succeeds and before rendering, add:

```tsx
import { resolveLifecycleState } from '@propertypro/shared';
import { eq } from '@propertypro/db/filters';
import { communities } from '@propertypro/db';
// AUTHZ: Host-native public transparency page — reads communities row by PK before tenant context exists.
import { createUnscopedClient } from '@propertypro/db/unsafe';
```

```tsx
  // Statutory page policy (accepted product decision): a canceled community
  // keeps its public §718.111(12)(g) transparency page through the 7-day paid
  // grace, then it goes offline. `notFound()` (not a billing message) so the
  // page's absence is indistinguishable from "no such community" and does not
  // leak the association's billing state publicly.
  const db = createUnscopedClient();
  const lifecycleRows = await db
    .select({
      subscriptionStatus: communities.subscriptionStatus,
      subscriptionCanceledAt: communities.subscriptionCanceledAt,
      freeAccessExpiresAt: communities.freeAccessExpiresAt,
    })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);

  const lifecycleState = resolveLifecycleState({
    subscriptionStatus: lifecycleRows[0]?.subscriptionStatus ?? null,
    subscriptionCanceledAt: lifecycleRows[0]?.subscriptionCanceledAt ?? null,
    freeAccessExpiresAt: lifecycleRows[0]?.freeAccessExpiresAt ?? null,
  });
  if (lifecycleState === 'lapsed') {
    notFound();
  }
```

> `grace` is an entitled state, so it falls through and renders — matching the "online through grace" decision. Only the single `lapsed` state takes the page offline.

- [ ] **Step 2: Run the gate test**

Run: `scripts/with-env-local.sh pnpm exec vitest run apps/web/__tests__/app/public-transparency/transparency-lapsed-gate.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 3: Run the existing transparency/site-page suite for no regression**

Run: `scripts/with-env-local.sh pnpm exec vitest run apps/web/__tests__/app/public-site/`
Expected: all pre-existing tests PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/public-transparency/page.tsx apps/web/__tests__/app/public-transparency/transparency-lapsed-gate.test.tsx
git commit -m "feat(billing): take public transparency offline only after paid grace expires"
```

---

### Task 10: Transparency regression fence

**Files:**
- Read only.

- [ ] **Step 1: Flip the gate condition and confirm the test catches it**

Temporarily change `=== 'lapsed'` to `=== 'active'` in `page.tsx`. Run the gate test — the `renders for an active community` case must FAIL. Restore, re-run — PASS. Confirm `git diff --stat` shows no lingering change.

- [ ] **Step 2: No commit.**

---

### Task 11: CI guard — no new admin GET route ships ungated

**Files:**
- Create: `scripts/verify-read-entitlement-coverage.ts`
- Modify: `package.json` (root `scripts` block)

- [ ] **Step 1: Write the coverage checker**

```ts
// scripts/verify-read-entitlement-coverage.ts
/**
 * Fails if an admin-tier GET route handler resolves a membership but never calls
 * requireEntitledForAdminRead. Mirrors the intent of guard:tenant-scope: the
 * lapsed read-lockout is only real if every admin read participates.
 *
 * A route opts out with a top-of-file:
 *   // read-entitlement:exempt — <reason>
 * (resident-facing reads, token-auth, cron, webhooks).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const API_ROOT = 'apps/web/src/app/api/v1';
const EXEMPT = /\/\/\s*read-entitlement:exempt/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('route.ts') ? [p] : [];
  });
}

const offenders: string[] = [];
for (const file of walk(API_ROOT)) {
  const src = readFileSync(file, 'utf8');
  if (EXEMPT.test(src)) continue;
  const hasGet = /export const GET\b/.test(src);
  const resolvesMembership = /requireCommunityMembership\s*\(/.test(src);
  const gated = /requireEntitledForAdminRead\s*\(/.test(src);
  if (hasGet && resolvesMembership && !gated) offenders.push(file);
}

if (offenders.length > 0) {
  console.error('❌ Admin GET routes missing requireEntitledForAdminRead (or a read-entitlement:exempt comment):');
  for (const f of offenders) console.error('   ' + f);
  process.exit(1);
}
console.log('✅ guard:read-entitlement — all admin GET routes gated or exempt');
```

- [ ] **Step 2: Register the script**

In root `package.json` `scripts`, add:
```json
"guard:read-entitlement": "tsx scripts/verify-read-entitlement-coverage.ts",
```
And append ` && pnpm guard:read-entitlement` to the existing `lint` composite (match how the other `guard:*` entries are chained).

- [ ] **Step 3: Run it — expect it to flag every not-yet-gated resident-facing route**

Run: `pnpm guard:read-entitlement`
Expected: initially FAILS listing resident-facing GET routes. For each, decide: gate it (if admin) or add `// read-entitlement:exempt — resident-facing read` at the top. Iterate until green. This step is where the "which reads stay open" decision gets encoded per-route and made auditable.

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-read-entitlement-coverage.ts package.json apps/web/src/app/api/v1
git commit -m "ci(billing): guard:read-entitlement — every admin GET route must gate or exempt"
```

---

## Track 2 — Stripe Mode Fail-Fast

### Task 12: Failing test for the mode assertion

**Files:**
- Test: `apps/web/__tests__/services/stripe-mode-assertion.test.ts` (create)

Reference: `apps/web/src/lib/services/stripe-service.ts` — `resolveStripePrice` (returns the stored price id) and `getStripeClient` (memoized client keyed on `STRIPE_SECRET_KEY`).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/__tests__/services/stripe-mode-assertion.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { retrieveMock, dbLimitMock } = vi.hoisted(() => ({
  retrieveMock: vi.fn(),
  dbLimitMock: vi.fn(),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: dbLimitMock }) }) }),
  }),
}));
vi.mock('@propertypro/db', () => ({
  stripePrices: { planId: 'p', communityType: 'c', billingInterval: 'i', stripePriceId: 's' },
}));
vi.mock('@propertypro/db/filters', () => ({
  eq: (a: unknown, b: unknown) => ({ _eq: [a, b] }),
  and: (...xs: unknown[]) => ({ _and: xs }),
}));

vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => ({ prices: { retrieve: retrieveMock } })),
}));

import { resolveStripePrice } from '@/lib/services/stripe-service';

describe('resolveStripePrice — mode assertion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    dbLimitMock.mockResolvedValue([{ stripePriceId: 'price_live_123' }]);
  });

  it('throws STRIPE_MODE_MISMATCH when the price is not retrievable with the configured key', async () => {
    // Stripe raises a StripeInvalidRequestError with code 'resource_missing'
    // when a live price id is queried with a test key (and vice versa).
    retrieveMock.mockRejectedValue(
      Object.assign(new Error('No such price'), { code: 'resource_missing' }),
    );
    await expect(resolveStripePrice('essentials', 'condo_718', 'month')).rejects.toMatchObject({
      code: 'STRIPE_MODE_MISMATCH',
      statusCode: 500,
    });
  });

  it('returns the price id when it retrieves cleanly', async () => {
    retrieveMock.mockResolvedValue({ id: 'price_live_123', active: true });
    await expect(resolveStripePrice('essentials', 'condo_718', 'month')).resolves.toBe('price_live_123');
    expect(retrieveMock).toHaveBeenCalledWith('price_live_123');
  });

  it('rethrows a non-resource_missing Stripe error unchanged (not masked as a mode mismatch)', async () => {
    retrieveMock.mockRejectedValue(Object.assign(new Error('rate limited'), { code: 'rate_limit' }));
    await expect(resolveStripePrice('essentials', 'condo_718', 'month')).rejects.toThrow('rate limited');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && pnpm exec vitest run __tests__/services/stripe-mode-assertion.test.ts`
Expected: FAIL — `resolveStripePrice` currently returns the id without retrieving it, so the mismatch case does not throw.

---

### Task 13: Implement the assertion

**Files:**
- Modify: `apps/web/src/lib/services/stripe-service.ts`

- [ ] **Step 1: Add `assertPriceRetrievable` and call it from `resolveStripePrice`**

At the end of `resolveStripePrice`, replace `return row.stripePriceId;` with:

```ts
  await assertPriceRetrievable(row.stripePriceId);
  return row.stripePriceId;
}

/**
 * Confirm the configured Stripe key can actually see this price.
 *
 * `stripe_prices` holds ids created in one Stripe mode; the runtime key may be
 * the other mode (test vs live). Querying a live price with a test key — or the
 * reverse — raises `resource_missing`. Without this, the first real upgrade
 * click 500s deep inside checkout with an opaque error. Surface a named,
 * operator-facing failure instead. Re-checked on every call, so it keeps working
 * across key rotations rather than trusting a one-time manual verification.
 */
async function assertPriceRetrievable(priceId: string): Promise<void> {
  const stripe = getStripe();
  try {
    await stripe.prices.retrieve(priceId);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === 'resource_missing') {
      throw new AppError(
        `Stripe price ${priceId} is not visible to the configured key — the key and the stored price ids are in different Stripe modes (test vs live). Fix STRIPE_SECRET_KEY or re-seed stripe_prices.`,
        500,
        'STRIPE_MODE_MISMATCH',
      );
    }
    throw err; // network / rate-limit / anything else: surface unchanged.
  }
}
```

> Confirm `AppError` is already imported in this file (it is — `STRIPE_PRICE_CONFIG_MISSING` uses it). `getStripe` is the internal memoized accessor `getStripeClient` wraps.

- [ ] **Step 2: Run the assertion tests**

Run: `cd apps/web && pnpm exec vitest run __tests__/services/stripe-mode-assertion.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 3: Run the existing stripe-service + subscribe suites for no regression**

Run: `cd apps/web && pnpm exec vitest run __tests__/subscribe/ __tests__/services/`
Expected: PASS. If any subscribe test now fails because it did not mock `prices.retrieve`, add `retrieveMock.mockResolvedValue({ id: '...' })` (or the file's equivalent) to that test's setup — the assertion adds one Stripe call to the checkout path.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/services/stripe-service.ts apps/web/__tests__/services/stripe-mode-assertion.test.ts
git commit -m "feat(billing): fail fast with STRIPE_MODE_MISMATCH when key/price modes diverge"
```

---

### Task 14: Confirm the assertion does not fire on the happy path in the subscribe integration test

**Files:**
- Read only / possible mock top-up in existing integration tests.

- [ ] **Step 1: Run the subscribe integration coverage**

Run: `scripts/with-env-local.sh pnpm exec vitest run --config apps/web/vitest.integration.config.ts` (subscribe-related files)
Expected: PASS. Any integration test that reaches `resolveStripePrice` with a real key now also performs a `prices.retrieve`; against the real test-mode key with test-mode price ids this succeeds. If a test used a fabricated price id, point it at a real seeded one.

- [ ] **Step 2: No new commit unless a mock top-up was needed.**

---

## Final verification (whole branch)

- [ ] **Step 1: Typecheck (bypass turbo cache — see memory: stale-cache false-green)**

Run: `pnpm typecheck --force`
Expected: all packages pass.

- [ ] **Step 2: Lint + all guards (includes the new guard:read-entitlement)**

Run: `pnpm lint`
Expected: all guards pass, including `guard:read-entitlement`.

- [ ] **Step 3: Unit tests**

Run: `pnpm test`
Expected: green. Note the three env-dependent suites (`site-page`, `calendar-event-reminder-service`, `esign-my-pending`) need `scripts/with-env-local.sh` — run those via the wrapper if the fresh worktree lacks `.env.local`.

- [ ] **Step 4: Integration tests (request/response + guard behavior changed)**

Run: `scripts/with-env-local.sh pnpm exec vitest run --config apps/web/vitest.integration.config.ts`
Expected: green.

- [ ] **Step 5: Push, open PR, then security-review + code-review before merge** (per the requester's workflow).

---

## Self-review notes

- **Spec coverage:** lapsed admin-read lockout → Tasks 1,3,7 + CI guard 11; residents unaffected → Task 1 short-circuit + Task 4 integration proof; transparency grace-then-offline → Tasks 8–10; Stripe fail-fast → Tasks 12–14. All four decisions have tasks.
- **No new column / migration:** every state derives from `resolveLifecycleState` over existing columns. Confirmed against `packages/shared/src/billing/subscription-lifecycle.ts` on `main`.
- **Type consistency:** guard name `requireEntitledForAdminRead` and error code `SUBSCRIPTION_REQUIRED` (reads) / `STRIPE_MODE_MISMATCH` (Stripe) are used identically across every task and the CI guard regex.
- **Open item deliberately excluded:** whether `lapsed` should also gate *resident* reads is explicitly out of scope per the "residents unaffected" decision — do not gate resident-facing routes; the CI guard's `read-entitlement:exempt` comment records each one.
