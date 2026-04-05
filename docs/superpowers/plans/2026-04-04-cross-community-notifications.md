# Cross-Community Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing notification system to support aggregated notification feeds across all communities a user belongs to. Adds a new `/api/v1/notifications/all` endpoint, a `cross` mode to the existing `useNotifications` hook, and a cross-community dropdown on `/dashboard/overview`.

**Architecture:** Extends the existing `in_app_notifications` table (no schema changes). Uses the same cross-community query pattern from Plan 2 — single authorization query then filter by `user_id` + `community_id IN (authorizedIds)`. Keeps per-community endpoints untouched.

**Tech Stack:** Next.js 15, TypeScript, TanStack Query, Supabase Realtime, PropertyPro design system.

**Spec:** `docs/superpowers/specs/2026-04-04-multi-community-billing-and-ownership-design.md` §6

**Prerequisite:** Plan 2 (Unified Owner Dashboard) must be complete — reuses `getAuthorizedCommunityIds`.

---

## File Structure

### Create

- `apps/web/src/app/api/v1/notifications/all/route.ts` — aggregated notifications endpoint
- `apps/web/src/components/notifications/cross-community-dropdown.tsx` — cross-community dropdown UI
- `apps/web/__tests__/api/notifications-all.integration.test.ts`

### Modify

- `apps/web/src/hooks/use-notifications.ts` — add `useCrossNotifications` hook
- `apps/web/src/components/notifications/notification-dropdown.tsx` — mode switcher
- `apps/web/src/app/(authenticated)/dashboard/overview/overview-client.tsx` — add cross-community dropdown to nav

---

## Task 1: /api/v1/notifications/all endpoint

**Files:**
- Create: `apps/web/src/app/api/v1/notifications/all/route.ts`
- Create: `apps/web/__tests__/api/notifications-all.integration.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/web/__tests__/api/notifications-all.integration.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/queries/cross-community', () => ({
  getAuthorizedCommunityIds: vi.fn().mockResolvedValue([1, 2]),
}));

import { GET } from '@/app/api/v1/notifications/all/route';
import { NextRequest } from 'next/server';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { inAppNotifications, communities } from '@propertypro/db';

describe('GET /api/v1/notifications/all', () => {
  it('returns notifications across all authorized communities tagged with community info', async () => {
    const db = createUnscopedClient();
    // Insert test notifications for the mocked authorized communities
    await db.insert(inAppNotifications).values([
      { userId: '00000000-0000-0000-0000-000000000001', communityId: 1, category: 'compliance', title: 'A notif', sourceType: 'test', sourceId: 'x', priority: 'aware' },
      { userId: '00000000-0000-0000-0000-000000000001', communityId: 2, category: 'compliance', title: 'B notif', sourceType: 'test', sourceId: 'y', priority: 'aware' },
    ]);

    const req = new NextRequest('http://localhost/api/v1/notifications/all?limit=50');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.data.notifications).toHaveLength(2);
    expect(body.data.notifications[0]).toHaveProperty('community');
    expect(body.data.notifications[0].community).toHaveProperty('id');
    expect(body.data.notifications[0].community).toHaveProperty('name');
    expect(body.data.notifications[0].community).toHaveProperty('slug');
  });
});
```

- [ ] **Step 2: Implement endpoint**

Create `apps/web/src/app/api/v1/notifications/all/route.ts`:

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { ValidationError } from '@/lib/api/errors';
import { getAuthorizedCommunityIds } from '@/lib/queries/cross-community';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { inAppNotifications, communities } from '@propertypro/db';
import { eq, and, inArray, isNull, desc, lt } from '@propertypro/db/filters';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.coerce.number().int().optional(),
  unreadOnly: z.enum(['true', 'false']).optional(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    limit: searchParams.get('limit') ?? undefined,
    cursor: searchParams.get('cursor') ?? undefined,
    unreadOnly: searchParams.get('unreadOnly') ?? undefined,
  });
  if (!parsed.success) throw new ValidationError('Invalid query', { issues: parsed.error.issues });

  const communityIds = await getAuthorizedCommunityIds(userId);
  if (communityIds.length === 0) {
    return NextResponse.json({ data: { notifications: [], nextCursor: null, totalUnread: 0 } });
  }

  const db = createUnscopedClient();

  // Build filter conditions — user_id is the authorization anchor,
  // community_id IN (authorizedIds) scopes to the user's allowed communities.
  const conditions = [
    eq(inAppNotifications.userId, userId),
    inArray(inAppNotifications.communityId, communityIds),
    isNull(inAppNotifications.archivedAt),
  ];
  if (parsed.data.cursor) {
    conditions.push(lt(inAppNotifications.id, parsed.data.cursor));
  }
  if (parsed.data.unreadOnly === 'true') {
    conditions.push(isNull(inAppNotifications.readAt));
  }

  // Join communities to enrich with name + slug
  const rows = await db
    .select({
      id: inAppNotifications.id,
      category: inAppNotifications.category,
      title: inAppNotifications.title,
      body: inAppNotifications.body,
      actionUrl: inAppNotifications.actionUrl,
      sourceType: inAppNotifications.sourceType,
      sourceId: inAppNotifications.sourceId,
      priority: inAppNotifications.priority,
      readAt: inAppNotifications.readAt,
      createdAt: inAppNotifications.createdAt,
      communityId: inAppNotifications.communityId,
      communityName: communities.name,
      communitySlug: communities.slug,
    })
    .from(inAppNotifications)
    .innerJoin(communities, eq(communities.id, inAppNotifications.communityId))
    .where(and(...conditions))
    .orderBy(desc(inAppNotifications.id))
    .limit(parsed.data.limit + 1);

  const hasMore = rows.length > parsed.data.limit;
  const page = rows.slice(0, parsed.data.limit);
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  // Count unread across all authorized communities
  const unreadRows = await db
    .select({ id: inAppNotifications.id })
    .from(inAppNotifications)
    .where(
      and(
        eq(inAppNotifications.userId, userId),
        inArray(inAppNotifications.communityId, communityIds),
        isNull(inAppNotifications.readAt),
        isNull(inAppNotifications.archivedAt),
      ),
    );

  const notifications = page.map((n) => ({
    id: n.id,
    category: n.category,
    title: n.title,
    body: n.body,
    actionUrl: n.actionUrl,
    sourceType: n.sourceType,
    sourceId: n.sourceId,
    priority: n.priority,
    readAt: n.readAt,
    createdAt: n.createdAt,
    community: {
      id: n.communityId,
      name: n.communityName,
      slug: n.communitySlug,
    },
  }));

  return NextResponse.json({
    data: { notifications, nextCursor, totalUnread: unreadRows.length },
  });
});
```

- [ ] **Step 3: Allowlist in guard**

Add `apps/web/src/app/api/v1/notifications/all/route.ts` to the unsafe-access allowlist in `scripts/verify-scoped-db-access.ts`. The file only uses `createUnscopedClient` after an authorization check via `getAuthorizedCommunityIds`.

- [ ] **Step 4: Run tests**

Run: `scripts/with-env-local.sh pnpm exec vitest run --config apps/web/vitest.integration.config.ts notifications-all`
Expected: PASS

- [ ] **Step 5: Run guards**

Run: `pnpm guard:db-access`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/v1/notifications/all/route.ts \
  apps/web/__tests__/api/notifications-all.integration.test.ts \
  scripts/verify-scoped-db-access.ts
git commit -m "feat(notifications): add cross-community notifications endpoint"
```

---

## Task 2: useCrossNotifications hook

**Files:**
- Modify: `apps/web/src/hooks/use-notifications.ts`

- [ ] **Step 1: Append hook**

Add to `apps/web/src/hooks/use-notifications.ts`:

```typescript
export interface CrossNotificationItem extends NotificationItem {
  community: { id: number; name: string; slug: string };
}

interface CrossListResponse {
  notifications: CrossNotificationItem[];
  nextCursor: number | null;
  totalUnread: number;
}

export function useCrossNotifications(filters: NotificationFilters = {}) {
  return useQuery<CrossListResponse>({
    queryKey: ['notifications', 'cross', 'list', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.cursor != null) params.set('cursor', String(filters.cursor));
      if (filters.limit != null) params.set('limit', String(filters.limit));
      if (filters.unreadOnly) params.set('unreadOnly', 'true');
      const res = await fetch(`/api/v1/notifications/all?${params}`);
      if (!res.ok) throw new Error('Failed to fetch cross-community notifications');
      const json = (await res.json()) as { data: CrossListResponse };
      return json.data;
    },
    staleTime: 30_000,
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/hooks/use-notifications.ts
git commit -m "feat(notifications): add useCrossNotifications hook"
```

---

## Task 3: Cross-community notification dropdown component

**Files:**
- Create: `apps/web/src/components/notifications/cross-community-dropdown.tsx`

- [ ] **Step 1: Create component**

Create `apps/web/src/components/notifications/cross-community-dropdown.tsx`:

```tsx
'use client';

import { Bell } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@propertypro/ui';
import { useCrossNotifications } from '@/hooks/use-notifications';
import { EmptyState } from '@/components/empty-state';

export function CrossCommunityNotificationDropdown() {
  const { data, isLoading } = useCrossNotifications({ limit: 20 });
  const unread = data?.totalUnread ?? 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}>
          <Bell className="h-5 w-5" aria-hidden="true" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1">
              <Badge variant="danger">{unread}</Badge>
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96">
        <div className="p-3 border-b border-default">
          <h4 className="text-sm font-semibold">All Notifications</h4>
          <p className="text-xs text-secondary">Across all your communities</p>
        </div>
        <div className="max-h-[480px] overflow-y-auto">
          {isLoading && <div className="p-4 text-sm text-secondary">Loading…</div>}
          {!isLoading && (!data?.notifications || data.notifications.length === 0) && (
            <EmptyState title="You're all caught up" description="No notifications across your communities." />
          )}
          {data?.notifications.map((n) => (
            <a
              key={n.id}
              href={n.actionUrl ?? `https://${n.community.slug}.getpropertypro.com/notifications`}
              className="block p-3 border-b border-default hover:bg-surface-muted transition-colors"
            >
              <div className="flex items-start gap-2">
                <Badge variant="outline">{n.community.name}</Badge>
                {n.readAt == null && <Badge variant="info">new</Badge>}
              </div>
              <p className="text-sm font-medium mt-1">{n.title}</p>
              {n.body && <p className="text-xs text-secondary mt-1 line-clamp-2">{n.body}</p>}
            </a>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Wire into overview page**

In `apps/web/src/app/(authenticated)/dashboard/overview/overview-client.tsx`, add the dropdown to the page header.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/notifications/cross-community-dropdown.tsx \
  apps/web/src/app/\(authenticated\)/dashboard/overview/overview-client.tsx
git commit -m "feat(notifications): cross-community notification dropdown"
```

---

## Task 4: Mark-all-read per community

**Files:**
- Modify: `apps/web/src/components/notifications/cross-community-dropdown.tsx`
- Create: `apps/web/src/app/api/v1/notifications/mark-all-read/route.ts` (if not exists) or reuse existing

- [ ] **Step 1: Check existing mark-all-read endpoint**

Look for existing endpoint: `grep -r "mark-all-read\|markAllRead" apps/web/src/app/api/v1/notifications/`

- [ ] **Step 2: Add per-community-filter support**

If the existing mark-all-read endpoint already accepts `communityId`, use it. Otherwise, add a `communityId` query param that, when present, scopes the mark to that community only.

- [ ] **Step 3: Wire button into dropdown**

Add a "Mark all read" link per community group inside the dropdown that calls the endpoint with the specific `communityId`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/notifications/cross-community-dropdown.tsx
git commit -m "feat(notifications): per-community mark-all-read in cross dropdown"
```

---

## Task 5: Extend realtime subscription for cross mode

**Files:**
- Modify: `apps/web/src/hooks/use-notifications.ts` (or wherever realtime is set up)

- [ ] **Step 1: Find realtime subscription**

Search: `grep -rn "in_app_notifications" apps/web/src/hooks/ apps/web/src/lib/`

Expected: find a Supabase realtime `.channel()` subscription with a filter on `community_id`.

- [ ] **Step 2: Add cross mode to subscription helper**

Refactor the subscription to accept `mode: 'community' | 'cross'`:

```typescript
// When mode === 'cross', the filter is only user_id
// When mode === 'community', the filter is user_id AND community_id
const channel = supabase
  .channel(`notifications-${mode}-${userId}`)
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'in_app_notifications',
      filter: mode === 'cross'
        ? `user_id=eq.${userId}`
        : `user_id=eq.${userId},community_id=eq.${communityId}`,
    },
    (payload) => {
      // Invalidate the correct query key depending on mode
      queryClient.invalidateQueries({
        queryKey: mode === 'cross' ? ['notifications', 'cross'] : NOTIFICATION_KEYS.all(communityId),
      });
    },
  )
  .subscribe();
```

Note: Current limitation from MEMORY.md — realtime only fires on INSERT, not UPDATE/DELETE. Document this in the hook's JSDoc.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/hooks/use-notifications.ts
git commit -m "feat(notifications): extend realtime subscription for cross mode"
```

---

## Final Verification

- [ ] **All tests pass**

Run: `pnpm test && scripts/with-env-local.sh pnpm exec vitest run --config apps/web/vitest.integration.config.ts`

- [ ] **Typecheck + lint + guard**

Run: `pnpm typecheck && pnpm lint && pnpm guard:db-access`

- [ ] **Manual QA**

- Single-community user: dropdown not shown (overview page not accessible)
- Multi-community user: dropdown shows notifications from all communities with community badges
- Realtime: insert a notification for community A while viewing overview → dropdown updates without refresh
- Mark-all-read per community: clicking clears only that community's notifications
- Unread counter reflects total across communities

- [ ] **Design system compliance**

- Notification rows meet 44px touch target on mobile
- Empty state uses standard `EmptyState` pattern
- Badges distinguish community with text, not color alone
