# Account Lifecycle Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add free access grants, self-service account/community deletion, and PII purge workflows to PropertyPro — with admin app controls and automated email milestones.

**Architecture:** Dedicated lifecycle service (`apps/web/src/lib/services/account-lifecycle-service.ts`) owns all state machines. Admin app calls web app API routes via CORS. Subscription guard gets a single `free_access_expires_at` column check. One daily cron handles all lifecycle transitions and email milestones.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM, PostgreSQL, Supabase Auth, Stripe, Resend (React Email), Vitest

**Spec:** `docs/superpowers/specs/2026-03-23-account-lifecycle-design.md`

---

## File Structure

### New Files

```
# Database
packages/db/migrations/0115_account_lifecycle.sql         # Schema: access_plans + account_deletion_requests + communities.free_access_expires_at
packages/db/src/schema/access-plans.ts                     # Drizzle schema for access_plans
packages/db/src/schema/account-deletion-requests.ts        # Drizzle schema for account_deletion_requests

# Service
apps/web/src/lib/services/account-lifecycle-service.ts     # Core lifecycle state machines

# API Routes — Admin-facing
apps/web/src/app/api/v1/admin/access-plans/route.ts        # GET (list) + POST (grant)
apps/web/src/app/api/v1/admin/access-plans/[id]/route.ts   # DELETE (revoke)
apps/web/src/app/api/v1/admin/access-plans/[id]/extend/route.ts  # POST (extend)
apps/web/src/app/api/v1/admin/access-plans/community/[id]/route.ts  # GET (plans for community)
apps/web/src/app/api/v1/admin/deletion-requests/route.ts   # GET (list all)
apps/web/src/app/api/v1/admin/deletion-requests/[id]/intervene/route.ts  # POST
apps/web/src/app/api/v1/admin/deletion-requests/[id]/recover/route.ts    # POST

# API Routes — User-facing
apps/web/src/app/api/v1/account/delete/route.ts            # POST (request)
apps/web/src/app/api/v1/account/delete/status/route.ts     # GET (check pending deletion)
apps/web/src/app/api/v1/account/delete/cancel/route.ts     # POST
apps/web/src/app/api/v1/communities/delete/route.ts        # POST (request)
apps/web/src/app/api/v1/communities/delete/cancel/route.ts # POST
apps/web/src/app/api/v1/billing/subscribe/route.ts         # POST (smart subscribe)

# Cron
apps/web/src/app/api/v1/internal/account-lifecycle/route.ts

# Email Templates
packages/email/src/templates/free-access-expiring-email.tsx
packages/email/src/templates/free-access-expired-email.tsx
packages/email/src/templates/account-deletion-initiated-email.tsx
packages/email/src/templates/account-deletion-executed-email.tsx
packages/email/src/templates/account-recovered-email.tsx

# Web App UI
apps/web/src/components/layout/free-access-banner.tsx

# Admin App UI
apps/admin/src/components/clients/AccessPlanHistory.tsx      # Extracted: reusable table with computed status
apps/admin/src/components/clients/DeletionRequestsClient.tsx # Extracted: full page client with filtering/sorting

# Tests
apps/web/__tests__/lifecycle/account-lifecycle-service.test.ts
apps/web/__tests__/lifecycle/access-plans-route.test.ts
apps/web/__tests__/lifecycle/deletion-requests-route.test.ts
apps/web/__tests__/lifecycle/account-delete-route.test.ts
apps/web/__tests__/lifecycle/community-delete-route.test.ts
apps/web/__tests__/lifecycle/account-lifecycle-cron.test.ts
apps/web/__tests__/lifecycle/subscription-guard-free-access.test.ts
apps/web/__tests__/lifecycle/billing-subscribe-route.test.ts
```

### Modified Files

```
packages/db/src/schema/communities.ts                      # Add freeAccessExpiresAt column
packages/db/src/schema/rls-config.ts                       # Add 2 entries to RLS_GLOBAL_TABLE_EXCLUSIONS
packages/db/src/schema/index.ts                            # Export new schemas
packages/db/migrations/meta/_journal.json                  # Add migration entry
apps/web/src/lib/middleware/subscription-guard.ts           # Add free access check
apps/web/src/components/settings/account-settings-client.tsx  # Danger zone rewrite
apps/web/src/components/layout/app-shell.tsx                # Add freeAccessExpiresAt prop + banner
apps/web/src/app/(authenticated)/settings/account/page.tsx  # Query free_access_expires_at
packages/email/src/index.ts                                 # Export new templates
scripts/verify-scoped-db-access.ts                          # Add new files to allowlist
apps/web/vercel.json                                         # Add account-lifecycle cron entry

# Admin App
apps/admin/src/components/clients/ClientWorkspace.tsx       # Add Access tab
apps/admin/src/components/Sidebar.tsx                       # Add Deletions nav item
apps/admin/src/components/dashboard/PlatformDashboard.tsx   # Add stat cards

# Docs
CLAUDE.md                                                   # Add admin app reference
AGENTS.md                                                   # Add Section 8
```

---

## Task 1: Database Schema & Migration

**Files:**
- Create: `packages/db/src/schema/access-plans.ts`
- Create: `packages/db/src/schema/account-deletion-requests.ts`
- Create: `packages/db/migrations/0115_account_lifecycle.sql`
- Modify: `packages/db/src/schema/communities.ts`
- Modify: `packages/db/src/schema/rls-config.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/migrations/meta/_journal.json`

- [ ] **Step 1: Create `access-plans.ts` Drizzle schema**

```typescript
// packages/db/src/schema/access-plans.ts
import { bigint, bigserial, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { users } from './users';

/**
 * Platform-level access plans for granting free access to communities.
 * NOT tenant-scoped — belongs in RLS_GLOBAL_TABLE_EXCLUSIONS.
 *
 * Status is computed at query time (not stored) to avoid drift:
 *   revoked_at set  → 'revoked'
 *   converted_at set → 'converted'
 *   now < expires_at → 'active'
 *   now < grace_ends_at → 'in_grace'
 *   else → 'expired'
 *
 * -- future: 'discounted' type with Stripe coupon sync
 */
export const accessPlans = pgTable('access_plans', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  graceEndsAt: timestamp('grace_ends_at', { withTimezone: true }).notNull(),
  durationMonths: integer('duration_months').notNull(),
  gracePeriodDays: integer('grace_period_days').notNull().default(30),
  stripeCouponId: text('stripe_coupon_id'),
  grantedBy: uuid('granted_by')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  notes: text('notes'),
  convertedAt: timestamp('converted_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revokedBy: uuid('revoked_by').references(() => users.id, { onDelete: 'set null' }),
  email14dSentAt: timestamp('email_14d_sent_at', { withTimezone: true }),
  email7dSentAt: timestamp('email_7d_sent_at', { withTimezone: true }),
  emailExpiredSentAt: timestamp('email_expired_sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Create `account-deletion-requests.ts` Drizzle schema**

```typescript
// packages/db/src/schema/account-deletion-requests.ts
import { bigint, bigserial, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { users } from './users';

/**
 * Tracks user and community deletion workflows.
 * NOT tenant-scoped — belongs in RLS_GLOBAL_TABLE_EXCLUSIONS.
 *
 * Status machine: cooling → soft_deleted → purged
 *                 cooling → cancelled
 *                 soft_deleted → recovered
 */
export const accountDeletionRequests = pgTable('account_deletion_requests', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  requestType: text('request_type').notNull(), // 'user' | 'community'
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  communityId: bigint('community_id', { mode: 'number' }).references(() => communities.id, {
    onDelete: 'set null',
  }),
  status: text('status').notNull(), // 'cooling' | 'soft_deleted' | 'purged' | 'cancelled' | 'recovered'
  coolingEndsAt: timestamp('cooling_ends_at', { withTimezone: true }).notNull(),
  scheduledPurgeAt: timestamp('scheduled_purge_at', { withTimezone: true }),
  purgedAt: timestamp('purged_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  cancelledBy: uuid('cancelled_by').references(() => users.id, { onDelete: 'set null' }),
  recoveredAt: timestamp('recovered_at', { withTimezone: true }),
  platformAdminNotifiedAt: timestamp('platform_admin_notified_at', { withTimezone: true }),
  interventionNotes: text('intervention_notes'),
  confirmationEmailSentAt: timestamp('confirmation_email_sent_at', { withTimezone: true }),
  executionEmailSentAt: timestamp('execution_email_sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 3: Add `freeAccessExpiresAt` to communities schema**

In `packages/db/src/schema/communities.ts`, add after `subscriptionCanceledAt`:

```typescript
  /** Account lifecycle: denormalized from access_plans for fast subscription guard check. */
  freeAccessExpiresAt: timestamp('free_access_expires_at', { withTimezone: true }),
```

- [ ] **Step 4: Add to RLS global exclusions**

In `packages/db/src/schema/rls-config.ts`, add to `RLS_GLOBAL_TABLE_EXCLUSIONS`:

```typescript
  { tableName: 'access_plans', reason: 'Platform-level access management — not community-scoped. Managed by super_admin only.' },
  { tableName: 'account_deletion_requests', reason: 'Platform-level deletion workflow — not community-scoped. Cross-community visibility required for admin dashboard.' },
```

**Do NOT add to `RLS_TENANT_TABLES`** — the hardcoded `RLS_EXPECTED_TENANT_TABLE_COUNT` (46) would break CI.

- [ ] **Step 5: Export new schemas from `packages/db/src/schema/index.ts`**

Add:
```typescript
export { accessPlans } from './access-plans';
export { accountDeletionRequests } from './account-deletion-requests';
```

- [ ] **Step 6: Create migration SQL `0115_account_lifecycle.sql`**

```sql
-- 0115_account_lifecycle.sql
-- Account lifecycle: free access plans + deletion workflows

-- 1. access_plans (platform-level, NOT tenant-scoped)
CREATE TABLE IF NOT EXISTS "access_plans" (
  "id" bigserial PRIMARY KEY,
  "community_id" bigint NOT NULL REFERENCES "communities"("id") ON DELETE CASCADE,
  "expires_at" timestamp with time zone NOT NULL,
  "grace_ends_at" timestamp with time zone NOT NULL,
  "duration_months" integer NOT NULL,
  "grace_period_days" integer NOT NULL DEFAULT 30,
  "stripe_coupon_id" text,
  "granted_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "notes" text,
  "converted_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "revoked_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "email_14d_sent_at" timestamp with time zone,
  "email_7d_sent_at" timestamp with time zone,
  "email_expired_sent_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_access_plans_community ON access_plans(community_id);
CREATE INDEX idx_access_plans_expires ON access_plans(expires_at) WHERE revoked_at IS NULL AND converted_at IS NULL;

-- No RLS on access_plans — platform-level table, service_role access only
REVOKE ALL ON access_plans FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON access_plans TO service_role;

-- 2. account_deletion_requests (platform-level, NOT tenant-scoped)
CREATE TABLE IF NOT EXISTS "account_deletion_requests" (
  "id" bigserial PRIMARY KEY,
  "request_type" text NOT NULL CHECK (request_type IN ('user', 'community')),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "community_id" bigint REFERENCES "communities"("id") ON DELETE SET NULL,
  "status" text NOT NULL CHECK (status IN ('cooling', 'soft_deleted', 'purged', 'cancelled', 'recovered')),
  "cooling_ends_at" timestamp with time zone NOT NULL,
  "scheduled_purge_at" timestamp with time zone,
  "purged_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "cancelled_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "recovered_at" timestamp with time zone,
  "platform_admin_notified_at" timestamp with time zone,
  "intervention_notes" text,
  "confirmation_email_sent_at" timestamp with time zone,
  "execution_email_sent_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_deletion_requests_user_status ON account_deletion_requests(user_id, status);
CREATE INDEX idx_deletion_requests_community_status ON account_deletion_requests(community_id, status);
CREATE INDEX idx_deletion_requests_cooling ON account_deletion_requests(status, cooling_ends_at) WHERE status = 'cooling';
CREATE INDEX idx_deletion_requests_purge ON account_deletion_requests(status, scheduled_purge_at) WHERE status = 'soft_deleted';

-- No RLS — platform-level table
REVOKE ALL ON account_deletion_requests FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON account_deletion_requests TO service_role;

-- 3. Add free_access_expires_at to communities
ALTER TABLE "communities" ADD COLUMN IF NOT EXISTS "free_access_expires_at" timestamp with time zone;
```

- [ ] **Step 7: Add journal entry**

Add to `packages/db/migrations/meta/_journal.json` entries array:

```json
{
  "idx": 115,
  "version": "7",
  "when": <REPLACE_WITH_Date.now()_AT_IMPLEMENTATION_TIME>,
  "tag": "0115_account_lifecycle",
  "breakpoints": true
}
```

**IMPORTANT:** The `when` value is a placeholder. Replace with `Date.now()` at implementation time. It MUST be strictly greater than the previous entry's `when` value (all journal timestamps must be monotonically increasing).

- [ ] **Step 8: Run migration locally**

Run: `pnpm --filter @propertypro/db db:migrate`

Expected: Migration applies successfully. Verify tables exist.

- [ ] **Step 9: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS — no type errors from new schema files.

- [ ] **Step 10: Commit**

```bash
git add packages/db/
git commit -m "feat: add access_plans + account_deletion_requests schema and migration"
```

---

## Task 2: Subscription Guard Modification

**Files:**
- Modify: `apps/web/src/lib/middleware/subscription-guard.ts`
- Create: `apps/web/__tests__/lifecycle/subscription-guard-free-access.test.ts`

- [ ] **Step 1: Write failing test for free access override**

```typescript
// apps/web/__tests__/lifecycle/subscription-guard-free-access.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDbSelect, mockDbFrom, mockDbWhere, mockDbLimit } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbFrom: vi.fn(),
  mockDbWhere: vi.fn(),
  mockDbLimit: vi.fn(),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: vi.fn(() => ({ select: mockDbSelect })),
}));

vi.mock('@propertypro/db', () => ({
  communities: {
    id: 'communities.id',
    subscriptionStatus: 'communities.subscriptionStatus',
    freeAccessExpiresAt: 'communities.freeAccessExpiresAt',
  },
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ eq: [col, val] }),
}));

import { requireActiveSubscriptionForMutation } from '../../src/lib/middleware/subscription-guard';

function setupMock(row: { subscriptionStatus: string | null; freeAccessExpiresAt: Date | null }) {
  mockDbLimit.mockResolvedValue([row]);
  mockDbWhere.mockReturnValue({ limit: mockDbLimit });
  mockDbFrom.mockReturnValue({ where: mockDbWhere });
  mockDbSelect.mockReturnValue({ from: mockDbFrom });
}

describe('subscription guard — free access override', () => {
  beforeEach(() => vi.clearAllMocks());

  it('allows mutation when subscription is canceled but free access is active', async () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    setupMock({ subscriptionStatus: 'canceled', freeAccessExpiresAt: futureDate });
    await expect(requireActiveSubscriptionForMutation(1)).resolves.toBeUndefined();
  });

  it('blocks mutation when subscription is canceled and free access has expired', async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    setupMock({ subscriptionStatus: 'canceled', freeAccessExpiresAt: pastDate });
    await expect(requireActiveSubscriptionForMutation(1)).rejects.toThrow('no longer active');
  });

  it('allows mutation when subscription is null and no free access', async () => {
    setupMock({ subscriptionStatus: null, freeAccessExpiresAt: null });
    await expect(requireActiveSubscriptionForMutation(1)).resolves.toBeUndefined();
  });

  it('allows mutation when subscription is active regardless of free access', async () => {
    setupMock({ subscriptionStatus: 'active', freeAccessExpiresAt: null });
    await expect(requireActiveSubscriptionForMutation(1)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/lifecycle/subscription-guard-free-access.test.ts`

Expected: FAIL — `freeAccessExpiresAt` not in the select, so free access override doesn't work.

- [ ] **Step 3: Implement guard modification**

In `apps/web/src/lib/middleware/subscription-guard.ts`, replace the `requireActiveSubscriptionForMutation` function:

```typescript
export async function requireActiveSubscriptionForMutation(
  communityId: number,
): Promise<void> {
  const db = createUnscopedClient();
  const rows = await db
    .select({
      subscriptionStatus: communities.subscriptionStatus,
      freeAccessExpiresAt: communities.freeAccessExpiresAt,
    })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);

  const status = rows[0]?.subscriptionStatus ?? null;
  const freeAccessExpiresAt = rows[0]?.freeAccessExpiresAt ?? null;

  // Free access overrides locked subscription status (see spec §4.2)
  if (freeAccessExpiresAt && freeAccessExpiresAt > new Date()) {
    return;
  }

  // Treat unknown/null status as active (fail-open for new/unprovisioned communities)
  if (status !== null && LOCKED_STATUSES.has(status)) {
    throw new AppError(
      'Your subscription is no longer active. Please reactivate to continue.',
      403,
      'SUBSCRIPTION_REQUIRED',
      { subscriptionStatus: status },
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/lifecycle/subscription-guard-free-access.test.ts`

Expected: PASS

- [ ] **Step 5: Run existing subscription guard tests to verify no regressions**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/billing/subscription-guard-integration.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/middleware/subscription-guard.ts apps/web/__tests__/lifecycle/
git commit -m "feat: subscription guard checks free_access_expires_at before locking"
```

---

## Task 3: Account Lifecycle Service — Free Access Operations

**Files:**
- Create: `apps/web/src/lib/services/account-lifecycle-service.ts`
- Create: `apps/web/__tests__/lifecycle/account-lifecycle-service.test.ts`
- Modify: `scripts/verify-scoped-db-access.ts` (add service to allowlist)

- [ ] **Step 1: Write failing tests for `computeAccessPlanStatus`**

Pure function — test all 5 status branches.

- [ ] **Step 2: Implement `computeAccessPlanStatus`**

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Write failing tests for `grantFreeAccess`**

Test: creates access plan, sets `communities.free_access_expires_at`, calls `logAuditEvent()`. Mock DB transaction, verify both writes happen inside it. Assert `logAuditEvent` is called with `action: 'create'`, `resourceType: 'access_plan'`.

- [ ] **Step 5: Implement `grantFreeAccess`**

Uses `db.transaction()` pattern. Creates plan row + updates communities column atomically. Calls `logAuditEvent()` after transaction commits. All mutation operations (`grantFreeAccess`, `revokeFreeAccess`, `extendFreeAccess` and all deletion operations) must call `logAuditEvent()` — wrap every route handler in `withErrorHandler` per API patterns.

- [ ] **Step 6: Run tests, verify pass**

- [ ] **Step 7: Write failing tests for `revokeFreeAccess`**

Test: sets `revoked_at`, clears `communities.free_access_expires_at` when no other active plans exist.

- [ ] **Step 8: Implement `revokeFreeAccess`**

- [ ] **Step 9: Write failing tests for `extendFreeAccess`**

Test: revokes old plan, creates new plan with extended dates, updates community column. All in transaction.

- [ ] **Step 10: Implement `extendFreeAccess`**

- [ ] **Step 11: Run full test suite, verify pass**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/lifecycle/account-lifecycle-service.test.ts`

- [ ] **Step 12: Add service file to CI allowlist**

In `scripts/verify-scoped-db-access.ts`, add to the allowlist:
```typescript
resolve(repoRoot, 'apps/web/src/lib/services/account-lifecycle-service.ts'),
```

- [ ] **Step 13: Run DB access guard**

Run: `pnpm guard:db-access`

Expected: PASS

- [ ] **Step 14: Commit**

```bash
git add apps/web/src/lib/services/account-lifecycle-service.ts apps/web/__tests__/lifecycle/ scripts/verify-scoped-db-access.ts
git commit -m "feat: account lifecycle service — free access operations"
```

---

## Task 4: Account Lifecycle Service — Deletion Operations

**Files:**
- Modify: `apps/web/src/lib/services/account-lifecycle-service.ts`
- Modify: `apps/web/__tests__/lifecycle/account-lifecycle-service.test.ts`

- [ ] **Step 1: Write failing tests for `requestUserDeletion`**

Test: creates deletion request with `status: 'cooling'`, `cooling_ends_at: now + 30d`.

- [ ] **Step 2: Implement `requestUserDeletion`**

- [ ] **Step 3: Write failing tests for `cancelUserDeletion`**

- [ ] **Step 4: Implement `cancelUserDeletion`**

- [ ] **Step 5: Write failing tests for `executeUserSoftDelete`**

Test: sets `users.deletedAt` in transaction, sets `status: 'soft_deleted'`, `scheduled_purge_at: now + 6 months`. Verify Supabase auth ban is non-fatal on failure.

- [ ] **Step 6: Implement `executeUserSoftDelete`**

- [ ] **Step 7: Write failing tests for `recoverUser`**

Test: clears `users.deletedAt`, sets `status: 'recovered'`, `recovered_at`.

- [ ] **Step 8: Implement `recoverUser`**

- [ ] **Step 9: Write failing tests for `purgeUserPII`**

Test: scrubs email/fullName/phone/avatarUrl, sets `status: 'purged'`, `purged_at`. Verify idempotency — second call is no-op when `purged_at IS NOT NULL`.

- [ ] **Step 10: Implement `purgeUserPII`**

- [ ] **Step 11: Write failing tests for community deletion operations**

`requestCommunityDeletion`, `interveneCommunityDeletion`, `executeCommunitySoftDelete`, `recoverCommunity`, `purgeCommunityData`.

- [ ] **Step 12: Implement community deletion operations**

- [ ] **Step 13: Run full service test suite**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/lifecycle/account-lifecycle-service.test.ts`

Expected: All PASS

- [ ] **Step 14: Commit**

```bash
git add apps/web/src/lib/services/ apps/web/__tests__/lifecycle/
git commit -m "feat: account lifecycle service — deletion + recovery + PII purge"
```

---

## Task 5: Email Templates

**Files:**
- Create: 5 email templates in `packages/email/src/templates/`
- Modify: `packages/email/src/index.ts`

- [ ] **Step 1: Create `free-access-expiring-email.tsx`**

Props: `recipientName`, `communityName`, `daysRemaining`, `subscribeUrl`. Uses `EmailLayout`, `Heading`, `Text`, `Button`.

- [ ] **Step 2: Create `free-access-expired-email.tsx`**

Props: `recipientName`, `communityName`, `subscribeUrl`, `graceDaysRemaining`.

- [ ] **Step 3: Create `account-deletion-initiated-email.tsx`**

Props: `recipientName`, `coolingEndDate`, `purgeDate`, `cancelUrl`.

- [ ] **Step 4: Create `account-deletion-executed-email.tsx`**

Props: `recipientName`, `purgeDate`.

- [ ] **Step 5: Create `account-recovered-email.tsx`**

Props: `recipientName`.

- [ ] **Step 6: Export all new templates from `packages/email/src/index.ts`**

- [ ] **Step 7: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/email/
git commit -m "feat: add 5 account lifecycle email templates"
```

---

## Task 6: Admin-Facing API Routes (Access Plans)

**Files:**
- Create: 4 route files under `apps/web/src/app/api/v1/admin/access-plans/`
- Create: `apps/web/__tests__/lifecycle/access-plans-route.test.ts`

- [ ] **Step 1: Write failing tests for POST (grant) and GET (list)**

Test: CORS headers, platform admin auth check, Zod validation, success response with computed status.

- [ ] **Step 2: Implement `apps/web/src/app/api/v1/admin/access-plans/route.ts`**

GET: list all plans with computed status. POST: grant free access. Both include CORS + OPTIONS handler. Auth: session + `platform_admin_users` check (same pattern as demo convert route). **All handlers MUST be wrapped in `withErrorHandler`** (required by API patterns). All mutations MUST call `logAuditEvent()`.

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Write failing tests for DELETE (revoke) and POST extend**

- [ ] **Step 5: Implement `[id]/route.ts` (DELETE) and `[id]/extend/route.ts` (POST)**

- [ ] **Step 6: Implement `community/[id]/route.ts` (GET)**

- [ ] **Step 7: Run full route tests**

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/api/v1/admin/access-plans/ apps/web/__tests__/lifecycle/
git commit -m "feat: admin API routes for access plan management"
```

---

## Task 7: Admin-Facing API Routes (Deletion Requests)

**Files:**
- Create: 3 route files under `apps/web/src/app/api/v1/admin/deletion-requests/`
- Create: `apps/web/__tests__/lifecycle/deletion-requests-route.test.ts`

- [ ] **Step 1: Write failing tests**

Test: list with filtering, intervene sets cancelled, recover branches on request_type.

- [ ] **Step 2: Implement routes**

GET list, POST intervene, POST recover. Same CORS + auth pattern as access plans routes.

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/v1/admin/deletion-requests/ apps/web/__tests__/lifecycle/
git commit -m "feat: admin API routes for deletion request management"
```

---

## Task 8: User-Facing API Routes (Account + Community Deletion)

**Files:**
- Create: `apps/web/src/app/api/v1/account/delete/route.ts`
- Create: `apps/web/src/app/api/v1/account/delete/cancel/route.ts`
- Create: `apps/web/src/app/api/v1/communities/delete/route.ts`
- Create: `apps/web/src/app/api/v1/communities/delete/cancel/route.ts`
- Create: `apps/web/__tests__/lifecycle/account-delete-route.test.ts`
- Create: `apps/web/__tests__/lifecycle/community-delete-route.test.ts`

- [ ] **Step 1: Write failing tests for account delete routes**

Test: POST creates request, GET returns status, POST cancel works during cooling.

- [ ] **Step 2: Implement account delete routes**

POST `/account/delete`: requires authenticated user (self only). GET `/account/delete/status`: returns current deletion request if any. POST `/account/delete/cancel`: cancels during cooling.

- [ ] **Step 3: Write failing tests for community delete routes**

Test: POST requires admin-tier role (board_president, cam, property_manager_admin — NOT board_member or site_manager). POST cancel works during cooling.

- [ ] **Step 4: Implement community delete routes**

POST `/communities/delete`: requires `requirePermission('community', 'delete')`. POST `/communities/delete/cancel`: same permission.

- [ ] **Step 5: Run all route tests**

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/v1/account/delete/ apps/web/src/app/api/v1/communities/delete/ apps/web/__tests__/lifecycle/
git commit -m "feat: user-facing account and community deletion routes"
```

---

## Task 9: Smart Subscribe Route

**Files:**
- Create: `apps/web/src/app/api/v1/billing/subscribe/route.ts`
- Create: `apps/web/__tests__/lifecycle/billing-subscribe-route.test.ts`

- [ ] **Step 1: Write failing tests**

Test: returns portal URL when `stripeCustomerId` exists, creates checkout session when it doesn't.

- [ ] **Step 2: Implement route**

POST: checks community's `stripeCustomerId`. If exists → Stripe billing portal URL. If not → Stripe checkout session. Requires admin-tier role.

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/v1/billing/subscribe/ apps/web/__tests__/lifecycle/
git commit -m "feat: smart subscribe route for free access → paid conversion"
```

---

## Task 10: Account Lifecycle Cron Job

**Files:**
- Create: `apps/web/src/app/api/v1/internal/account-lifecycle/route.ts`
- Create: `apps/web/__tests__/lifecycle/account-lifecycle-cron.test.ts`

- [ ] **Step 1: Write failing tests**

Test all 5 cron steps: deletion cooling→soft-delete, deletion purge, free access 14d/7d/expired emails. Test idempotency (second run is no-op).

- [ ] **Step 2: Implement cron route**

POST handler with `requireCronSecret(req, process.env.ACCOUNT_LIFECYCLE_CRON_SECRET)`. Runs 5 steps sequentially, logs counts, returns summary JSON.

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Register cron in `apps/web/vercel.json`**

Add to the `crons` array:
```json
{ "path": "/api/v1/internal/account-lifecycle", "schedule": "0 2 * * *" }
```

- [ ] **Step 5: Add `ACCOUNT_LIFECYCLE_CRON_SECRET` to env documentation**

Add to `.env.local.example` (or equivalent):
```
ACCOUNT_LIFECYCLE_CRON_SECRET=  # Secret for /api/v1/internal/account-lifecycle cron
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/v1/internal/account-lifecycle/ apps/web/__tests__/lifecycle/ apps/web/vercel.json
git commit -m "feat: daily account lifecycle cron — deletions + free access emails"
```

---

## Task 11: Web App UI — Free Access Banner + Account Settings

**Files:**
- Create: `apps/web/src/components/layout/free-access-banner.tsx`
- Modify: `apps/web/src/components/layout/app-shell.tsx`
- Modify: `apps/web/src/app/(authenticated)/settings/account/page.tsx`
- Modify: `apps/web/src/components/settings/account-settings-client.tsx`

- [ ] **Step 1: Create `free-access-banner.tsx`**

Component with 3 visual states: info (>14d), warning (≤14d), danger (expired/in grace). Subscribe CTA must use a button that calls `fetch('POST', '/api/v1/billing/subscribe')` and redirects to the returned URL — NOT a simple `<Link>` (links trigger GET, the route is POST).

- [ ] **Step 2: Add `freeAccessExpiresAt` prop to `AppShellProps` in `app-shell.tsx`**

Add prop, render `FreeAccessBanner` conditionally alongside existing `past_due` alert.

- [ ] **Step 3: Update account settings server component**

In `apps/web/src/app/(authenticated)/settings/account/page.tsx`, query `free_access_expires_at` from communities (via the user's community context) and pass to the client component.

- [ ] **Step 4: Rewrite Danger Zone in `account-settings-client.tsx`**

Replace "Contact support" with "Delete My Account" button. Add inline confirmation (type "DELETE"). Show active deletion request status with cancel button. Add community deletion section visible only to authorized admin roles.

- [ ] **Step 5: Run typecheck + lint**

Run: `pnpm typecheck && pnpm lint`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/ apps/web/src/app/
git commit -m "feat: free access banner + self-service deletion UI in account settings"
```

---

## Task 12: Admin App UI — Access Tab + Deletion Requests Page

**Files:**
- Modify: `apps/admin/src/components/clients/ClientWorkspace.tsx`
- Create: `apps/admin/src/app/(authenticated)/deletion-requests/page.tsx`
- Modify: `apps/admin/src/components/Sidebar.tsx`
- Modify: `apps/admin/src/components/dashboard/PlatformDashboard.tsx`

- [ ] **Step 1: Create `AccessPlanHistory` component**

Create `apps/admin/src/components/clients/AccessPlanHistory.tsx` — extracted table component with computed status per row, date formatting, extend/revoke inline actions.

- [ ] **Step 2: Add Access tab to ClientWorkspace**

Add `'access'` to `Tab` type and both tab arrays. Implement access tab content: status indicator, grant form (inline), `AccessPlanHistory` component.

- [ ] **Step 2a: Run typecheck**

Run: `pnpm --filter @propertypro/admin typecheck`

Expected: PASS

- [ ] **Step 3: Create `DeletionRequestsClient` component**

Create `apps/admin/src/components/clients/DeletionRequestsClient.tsx` — extracted client component with filtering/sorting state, status badges, intervene/recover inline actions.

- [ ] **Step 4: Create Deletion Requests page**

New route at `apps/admin/src/app/(authenticated)/deletion-requests/page.tsx`. Renders `DeletionRequestsClient`.

- [ ] **Step 4a: Run typecheck**

Run: `pnpm --filter @propertypro/admin typecheck`

Expected: PASS

- [ ] **Step 5: Add Deletions nav item to Sidebar**

Add `{ href: '/deletion-requests', label: 'Deletions', icon: UserX }` to `NAV_ITEMS`. Add badge count prop (fetched from layout server component).

- [ ] **Step 6: Add dashboard stat cards**

Add "Active Free Access" and "Pending Deletions" cards to `PlatformDashboard`.

- [ ] **Step 7: Run admin app typecheck**

Run: `pnpm --filter @propertypro/admin typecheck`

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/admin/
git commit -m "feat: admin app — access plan management + deletion requests dashboard"
```

---

## Task 13: Documentation Updates

**Files:**
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Update CLAUDE.md**

Add `apps/admin/` to Project Structure. Add admin dev command to Development Commands.

- [ ] **Step 2: Update AGENTS.md**

Add Section 8: Admin App. Document: separate deployment, CORS pattern, cookie isolation, dev login.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md AGENTS.md
git commit -m "docs: add admin app to CLAUDE.md and AGENTS.md"
```

---

## Task 14: Final Verification

- [ ] **Step 1: Run full unit test suite**

Run: `pnpm test`

Expected: All PASS

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS

- [ ] **Step 3: Run lint + DB access guard**

Run: `pnpm lint`

Expected: PASS (includes `guard:db-access`)

- [ ] **Step 4: Run build**

Run: `pnpm build`

Expected: PASS

- [ ] **Step 5: Verify migration applies on clean DB** (if integration DB available)

Run: `scripts/with-env-local.sh pnpm --filter @propertypro/db db:migrate`

Expected: Migration applies, tables created.
