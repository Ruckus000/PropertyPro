# Unified Owner Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide users with roles in 2+ communities a unified `/dashboard/overview` page showing property cards, activity feed, and upcoming events aggregated across all their communities.

**Architecture:** New route `/dashboard/overview` visible only to multi-community users. A new allowlisted query module runs parallel scoped queries per community, then merges and tags results. Breaks the single-community scoping model only for authorized user_ids (explicit contract). Preserves RLS guarantees by never using unscoped SELECTs across communities.

**Tech Stack:** Next.js 15, TypeScript, Drizzle ORM, TanStack Query, shadcn/ui, PropertyPro design system primitives.

**Spec:** `docs/superpowers/specs/2026-04-04-multi-community-billing-and-ownership-design.md` §5

**Prerequisite:** Plan 1 (billing groups) must be complete OR can ship independently.

---

## File Structure

### Create

- `apps/web/src/lib/queries/cross-community.ts` — allowlisted cross-community query module
- `apps/web/src/lib/queries/cross-community.types.ts` — shared types (community card, activity item, event)
- `apps/web/src/app/api/v1/overview/route.ts` — GET endpoint returning overview data
- `apps/web/src/app/(authenticated)/dashboard/overview/page.tsx` — route page
- `apps/web/src/components/overview/property-cards.tsx` — community cards grid
- `apps/web/src/components/overview/activity-feed.tsx` — cross-community activity list
- `apps/web/src/components/overview/upcoming-events.tsx` — cross-community meetings/votes
- `apps/web/src/components/overview/community-switcher.tsx` — nav dropdown for multi-community users
- `apps/web/src/hooks/use-user-communities.ts` — fetches user's community list
- `apps/web/__tests__/queries/cross-community.integration.test.ts`
- `apps/web/__tests__/api/overview.integration.test.ts`

### Modify

- `apps/web/src/app/(authenticated)/layout.tsx` — add community switcher for multi-community users
- `apps/web/src/middleware.ts` — redirect `/dashboard` to `/dashboard/overview` for multi-community users
- `scripts/verify-scoped-db-access.ts` — allowlist `cross-community.ts`

---

## Task 1: Shared types and query module skeleton

**Files:**
- Create: `apps/web/src/lib/queries/cross-community.types.ts`
- Create: `apps/web/src/lib/queries/cross-community.ts`
- Modify: `scripts/verify-scoped-db-access.ts`

- [ ] **Step 1: Create shared types**

Create `apps/web/src/lib/queries/cross-community.types.ts`:

```typescript
export interface CommunityCard {
  communityId: number;
  communityName: string;
  communitySlug: string;
  communityType: 'condo_718' | 'hoa_720' | 'apartment';
  complianceScore: number | null;
  urgentItemCount: number;
  criticalItemCount: number;
}

export interface ActivityItem {
  id: string;
  communityId: number;
  communityName: string;
  type: 'document' | 'announcement' | 'meeting_minutes' | 'violation';
  title: string;
  occurredAt: string; // ISO
  link: string; // absolute path within the community's subdomain
}

export interface UpcomingEvent {
  id: string;
  communityId: number;
  communityName: string;
  type: 'meeting' | 'vote' | 'esign_due' | 'inspection';
  title: string;
  scheduledFor: string; // ISO
  link: string;
}
```

- [ ] **Step 2: Implement authorization helper**

Create `apps/web/src/lib/queries/cross-community.ts`:

```typescript
/**
 * Cross-community query module — ALLOWLISTED for unsafe DB access.
 *
 * Authorization contract: every function in this module MUST first
 * resolve the caller's authorized community_id list via user_roles,
 * then run scoped queries only against those IDs.
 *
 * Never run a single SELECT with community_id IN (...) because that
 * bypasses RLS. Parallel scoped queries preserve the RLS guarantee.
 */
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { createScopedClient } from '@propertypro/db';
import { userRoles } from '@propertypro/db';
import { eq, and, isNull } from '@propertypro/db/filters';
import type { CommunityCard, ActivityItem, UpcomingEvent } from './cross-community.types';

export async function getAuthorizedCommunityIds(userId: string): Promise<number[]> {
  const db = createUnscopedClient();
  const rows = await db
    .selectDistinct({ communityId: userRoles.communityId })
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), isNull(userRoles.revokedAt)));
  return rows.map((r) => r.communityId);
}
```

- [ ] **Step 3: Allowlist the module**

Edit `scripts/verify-scoped-db-access.ts`:

Add `apps/web/src/lib/queries/cross-community.ts` to the `ALLOWED_UNSAFE_IMPORTS` list (or equivalent allowlist).

- [ ] **Step 4: Run db access guard**

Run: `pnpm guard:db-access`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/queries/cross-community.types.ts \
  apps/web/src/lib/queries/cross-community.ts \
  scripts/verify-scoped-db-access.ts
git commit -m "feat(overview): add cross-community query module skeleton"
```

---

## Task 2: Authorized community IDs resolver (TDD)

**Files:**
- Create: `apps/web/__tests__/queries/cross-community.integration.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/web/__tests__/queries/cross-community.integration.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { communities, userRoles } from '@propertypro/db';
import { getAuthorizedCommunityIds } from '@/lib/queries/cross-community';

describe('getAuthorizedCommunityIds (integration)', () => {
  const TEST_USER = '00000000-0000-0000-0000-000000000999';

  beforeAll(async () => {
    const db = createUnscopedClient();
    // Clean and insert test data
    await db.delete(userRoles).where(eq(userRoles.userId, TEST_USER));
  });

  it('returns all community IDs the user belongs to', async () => {
    const db = createUnscopedClient();

    // Insert 2 test communities
    const [c1, c2] = await db
      .insert(communities)
      .values([
        { name: 'Test A', slug: 'cross-a', communityType: 'condo_718' } as any,
        { name: 'Test B', slug: 'cross-b', communityType: 'hoa_720' } as any,
      ])
      .returning({ id: communities.id });

    await db.insert(userRoles).values([
      { userId: TEST_USER, communityId: c1.id, role: 'owner' },
      { userId: TEST_USER, communityId: c2.id, role: 'owner' },
    ]);

    const result = await getAuthorizedCommunityIds(TEST_USER);
    expect(result.sort()).toEqual([c1.id, c2.id].sort());
  });

  it('returns empty array for user with no roles', async () => {
    const result = await getAuthorizedCommunityIds('00000000-0000-0000-0000-000000000000');
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test**

Run: `scripts/with-env-local.sh pnpm exec vitest run --config apps/web/vitest.integration.config.ts cross-community`
Expected: PASS (function already exists from Task 1)

- [ ] **Step 3: Commit**

```bash
git add apps/web/__tests__/queries/cross-community.integration.test.ts
git commit -m "test(overview): integration tests for community authorization"
```

---

## Task 3: Community cards query

**Files:**
- Modify: `apps/web/src/lib/queries/cross-community.ts`

- [ ] **Step 1: Add getCommunityCards function**

Append to `apps/web/src/lib/queries/cross-community.ts`:

```typescript
export async function getCommunityCards(userId: string): Promise<CommunityCard[]> {
  const communityIds = await getAuthorizedCommunityIds(userId);
  if (communityIds.length === 0) return [];

  const results = await Promise.all(
    communityIds.map(async (cId) => {
      const scoped = createScopedClient(cId);

      // 1. Fetch community metadata (scoped query)
      const [comm] = await scoped
        .select({
          id: communities.id,
          name: communities.name,
          slug: communities.slug,
          communityType: communities.communityType,
        })
        .from(communities)
        .where(eq(communities.id, cId))
        .limit(1);

      if (!comm) return null;

      // 2. Fetch compliance score + urgent/critical counts (scoped)
      const score = await computeComplianceScore(scoped, cId);
      const { urgentCount, criticalCount } = await countUrgentItems(scoped, cId);

      return {
        communityId: comm.id,
        communityName: comm.name,
        communitySlug: comm.slug,
        communityType: comm.communityType as any,
        complianceScore: score,
        urgentItemCount: urgentCount,
        criticalItemCount: criticalCount,
      } satisfies CommunityCard;
    }),
  );

  return results.filter((r): r is CommunityCard => r !== null);
}

// Helper stubs — wire to existing compliance calculator
async function computeComplianceScore(scoped: ReturnType<typeof createScopedClient>, cId: number): Promise<number | null> {
  // Use existing compliance calculator from apps/web/src/lib/utils/compliance-calculator.ts
  // This is a stub — replace with actual call
  const { calculateComplianceScore } = await import('@/lib/utils/compliance-calculator');
  return calculateComplianceScore(scoped, cId);
}

async function countUrgentItems(
  scoped: ReturnType<typeof createScopedClient>,
  cId: number,
): Promise<{ urgentCount: number; criticalCount: number }> {
  // Query compliance_checklist_items for items in 'urgent'/'critical' escalation
  // Wire to existing helpers
  return { urgentCount: 0, criticalCount: 0 }; // stub — replace with real query
}
```

Add imports: `import { communities } from '@propertypro/db';`

- [ ] **Step 2: Wire actual compliance counts**

Check `apps/web/src/lib/utils/compliance-calculator.ts` for the existing API surface. If it exposes a `getUrgentItemCounts(scoped, cId)` helper, use it. Otherwise, query `compliance_checklist_items` directly:

```typescript
async function countUrgentItems(scoped, cId) {
  const rows = await scoped
    .select({ escalation: complianceChecklistItems.escalation })
    .from(complianceChecklistItems)
    .where(and(eq(complianceChecklistItems.communityId, cId), isNull(complianceChecklistItems.completedAt)));

  let urgentCount = 0, criticalCount = 0;
  for (const r of rows) {
    if (r.escalation === 'urgent') urgentCount++;
    if (r.escalation === 'critical') criticalCount++;
  }
  return { urgentCount, criticalCount };
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/queries/cross-community.ts
git commit -m "feat(overview): add community cards cross-community query"
```

---

## Task 4: Activity feed and upcoming events queries

**Files:**
- Modify: `apps/web/src/lib/queries/cross-community.ts`

- [ ] **Step 1: Add getActivityFeed**

Append to `apps/web/src/lib/queries/cross-community.ts`:

```typescript
export async function getActivityFeed(userId: string, days = 30): Promise<ActivityItem[]> {
  const communityIds = await getAuthorizedCommunityIds(userId);
  if (communityIds.length === 0) return [];

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const results = await Promise.all(
    communityIds.map(async (cId) => {
      const scoped = createScopedClient(cId);

      // Get community name for tagging
      const [comm] = await scoped.select({ name: communities.name }).from(communities).where(eq(communities.id, cId)).limit(1);
      if (!comm) return [];

      // Recent documents
      const docs = await scoped
        .select({ id: documents.id, title: documents.title, createdAt: documents.createdAt })
        .from(documents)
        .where(and(eq(documents.communityId, cId), gte(documents.createdAt, cutoff), isNull(documents.deletedAt)))
        .orderBy(desc(documents.createdAt))
        .limit(10);

      // Recent announcements
      const announcements = await scoped
        .select({ id: announcementsTable.id, title: announcementsTable.title, createdAt: announcementsTable.createdAt })
        .from(announcementsTable)
        .where(and(eq(announcementsTable.communityId, cId), gte(announcementsTable.createdAt, cutoff), isNull(announcementsTable.deletedAt)))
        .orderBy(desc(announcementsTable.createdAt))
        .limit(10);

      return [
        ...docs.map((d) => ({
          id: `doc-${d.id}`,
          communityId: cId,
          communityName: comm.name,
          type: 'document' as const,
          title: d.title,
          occurredAt: d.createdAt.toISOString(),
          link: `/documents/${d.id}`,
        })),
        ...announcements.map((a) => ({
          id: `ann-${a.id}`,
          communityId: cId,
          communityName: comm.name,
          type: 'announcement' as const,
          title: a.title,
          occurredAt: a.createdAt.toISOString(),
          link: `/announcements/${a.id}`,
        })),
      ];
    }),
  );

  // Flatten, sort by date desc, limit to 50
  return results.flat().sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 50);
}
```

- [ ] **Step 2: Add getUpcomingEvents**

```typescript
export async function getUpcomingEvents(userId: string, days = 30): Promise<UpcomingEvent[]> {
  const communityIds = await getAuthorizedCommunityIds(userId);
  if (communityIds.length === 0) return [];

  const now = new Date();
  const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const results = await Promise.all(
    communityIds.map(async (cId) => {
      const scoped = createScopedClient(cId);
      const [comm] = await scoped.select({ name: communities.name }).from(communities).where(eq(communities.id, cId)).limit(1);
      if (!comm) return [];

      // Upcoming meetings
      const meetings = await scoped
        .select({ id: meetingsTable.id, title: meetingsTable.title, scheduledFor: meetingsTable.scheduledFor })
        .from(meetingsTable)
        .where(
          and(
            eq(meetingsTable.communityId, cId),
            gte(meetingsTable.scheduledFor, now),
            lte(meetingsTable.scheduledFor, until),
            isNull(meetingsTable.deletedAt),
          ),
        )
        .orderBy(asc(meetingsTable.scheduledFor))
        .limit(10);

      return meetings.map((m) => ({
        id: `meeting-${m.id}`,
        communityId: cId,
        communityName: comm.name,
        type: 'meeting' as const,
        title: m.title,
        scheduledFor: m.scheduledFor.toISOString(),
        link: `/meetings/${m.id}`,
      }));
    }),
  );

  return results.flat().sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor)).slice(0, 20);
}
```

Add imports for `documents`, `announcements as announcementsTable`, `meetings as meetingsTable`, `desc`, `asc`, `gte`, `lte` from appropriate modules.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/queries/cross-community.ts
git commit -m "feat(overview): add activity feed and upcoming events queries"
```

---

## Task 5: Overview API endpoint

**Files:**
- Create: `apps/web/src/app/api/v1/overview/route.ts`
- Create: `apps/web/__tests__/api/overview.integration.test.ts`

- [ ] **Step 1: Write test**

Create `apps/web/__tests__/api/overview.integration.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/queries/cross-community', () => ({
  getCommunityCards: vi.fn().mockResolvedValue([
    { communityId: 1, communityName: 'A', communitySlug: 'a', communityType: 'condo_718', complianceScore: 87, urgentItemCount: 2, criticalItemCount: 0 },
  ]),
  getActivityFeed: vi.fn().mockResolvedValue([]),
  getUpcomingEvents: vi.fn().mockResolvedValue([]),
}));

import { GET } from '@/app/api/v1/overview/route';
import { NextRequest } from 'next/server';

describe('GET /api/v1/overview', () => {
  it('returns cards, activity, and events', async () => {
    const req = new NextRequest('http://localhost/api/v1/overview');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.cards).toHaveLength(1);
    expect(body.data.cards[0].communityName).toBe('A');
  });
});
```

- [ ] **Step 2: Implement endpoint**

Create `apps/web/src/app/api/v1/overview/route.ts`:

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import {
  getCommunityCards,
  getActivityFeed,
  getUpcomingEvents,
} from '@/lib/queries/cross-community';

export const GET = withErrorHandler(async (_req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const [cards, activity, events] = await Promise.all([
    getCommunityCards(userId),
    getActivityFeed(userId, 30),
    getUpcomingEvents(userId, 30),
  ]);
  return NextResponse.json({ data: { cards, activity, events } });
});
```

- [ ] **Step 3: Run test**

Run: `scripts/with-env-local.sh pnpm exec vitest run --config apps/web/vitest.integration.config.ts overview`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/v1/overview/route.ts apps/web/__tests__/api/overview.integration.test.ts
git commit -m "feat(overview): add GET /api/v1/overview endpoint"
```

---

## Task 6: useUserCommunities hook

**Files:**
- Create: `apps/web/src/hooks/use-user-communities.ts`

- [ ] **Step 1: Create hook**

Create `apps/web/src/hooks/use-user-communities.ts`:

```typescript
'use client';

import { useQuery } from '@tanstack/react-query';

interface UserCommunity {
  id: number;
  name: string;
  slug: string;
  role: string;
}

export function useUserCommunities() {
  return useQuery<{ data: UserCommunity[] }>({
    queryKey: ['user-communities'],
    queryFn: async () => {
      const res = await fetch('/api/v1/me/communities');
      if (!res.ok) throw new Error('Failed to load communities');
      return res.json();
    },
    staleTime: 60_000,
  });
}
```

- [ ] **Step 2: Create /me/communities endpoint**

Create `apps/web/src/app/api/v1/me/communities/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { communities, userRoles } from '@propertypro/db';
import { eq, and, isNull } from '@propertypro/db/filters';

export const GET = withErrorHandler(async () => {
  const userId = await requireAuthenticatedUserId();
  const db = createUnscopedClient();
  const rows = await db
    .select({
      id: communities.id,
      name: communities.name,
      slug: communities.slug,
      role: userRoles.role,
    })
    .from(userRoles)
    .innerJoin(communities, eq(communities.id, userRoles.communityId))
    .where(and(eq(userRoles.userId, userId), isNull(userRoles.revokedAt), isNull(communities.deletedAt)));

  return NextResponse.json({ data: rows });
});
```

Allowlist this file in `scripts/verify-scoped-db-access.ts` (user's own communities list is authorization-driven, not community-scoped).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/hooks/use-user-communities.ts \
  apps/web/src/app/api/v1/me/communities/route.ts \
  scripts/verify-scoped-db-access.ts
git commit -m "feat(overview): add /api/v1/me/communities endpoint and hook"
```

---

## Task 7: Property cards component (design system aligned)

**Files:**
- Create: `apps/web/src/components/overview/property-cards.tsx`

- [ ] **Step 1: Create component**

Create `apps/web/src/components/overview/property-cards.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { Card } from '@propertypro/ui';
import { Stack } from '@propertypro/ui';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/status-pill';
import type { CommunityCard } from '@/lib/queries/cross-community.types';

export function PropertyCards({ cards }: { cards: CommunityCard[] }) {
  if (cards.length === 0) {
    return (
      <Card className="p-6">
        <p className="text-sm text-secondary">
          You don't belong to any communities yet.
        </p>
      </Card>
    );
  }

  return (
    <Stack spacing="stack">
      {cards.map((card) => (
        <Card key={card.communityId} className="p-4">
          <Stack spacing="inline">
            <div className="flex items-start justify-between">
              <h3 className="text-heading-sm">{card.communityName}</h3>
              {card.complianceScore != null && (
                <StatusPill
                  label={`${card.complianceScore}% compliant`}
                  escalation={card.complianceScore >= 90 ? 'calm' : card.complianceScore >= 70 ? 'aware' : 'urgent'}
                />
              )}
            </div>
            {(card.urgentItemCount > 0 || card.criticalItemCount > 0) && (
              <div className="flex gap-2">
                {card.criticalItemCount > 0 && (
                  <StatusPill label={`${card.criticalItemCount} critical`} escalation="critical" />
                )}
                {card.urgentItemCount > 0 && (
                  <StatusPill label={`${card.urgentItemCount} urgent`} escalation="urgent" />
                )}
              </div>
            )}
            <Link href={`https://${card.communitySlug}.getpropertypro.com/dashboard`} passHref>
              <Button variant="secondary" size="sm">Go to Dashboard</Button>
            </Link>
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/overview/property-cards.tsx
git commit -m "feat(overview): property cards component"
```

---

## Task 8: Activity feed and upcoming events components

**Files:**
- Create: `apps/web/src/components/overview/activity-feed.tsx`
- Create: `apps/web/src/components/overview/upcoming-events.tsx`

- [ ] **Step 1: Create activity feed**

Create `apps/web/src/components/overview/activity-feed.tsx`:

```tsx
'use client';

import { Card, Badge } from '@propertypro/ui';
import { EmptyState } from '@/components/empty-state';
import type { ActivityItem } from '@/lib/queries/cross-community.types';

const TYPE_LABELS: Record<ActivityItem['type'], string> = {
  document: 'Document',
  announcement: 'Announcement',
  meeting_minutes: 'Minutes',
  violation: 'Violation',
};

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="No recent activity"
        description="Your communities are quiet for now."
      />
    );
  }

  return (
    <Card className="p-4">
      <h3 className="text-heading-sm mb-4">Recent Activity</h3>
      <ul className="space-y-3">
        {items.slice(0, 20).map((item) => (
          <li key={item.id} className="flex items-start gap-3 border-b border-default pb-3 last:border-b-0 last:pb-0">
            <Badge variant="outline">{TYPE_LABELS[item.type]}</Badge>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{item.title}</p>
              <p className="text-xs text-secondary">
                {item.communityName} · {new Date(item.occurredAt).toLocaleDateString()}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
```

- [ ] **Step 2: Create upcoming events**

Create `apps/web/src/components/overview/upcoming-events.tsx`:

```tsx
'use client';

import { Card, Badge } from '@propertypro/ui';
import { EmptyState } from '@/components/empty-state';
import type { UpcomingEvent } from '@/lib/queries/cross-community.types';

export function UpcomingEvents({ events }: { events: UpcomingEvent[] }) {
  if (events.length === 0) {
    return <EmptyState title="No upcoming events" description="Nothing scheduled in the next 30 days." />;
  }

  return (
    <Card className="p-4">
      <h3 className="text-heading-sm mb-4">Upcoming</h3>
      <ul className="space-y-3">
        {events.map((event) => {
          const date = new Date(event.scheduledFor);
          return (
            <li key={event.id} className="flex items-start gap-3">
              <div className="flex flex-col items-center min-w-[48px] rounded-md bg-surface-muted p-2">
                <span className="text-xs uppercase">{date.toLocaleString('en-US', { month: 'short' })}</span>
                <span className="text-lg font-semibold">{date.getDate()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{event.title}</p>
                <p className="text-xs text-secondary">{event.communityName}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/overview/activity-feed.tsx apps/web/src/components/overview/upcoming-events.tsx
git commit -m "feat(overview): activity feed and upcoming events components"
```

---

## Task 9: Overview page (server component)

**Files:**
- Create: `apps/web/src/app/(authenticated)/dashboard/overview/page.tsx`

- [ ] **Step 1: Create page**

Create `apps/web/src/app/(authenticated)/dashboard/overview/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { getAuthorizedCommunityIds } from '@/lib/queries/cross-community';
import { OverviewClient } from './overview-client';

export default async function OverviewPage() {
  const userId = await requireAuthenticatedUserId();
  const communityIds = await getAuthorizedCommunityIds(userId);

  // Single-community users don't need this page
  if (communityIds.length < 2) {
    redirect('/dashboard');
  }

  return <OverviewClient />;
}
```

- [ ] **Step 2: Create client component**

Create `apps/web/src/app/(authenticated)/dashboard/overview/overview-client.tsx`:

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { PropertyCards } from '@/components/overview/property-cards';
import { ActivityFeed } from '@/components/overview/activity-feed';
import { UpcomingEvents } from '@/components/overview/upcoming-events';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertBanner } from '@propertypro/ui';

export function OverviewClient() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['overview'],
    queryFn: async () => {
      const res = await fetch('/api/v1/overview');
      if (!res.ok) throw new Error('Failed to load overview');
      return res.json();
    },
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <AlertBanner variant="danger">
          We couldn't load your overview. Please try again.
        </AlertBanner>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
      <div className="space-y-6">
        <h2 className="text-heading-md">My Properties</h2>
        <PropertyCards cards={data.data.cards} />
      </div>
      <div className="space-y-6">
        <ActivityFeed items={data.data.activity} />
        <UpcomingEvents events={data.data.events} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/\(authenticated\)/dashboard/overview/
git commit -m "feat(overview): dashboard overview page with layout"
```

---

## Task 10: Community switcher in nav

**Files:**
- Create: `apps/web/src/components/overview/community-switcher.tsx`
- Modify: `apps/web/src/app/(authenticated)/layout.tsx`

- [ ] **Step 1: Create switcher component**

Create `apps/web/src/components/overview/community-switcher.tsx`:

```tsx
'use client';

import { useUserCommunities } from '@/hooks/use-user-communities';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

export function CommunitySwitcher() {
  const { data } = useUserCommunities();
  const communities = data?.data ?? [];

  if (communities.length < 2) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">Switch Community</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem asChild>
          <a href="/dashboard/overview">All Communities Overview</a>
        </DropdownMenuItem>
        {communities.map((c) => (
          <DropdownMenuItem key={c.id} asChild>
            <a href={`https://${c.slug}.getpropertypro.com/dashboard`}>{c.name}</a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Wire into layout**

In `apps/web/src/app/(authenticated)/layout.tsx`, add `<CommunitySwitcher />` to the nav area.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/overview/community-switcher.tsx apps/web/src/app/\(authenticated\)/layout.tsx
git commit -m "feat(overview): community switcher in authenticated nav"
```

---

## Task 11: Default-to-overview redirect

**Files:**
- Modify: `apps/web/src/middleware.ts` OR `apps/web/src/app/(authenticated)/dashboard/page.tsx`

- [ ] **Step 1: Redirect multi-community users from /dashboard to /dashboard/overview**

Simpler than middleware: add a check at the top of the existing `/dashboard` page server component:

```typescript
// In apps/web/src/app/(authenticated)/dashboard/page.tsx
export default async function DashboardPage() {
  const userId = await requireAuthenticatedUserId();
  const communityIds = await getAuthorizedCommunityIds(userId);
  if (communityIds.length >= 2 && !isOnCommunitySubdomain()) {
    redirect('/dashboard/overview');
  }
  // ... existing logic
}
```

The `isOnCommunitySubdomain()` check prevents redirecting when a user is viewing a specific community's dashboard on its subdomain.

- [ ] **Step 2: Manual QA**

Seed a user with roles in 2 communities. Log in, navigate to `/dashboard`, verify redirect to `/dashboard/overview`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(authenticated\)/dashboard/page.tsx
git commit -m "feat(overview): redirect multi-community users to overview"
```

---

## Final Verification

- [ ] **All tests pass**

Run: `pnpm test && scripts/with-env-local.sh pnpm exec vitest run --config apps/web/vitest.integration.config.ts`

- [ ] **Typecheck + lint + guard pass**

Run: `pnpm typecheck && pnpm lint && pnpm guard:db-access`

- [ ] **Manual QA**

- Single-community user: no overview, no switcher
- 2-community user: overview shows both cards, activity from both, events from both
- 10-community user: overview loads in <200ms (measure with network tab)
- Empty state: user with 0 communities redirects to welcome
- Error state: force API failure, verify AlertBanner shows

- [ ] **Design system compliance**

- Focus rings visible on all interactive elements
- Status pills use 4-tier escalation
- Spacing uses `inline`/`stack` tokens only
- Card elevation E0, borders first
