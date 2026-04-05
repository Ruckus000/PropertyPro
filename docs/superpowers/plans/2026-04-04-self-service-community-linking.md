# Self-Service Community Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let owners and tenants discover their communities via public search, submit join requests with a unit identifier, and have community admins review and approve/deny. On approval, a `user_roles` row is created.

**Architecture:** New `community_join_requests` table. Public (rate-limited) search endpoint exposing minimal metadata only. Authenticated submit endpoint with eligibility checks (no existing role, no pending request, no denial within 30 days). Admin review UI scoped per-community.

**Tech Stack:** Next.js 15, TypeScript, Drizzle ORM, Zod, TanStack Query, PropertyPro design system.

**Spec:** `docs/superpowers/specs/2026-04-04-multi-community-billing-and-ownership-design.md` §7

---

## File Structure

### Create

- `packages/db/migrations/0136_community_join_requests.sql`
- `packages/db/src/schema/community-join-requests.ts`
- `apps/web/src/app/api/v1/public/communities/search/route.ts` — public search
- `apps/web/src/app/api/v1/account/join-requests/route.ts` — submit + list own requests
- `apps/web/src/app/api/v1/admin/join-requests/route.ts` — admin list
- `apps/web/src/app/api/v1/admin/join-requests/[id]/approve/route.ts`
- `apps/web/src/app/api/v1/admin/join-requests/[id]/deny/route.ts`
- `apps/web/src/lib/join-requests/eligibility.ts`
- `apps/web/src/lib/join-requests/approve-request.ts`
- `apps/web/src/app/(authenticated)/account/join-community/page.tsx` — owner search + submit UI
- `apps/web/src/app/(authenticated)/admin/join-requests/page.tsx` — admin review UI
- `apps/web/src/components/join-requests/community-search.tsx`
- `apps/web/src/components/join-requests/join-request-form.tsx`
- `apps/web/src/components/join-requests/admin-review-list.tsx`
- `apps/web/__tests__/join-requests/eligibility.test.ts`
- `apps/web/__tests__/api/join-requests.integration.test.ts`

### Modify

- `packages/db/src/schema/index.ts` — export new schema
- `packages/db/migrations/meta/_journal.json` — add entry 136

---

## Task 1: Database schema

**Files:**
- Create: `packages/db/migrations/0136_community_join_requests.sql`
- Create: `packages/db/src/schema/community-join-requests.ts`
- Modify: `packages/db/migrations/meta/_journal.json`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Create migration**

Create `packages/db/migrations/0136_community_join_requests.sql`:

```sql
CREATE TABLE community_join_requests (
  id              bigserial PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES users(id),
  community_id    bigint NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  unit_identifier text NOT NULL,
  resident_type   text NOT NULL CHECK (resident_type IN ('owner', 'tenant')),
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'denied', 'withdrawn')),
  reviewed_by     uuid REFERENCES users(id),
  reviewed_at     timestamptz,
  review_notes    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_join_requests_unique_pending
  ON community_join_requests(user_id, community_id)
  WHERE status = 'pending';
CREATE INDEX idx_join_requests_community_status
  ON community_join_requests(community_id, status);
CREATE INDEX idx_join_requests_user ON community_join_requests(user_id);

ALTER TABLE community_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_join_requests FORCE ROW LEVEL SECURITY;

-- Users can read and insert their own requests
CREATE POLICY join_requests_user_read ON community_join_requests
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY join_requests_user_insert ON community_join_requests
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY join_requests_user_update ON community_join_requests
  FOR UPDATE USING (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid() AND status IN ('pending', 'withdrawn'));

-- Community admins can read/update requests for their community
CREATE POLICY join_requests_admin_access ON community_join_requests
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.community_id = community_join_requests.community_id
        AND ur.user_id = auth.uid()
        AND ur.role IN ('board_member', 'board_president', 'cam', 'site_manager', 'pm_admin')
        AND ur.revoked_at IS NULL
    )
  );
```

- [ ] **Step 2: Create Drizzle schema**

Create `packages/db/src/schema/community-join-requests.ts`:

```typescript
import {
  bigint,
  bigserial,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { communities } from './communities';

export const communityJoinRequests = pgTable(
  'community_join_requests',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').notNull(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    unitIdentifier: text('unit_identifier').notNull(),
    residentType: text('resident_type').notNull(),
    status: text('status').notNull().default('pending'),
    reviewedBy: uuid('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNotes: text('review_notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_join_requests_unique_pending')
      .on(table.userId, table.communityId)
      .where(sql`${table.status} = 'pending'`),
    index('idx_join_requests_community_status').on(table.communityId, table.status),
    index('idx_join_requests_user').on(table.userId),
    check(
      'join_requests_resident_type_check',
      sql`${table.residentType} IN ('owner', 'tenant')`,
    ),
    check(
      'join_requests_status_check',
      sql`${table.status} IN ('pending', 'approved', 'denied', 'withdrawn')`,
    ),
  ],
);

export type CommunityJoinRequest = typeof communityJoinRequests.$inferSelect;
export type NewCommunityJoinRequest = typeof communityJoinRequests.$inferInsert;
```

- [ ] **Step 3: Export and journal**

In `packages/db/src/schema/index.ts`: `export * from './community-join-requests';`

In `packages/db/migrations/meta/_journal.json`:

```json
{
  "idx": 136,
  "version": "7",
  "when": 1775551000000,
  "tag": "0136_community_join_requests",
  "breakpoints": true
}
```

- [ ] **Step 4: Apply migration + typecheck**

Run: `pnpm --filter @propertypro/db db:migrate && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/db/migrations/0136_community_join_requests.sql \
  packages/db/src/schema/community-join-requests.ts \
  packages/db/src/schema/index.ts \
  packages/db/migrations/meta/_journal.json
git commit -m "feat(db): add community_join_requests table"
```

---

## Task 2: Eligibility checks (pure functions + DB)

**Files:**
- Create: `apps/web/src/lib/join-requests/eligibility.ts`
- Create: `apps/web/__tests__/join-requests/eligibility.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/web/__tests__/join-requests/eligibility.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: () => mockDb,
}));

const mockDb = {
  select: vi.fn(),
};

import { checkJoinRequestEligibility } from '@/lib/join-requests/eligibility';

describe('checkJoinRequestEligibility', () => {
  it('rejects if user already has a role', async () => {
    mockDb.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 1 }]) }) }),
    });
    const result = await checkJoinRequestEligibility({
      userId: 'user-1', communityId: 1,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('already_member');
  });

  it('rejects if pending request exists', async () => {
    // First query (existing role) returns none, second (pending request) returns one
    mockDb.select
      .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 1 }]) }) }) });
    const result = await checkJoinRequestEligibility({
      userId: 'user-1', communityId: 1,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('pending_request');
  });

  it('rejects if denied in last 30 days', async () => {
    mockDb.select
      .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 1, reviewedAt: new Date() }]) }) }) });
    const result = await checkJoinRequestEligibility({
      userId: 'user-1', communityId: 1,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('recently_denied');
  });

  it('accepts when no blockers', async () => {
    mockDb.select
      .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) });
    const result = await checkJoinRequestEligibility({
      userId: 'user-1', communityId: 1,
    });
    expect(result.eligible).toBe(true);
  });
});
```

- [ ] **Step 2: Implement eligibility.ts**

Create `apps/web/src/lib/join-requests/eligibility.ts`:

```typescript
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { userRoles } from '@propertypro/db';
import { communityJoinRequests } from '@propertypro/db';
import { eq, and, gte, isNull } from '@propertypro/db/filters';

export type EligibilityReason = 'already_member' | 'pending_request' | 'recently_denied';

export interface EligibilityResult {
  eligible: boolean;
  reason?: EligibilityReason;
}

export async function checkJoinRequestEligibility(input: {
  userId: string;
  communityId: number;
}): Promise<EligibilityResult> {
  const db = createUnscopedClient();

  // Check existing active role
  const [existingRole] = await db
    .select({ id: userRoles.userId })
    .from(userRoles)
    .where(
      and(
        eq(userRoles.userId, input.userId),
        eq(userRoles.communityId, input.communityId),
        isNull(userRoles.revokedAt),
      ),
    )
    .limit(1);

  if (existingRole) return { eligible: false, reason: 'already_member' };

  // Check pending request
  const [pending] = await db
    .select({ id: communityJoinRequests.id })
    .from(communityJoinRequests)
    .where(
      and(
        eq(communityJoinRequests.userId, input.userId),
        eq(communityJoinRequests.communityId, input.communityId),
        eq(communityJoinRequests.status, 'pending'),
      ),
    )
    .limit(1);

  if (pending) return { eligible: false, reason: 'pending_request' };

  // Check recent denial (within 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [recentDenial] = await db
    .select({ id: communityJoinRequests.id })
    .from(communityJoinRequests)
    .where(
      and(
        eq(communityJoinRequests.userId, input.userId),
        eq(communityJoinRequests.communityId, input.communityId),
        eq(communityJoinRequests.status, 'denied'),
        gte(communityJoinRequests.reviewedAt, thirtyDaysAgo),
      ),
    )
    .limit(1);

  if (recentDenial) return { eligible: false, reason: 'recently_denied' };

  return { eligible: true };
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm --filter web test eligibility`
Expected: PASS (4 tests)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/join-requests/eligibility.ts apps/web/__tests__/join-requests/eligibility.test.ts
git commit -m "feat(join-requests): add eligibility checks"
```

---

## Task 3: Public community search endpoint

**Files:**
- Create: `apps/web/src/app/api/v1/public/communities/search/route.ts`

- [ ] **Step 1: Create endpoint**

Create `apps/web/src/app/api/v1/public/communities/search/route.ts`:

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { communities, userRoles } from '@propertypro/db';
import { and, ilike, eq, isNull, sql } from '@propertypro/db/filters';
import { rateLimitIp } from '@/lib/api/rate-limit';

const querySchema = z.object({
  q: z.string().trim().min(2).max(100),
  city: z.string().trim().max(100).optional(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  // Rate limit: 30/min per IP (reuse existing rate limiter)
  await rateLimitIp(req, { key: 'community-search', max: 30, windowMs: 60_000 });

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    q: searchParams.get('q'),
    city: searchParams.get('city') ?? undefined,
  });
  if (!parsed.success) throw new ValidationError('Invalid query', { issues: parsed.error.issues });

  const db = createUnscopedClient();

  const conditions = [
    ilike(communities.name, `%${parsed.data.q}%`),
    isNull(communities.deletedAt),
  ];
  if (parsed.data.city) {
    conditions.push(ilike(communities.city, `%${parsed.data.city}%`));
  }

  const rows = await db
    .select({
      id: communities.id,
      name: communities.name,
      city: communities.city,
      state: communities.state,
      communityType: communities.communityType,
      memberCount: sql<number>`(
        SELECT COUNT(*)::int FROM user_roles ur
        WHERE ur.community_id = ${communities.id}
          AND ur.revoked_at IS NULL
      )`,
    })
    .from(communities)
    .where(and(...conditions))
    .limit(20);

  // Round member count to nearest 10 for privacy
  const results = rows.map((r) => ({
    id: r.id,
    name: r.name,
    city: r.city,
    state: r.state,
    communityType: r.communityType,
    memberCount: Math.floor(r.memberCount / 10) * 10,
  }));

  return NextResponse.json({ data: results });
});
```

- [ ] **Step 2: Allowlist in guard**

Add to `scripts/verify-scoped-db-access.ts`. This is a public endpoint that intentionally queries across all communities for discovery, but only returns minimal non-sensitive metadata.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck && pnpm guard:db-access`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/v1/public/communities/search/route.ts scripts/verify-scoped-db-access.ts
git commit -m "feat(join-requests): public community search endpoint"
```

---

## Task 4: Submit join request endpoint

**Files:**
- Create: `apps/web/src/app/api/v1/account/join-requests/route.ts`

- [ ] **Step 1: Create endpoint**

Create `apps/web/src/app/api/v1/account/join-requests/route.ts`:

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { ValidationError, ConflictError } from '@/lib/api/errors';
import { checkJoinRequestEligibility } from '@/lib/join-requests/eligibility';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { communityJoinRequests } from '@propertypro/db';
import { eq, and, gte } from '@propertypro/db/filters';
import { rateLimitUser } from '@/lib/api/rate-limit';

const createSchema = z.object({
  communityId: z.number().int().positive(),
  unitIdentifier: z.string().trim().min(1).max(50),
  residentType: z.enum(['owner', 'tenant']),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();

  // Rate limit: 5/day per user
  await rateLimitUser(userId, { key: 'join-request-submit', max: 5, windowMs: 24 * 60 * 60 * 1000 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError('Invalid request', { issues: parsed.error.issues });

  const eligibility = await checkJoinRequestEligibility({
    userId,
    communityId: parsed.data.communityId,
  });
  if (!eligibility.eligible) {
    throw new ConflictError(`Cannot submit join request: ${eligibility.reason}`, {
      reason: eligibility.reason,
    });
  }

  const db = createUnscopedClient();
  const [row] = await db
    .insert(communityJoinRequests)
    .values({
      userId,
      communityId: parsed.data.communityId,
      unitIdentifier: parsed.data.unitIdentifier,
      residentType: parsed.data.residentType,
    })
    .returning();

  return NextResponse.json({ data: { requestId: row.id, status: 'pending' } }, { status: 201 });
});

export const GET = withErrorHandler(async () => {
  const userId = await requireAuthenticatedUserId();
  const db = createUnscopedClient();
  const rows = await db
    .select()
    .from(communityJoinRequests)
    .where(eq(communityJoinRequests.userId, userId));
  return NextResponse.json({ data: rows });
});
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/v1/account/join-requests/route.ts
git commit -m "feat(join-requests): submit join request endpoint"
```

---

## Task 5: Admin approve/deny endpoints

**Files:**
- Create: `apps/web/src/app/api/v1/admin/join-requests/route.ts`
- Create: `apps/web/src/app/api/v1/admin/join-requests/[id]/approve/route.ts`
- Create: `apps/web/src/app/api/v1/admin/join-requests/[id]/deny/route.ts`
- Create: `apps/web/src/lib/join-requests/approve-request.ts`

- [ ] **Step 1: Create approve service**

Create `apps/web/src/lib/join-requests/approve-request.ts`:

```typescript
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { communityJoinRequests, userRoles } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { createNotification } from '@/lib/services/notification-service';
import { sendEmail } from '@propertypro/email';

export async function approveJoinRequest(input: {
  requestId: number;
  reviewerUserId: string;
  notes?: string;
}): Promise<void> {
  const db = createUnscopedClient();

  await db.transaction(async (tx) => {
    const [req] = await tx
      .select()
      .from(communityJoinRequests)
      .where(eq(communityJoinRequests.id, input.requestId))
      .limit(1);

    if (!req) throw new Error('Join request not found');
    if (req.status !== 'pending') throw new Error('Request is not pending');

    // Create user_roles row
    await tx.insert(userRoles).values({
      userId: req.userId,
      communityId: req.communityId,
      role: req.residentType, // 'owner' or 'tenant'
      displayTitle: req.residentType === 'owner' ? 'Owner' : 'Tenant',
    });

    // Mark request approved
    await tx
      .update(communityJoinRequests)
      .set({
        status: 'approved',
        reviewedBy: input.reviewerUserId,
        reviewedAt: new Date(),
        reviewNotes: input.notes,
        updatedAt: new Date(),
      })
      .where(eq(communityJoinRequests.id, input.requestId));
  });

  // Notify requester (outside transaction)
  const [approved] = await db.select().from(communityJoinRequests).where(eq(communityJoinRequests.id, input.requestId)).limit(1);
  if (approved) {
    await createNotification({
      userId: approved.userId,
      communityId: approved.communityId,
      title: 'Welcome!',
      body: `Your request to join has been approved.`,
      category: 'account',
      priority: 'aware',
    });
  }
}

export async function denyJoinRequest(input: {
  requestId: number;
  reviewerUserId: string;
  notes?: string;
}): Promise<void> {
  const db = createUnscopedClient();

  await db
    .update(communityJoinRequests)
    .set({
      status: 'denied',
      reviewedBy: input.reviewerUserId,
      reviewedAt: new Date(),
      reviewNotes: input.notes,
      updatedAt: new Date(),
    })
    .where(eq(communityJoinRequests.id, input.requestId));

  const [denied] = await db.select().from(communityJoinRequests).where(eq(communityJoinRequests.id, input.requestId)).limit(1);
  if (denied) {
    await createNotification({
      userId: denied.userId,
      communityId: denied.communityId,
      title: 'Join request not approved',
      body: input.notes ? `Reason: ${input.notes}` : 'Please contact your community admin for details.',
      category: 'account',
      priority: 'aware',
    });
  }
}
```

- [ ] **Step 2: Create admin list endpoint**

Create `apps/web/src/app/api/v1/admin/join-requests/route.ts`:

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requirePermission } from '@/lib/api/permissions';
import { createScopedClient } from '@propertypro/db';
import { communityJoinRequests } from '@propertypro/db';
import { eq, and, desc } from '@propertypro/db/filters';
import { resolveCommunityId } from '@/lib/api/community-context';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const communityId = await resolveCommunityId(req);
  await requirePermission('settings', 'write'); // admin-level permission

  const db = createScopedClient(communityId);
  const rows = await db
    .select()
    .from(communityJoinRequests)
    .where(
      and(
        eq(communityJoinRequests.communityId, communityId),
        eq(communityJoinRequests.status, 'pending'),
      ),
    )
    .orderBy(desc(communityJoinRequests.createdAt));

  return NextResponse.json({ data: rows });
});
```

- [ ] **Step 3: Create approve endpoint**

Create `apps/web/src/app/api/v1/admin/join-requests/[id]/approve/route.ts`:

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requirePermission } from '@/lib/api/permissions';
import { approveJoinRequest } from '@/lib/join-requests/approve-request';
import { logAuditEvent } from '@propertypro/db';
import { resolveCommunityId } from '@/lib/api/community-context';

const bodySchema = z.object({ notes: z.string().max(500).optional() });

export const POST = withErrorHandler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const userId = await requireAuthenticatedUserId();
  const communityId = await resolveCommunityId(req);
  await requirePermission('settings', 'write');

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.parse(body);

  const requestId = Number(ctx.params.id);
  await approveJoinRequest({ requestId, reviewerUserId: userId, notes: parsed.notes });

  await logAuditEvent({
    userId,
    communityId,
    action: 'approve',
    resourceType: 'community_join_request',
    resourceId: String(requestId),
  });

  return NextResponse.json({ data: { requestId, status: 'approved' } });
});
```

- [ ] **Step 4: Create deny endpoint**

Create `apps/web/src/app/api/v1/admin/join-requests/[id]/deny/route.ts` (mirror approve with `denyJoinRequest`).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/join-requests/approve-request.ts \
  apps/web/src/app/api/v1/admin/join-requests/
git commit -m "feat(join-requests): admin approve/deny endpoints"
```

---

## Task 6: Integration tests for join request lifecycle

**Files:**
- Create: `apps/web/__tests__/api/join-requests.integration.test.ts`

- [ ] **Step 1: Write lifecycle test**

Create `apps/web/__tests__/api/join-requests.integration.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { communities, communityJoinRequests, userRoles, users } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { approveJoinRequest, denyJoinRequest } from '@/lib/join-requests/approve-request';

describe('join request lifecycle', () => {
  const TEST_USER = '00000000-0000-0000-0000-000000000777';
  const REVIEWER = '00000000-0000-0000-0000-000000000778';
  let communityId: number;
  let requestId: number;

  beforeAll(async () => {
    const db = createUnscopedClient();
    const [comm] = await db.insert(communities).values({
      name: 'Test JR Comm', slug: 'jr-test', communityType: 'condo_718',
    } as any).returning({ id: communities.id });
    communityId = comm.id;
  });

  it('approve creates user_roles row and marks request approved', async () => {
    const db = createUnscopedClient();
    const [req] = await db.insert(communityJoinRequests).values({
      userId: TEST_USER,
      communityId,
      unitIdentifier: 'Unit 101',
      residentType: 'owner',
    }).returning({ id: communityJoinRequests.id });
    requestId = req.id;

    await approveJoinRequest({ requestId, reviewerUserId: REVIEWER });

    const [updated] = await db.select().from(communityJoinRequests).where(eq(communityJoinRequests.id, requestId));
    expect(updated.status).toBe('approved');
    expect(updated.reviewedBy).toBe(REVIEWER);

    const [role] = await db.select().from(userRoles).where(
      eq(userRoles.userId, TEST_USER),
    );
    expect(role.role).toBe('owner');
    expect(role.communityId).toBe(communityId);
  });

  it('deny marks request denied without creating role', async () => {
    const db = createUnscopedClient();
    const [req] = await db.insert(communityJoinRequests).values({
      userId: '00000000-0000-0000-0000-000000000779',
      communityId,
      unitIdentifier: 'Unit 202',
      residentType: 'tenant',
    }).returning({ id: communityJoinRequests.id });

    await denyJoinRequest({ requestId: req.id, reviewerUserId: REVIEWER, notes: 'Unit not recognized' });

    const [updated] = await db.select().from(communityJoinRequests).where(eq(communityJoinRequests.id, req.id));
    expect(updated.status).toBe('denied');
    expect(updated.reviewNotes).toBe('Unit not recognized');

    const roles = await db.select().from(userRoles).where(
      eq(userRoles.userId, '00000000-0000-0000-0000-000000000779'),
    );
    expect(roles).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `scripts/with-env-local.sh pnpm exec vitest run --config apps/web/vitest.integration.config.ts join-requests.integration`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/__tests__/api/join-requests.integration.test.ts
git commit -m "test(join-requests): integration tests for approve/deny lifecycle"
```

---

## Task 7: Owner search + submit UI

**Files:**
- Create: `apps/web/src/app/(authenticated)/account/join-community/page.tsx`
- Create: `apps/web/src/components/join-requests/community-search.tsx`
- Create: `apps/web/src/components/join-requests/join-request-form.tsx`

- [ ] **Step 1: Create search component**

Create `apps/web/src/components/join-requests/community-search.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Card, Badge } from '@propertypro/ui';
import { Button } from '@/components/ui/button';

interface SearchResult {
  id: number;
  name: string;
  city: string;
  state: string;
  communityType: string;
  memberCount: number;
}

export function CommunitySearch({ onSelect }: { onSelect: (c: SearchResult) => void }) {
  const [q, setQ] = useState('');
  const { data } = useQuery<{ data: SearchResult[] }>({
    queryKey: ['community-search', q],
    queryFn: async () => {
      const res = await fetch(`/api/v1/public/communities/search?q=${encodeURIComponent(q)}`);
      return res.json();
    },
    enabled: q.length >= 2,
  });

  return (
    <div className="space-y-4">
      <Input
        placeholder="Search by community name..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="space-y-2">
        {data?.data?.map((c) => (
          <Card key={c.id} className="p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">{c.name}</p>
                <p className="text-sm text-secondary">
                  {c.city}, {c.state} · <Badge variant="outline">{c.communityType}</Badge>
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => onSelect(c)}>
                Request to Join
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create submit form**

Create `apps/web/src/components/join-requests/join-request-form.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AlertBanner } from '@propertypro/ui';

export function JoinRequestForm({ communityId, communityName, onDone }: {
  communityId: number;
  communityName: string;
  onDone: () => void;
}) {
  const [unit, setUnit] = useState('');
  const [type, setType] = useState<'owner' | 'tenant'>('owner');

  const submit = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/v1/account/join-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, unitIdentifier: unit, residentType: type }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.reason ?? 'Submission failed');
      }
      return res.json();
    },
    onSuccess: onDone,
  });

  return (
    <div className="space-y-4">
      <h3 className="text-heading-sm">Join {communityName}</h3>
      {submit.error && <AlertBanner variant="danger">{submit.error.message}</AlertBanner>}
      <div>
        <label className="text-sm font-medium">Unit identifier</label>
        <Input placeholder="e.g. Unit 101 or Lot 12" value={unit} onChange={(e) => setUnit(e.target.value)} />
      </div>
      <div>
        <label className="text-sm font-medium">I am a(n)</label>
        <select
          className="w-full border border-default rounded-md px-3 py-2 text-base"
          value={type}
          onChange={(e) => setType(e.target.value as any)}
        >
          <option value="owner">Owner</option>
          <option value="tenant">Tenant</option>
        </select>
      </div>
      <Button onClick={() => submit.mutate()} disabled={!unit || submit.isPending}>
        {submit.isPending ? 'Submitting…' : 'Submit Request'}
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Create page**

Create `apps/web/src/app/(authenticated)/account/join-community/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { CommunitySearch } from '@/components/join-requests/community-search';
import { JoinRequestForm } from '@/components/join-requests/join-request-form';

export default function JoinCommunityPage() {
  const [selected, setSelected] = useState<{ id: number; name: string } | null>(null);
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return <div className="p-6">Request submitted. You'll hear from the community admin soon.</div>;
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <h1 className="text-heading-md">Join Another Community</h1>
      {!selected ? (
        <CommunitySearch onSelect={(c) => setSelected({ id: c.id, name: c.name })} />
      ) : (
        <JoinRequestForm
          communityId={selected.id}
          communityName={selected.name}
          onDone={() => setSubmitted(true)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/\(authenticated\)/account/join-community/ apps/web/src/components/join-requests/
git commit -m "feat(join-requests): owner search and submit UI"
```

---

## Task 8: Admin review UI

**Files:**
- Create: `apps/web/src/app/(authenticated)/admin/join-requests/page.tsx`
- Create: `apps/web/src/components/join-requests/admin-review-list.tsx`

- [ ] **Step 1: Create review list component**

Create `apps/web/src/components/join-requests/admin-review-list.tsx`:

```tsx
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, Badge } from '@propertypro/ui';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';

interface JoinRequest {
  id: number;
  userId: string;
  unitIdentifier: string;
  residentType: string;
  createdAt: string;
}

export function AdminReviewList() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ data: JoinRequest[] }>({
    queryKey: ['admin-join-requests'],
    queryFn: async () => {
      const res = await fetch('/api/v1/admin/join-requests');
      return res.json();
    },
  });

  const act = useMutation({
    mutationFn: async (input: { id: number; action: 'approve' | 'deny'; notes?: string }) => {
      const res = await fetch(`/api/v1/admin/join-requests/${input.id}/${input.action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: input.notes }),
      });
      if (!res.ok) throw new Error(`${input.action} failed`);
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-join-requests'] }),
  });

  if (isLoading) return <p>Loading…</p>;
  if (!data?.data?.length) {
    return <EmptyState title="No pending requests" description="All join requests have been reviewed." />;
  }

  return (
    <div className="space-y-3">
      {data.data.map((r) => (
        <Card key={r.id} className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">{r.unitIdentifier}</p>
              <p className="text-sm text-secondary">
                <Badge variant="outline">{r.residentType}</Badge> · Submitted {new Date(r.createdAt).toLocaleDateString()}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => act.mutate({ id: r.id, action: 'deny' })}>
                Deny
              </Button>
              <Button size="sm" onClick={() => act.mutate({ id: r.id, action: 'approve' })}>
                Approve
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create admin page**

Create `apps/web/src/app/(authenticated)/admin/join-requests/page.tsx`:

```tsx
import { AdminReviewList } from '@/components/join-requests/admin-review-list';

export default function AdminJoinRequestsPage() {
  return (
    <div className="p-6 max-w-4xl space-y-6">
      <h1 className="text-heading-md">Pending Join Requests</h1>
      <AdminReviewList />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/\(authenticated\)/admin/join-requests/ apps/web/src/components/join-requests/admin-review-list.tsx
git commit -m "feat(join-requests): admin review UI"
```

---

## Final Verification

- [ ] **All tests pass**

Run: `pnpm test && scripts/with-env-local.sh pnpm exec vitest run --config apps/web/vitest.integration.config.ts`

- [ ] **Typecheck + lint + guard**

Run: `pnpm typecheck && pnpm lint && pnpm guard:db-access`

- [ ] **Manual QA**

- Public search: searching "sunset" returns name, city, state, type, approximate memberCount (rounded to 10). Street address and admin names NOT returned.
- Rate limit: 31st search in 60s returns 429
- Submit: create request, verify pending status, verify notification fires to admins (or community_id admin-scoped notification)
- Duplicate block: submitting a second pending request for same community returns 409 with `reason: 'pending_request'`
- 30-day block: manually deny a request, attempt re-submit → returns 409 with `reason: 'recently_denied'`
- Admin approve: verify user_roles row created with role matching residentType
- Admin deny: verify status updated, no role created, requester notified
- RLS verified: user B cannot see user A's join requests; non-admin cannot see admin endpoints

- [ ] **Design system compliance**

- Search results use Card with E0 elevation
- Admin review uses standard button variants (secondary/destructive)
- Empty states use standard EmptyState
- Touch targets 44px mobile
