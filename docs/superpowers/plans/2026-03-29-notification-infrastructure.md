# Notification Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real-time in-app notification system — persisted `notifications` table, Supabase Realtime delivery, 4 API routes, bell/dropdown/list-item components, two pages, and integration hooks in announcement/meeting/maintenance/document/violation flows.

**Architecture:** A `notifications` table with tenant RLS and Supabase Realtime publication. `createNotificationsForEvent()` is added to `notification-service.ts` and called alongside existing `queueNotification`/email calls. Client components subscribe via Supabase Realtime for instant badge updates; TanStack Query handles list fetching and cache invalidation. Six per-category muting columns are added additively to `notification_preferences`.

**Tech Stack:** Drizzle ORM, PostgreSQL (Supabase), Supabase Realtime (Postgres Changes), Next.js 15 App Router, TanStack Query v5, Tailwind CSS + shadcn/ui, Lucide icons.

---

## File Manifest

| File | Action |
|------|--------|
| `packages/db/src/schema/notifications.ts` | CREATE |
| `packages/db/src/schema/notification-preferences.ts` | MODIFY — add 6 muting columns |
| `packages/db/src/schema/index.ts` | MODIFY — add `export * from './notifications'` + type aliases |
| `packages/db/src/queries/notifications.ts` | CREATE |
| `packages/db/src/index.ts` | MODIFY — export query functions |
| `packages/db/migrations/0129_create_notifications_table.sql` | CREATE |
| `packages/db/migrations/0130_add_in_app_muting_columns.sql` | CREATE |
| `packages/db/migrations/meta/_journal.json` | MODIFY — add idx 129 + 130 entries |
| `apps/web/src/lib/utils/email-preferences.ts` | MODIFY — extend `UserNotificationPreferences` |
| `apps/web/src/lib/services/notification-service.ts` | MODIFY — add `createNotificationsForEvent` |
| `apps/web/src/app/api/v1/notifications/route.ts` | CREATE — GET list |
| `apps/web/src/app/api/v1/notifications/unread-count/route.ts` | CREATE — GET count |
| `apps/web/src/app/api/v1/notifications/read/route.ts` | CREATE — PATCH mark read |
| `apps/web/src/app/api/v1/notifications/archive/route.ts` | CREATE — PATCH archive |
| `apps/web/src/hooks/use-notifications.ts` | CREATE |
| `apps/web/src/hooks/use-notification-realtime.ts` | CREATE |
| `apps/web/src/components/notifications/notification-list-item.tsx` | CREATE |
| `apps/web/src/components/notifications/notification-dropdown.tsx` | CREATE |
| `apps/web/src/components/notifications/notification-bell.tsx` | CREATE |
| `apps/web/src/components/layout/app-top-bar.tsx` | MODIFY — replace bell stub |
| `apps/web/src/app/(authenticated)/notifications/page.tsx` | CREATE |
| `apps/web/src/app/mobile/notifications/page.tsx` | CREATE |
| `apps/web/src/app/api/v1/announcements/route.ts` | MODIFY — add in-app call |
| `apps/web/src/app/api/v1/meetings/route.ts` | MODIFY — add in-app call |
| `apps/web/src/app/api/v1/maintenance-requests/[id]/route.ts` | MODIFY — add in-app call |
| `apps/web/src/lib/documents/create-uploaded-document.ts` | MODIFY — add in-app call |
| `apps/web/src/lib/services/violations-service.ts` | MODIFY — add in-app calls |

---

## Task 1: `notifications` Drizzle schema

**Files:**
- Create: `packages/db/src/schema/notifications.ts`

- [ ] **Step 1: Create the schema file**

```typescript
/**
 * In-app notifications table — per-user, per-community notification feed.
 */
import {
  bigint,
  bigserial,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { users } from './users';

export type NotificationCategory =
  | 'announcement'
  | 'document'
  | 'meeting'
  | 'maintenance'
  | 'violation'
  | 'election'
  | 'system';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export const notifications = pgTable(
  'notifications',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    actionUrl: text('action_url'),
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id').notNull(),
    priority: text('priority').notNull().default('normal'),
    readAt: timestamp('read_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    // Main feed query: unarchived, undeleted, newest first
    index('notifications_feed_idx').on(
      table.communityId,
      table.userId,
      table.archivedAt,
      table.deletedAt,
      table.createdAt,
    ),
    // Fast unread count (partial index expressed at DB level in migration)
    index('notifications_unread_idx').on(
      table.communityId,
      table.userId,
      table.readAt,
    ),
    // Idempotency: one notification per user per source event
    uniqueIndex('notifications_dedup_unique').on(
      table.communityId,
      table.userId,
      table.sourceType,
      table.sourceId,
    ),
  ],
);
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm typecheck
```

Expected: no errors in `packages/db`.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/notifications.ts
git commit -m "feat(db): add notifications Drizzle schema"
```

---

## Task 2: Add in-app muting columns to `notification_preferences`

**Files:**
- Modify: `packages/db/src/schema/notification-preferences.ts`

- [ ] **Step 1: Add 6 boolean columns after the `inAppEnabled` field**

Open `packages/db/src/schema/notification-preferences.ts`. After line 23 (`inAppEnabled: boolean('in_app_enabled').notNull().default(true),`), add:

```typescript
    // In-app per-category muting toggles (all default true)
    // Master toggle inAppEnabled takes precedence — if false, none deliver.
    inAppAnnouncements: boolean('in_app_announcements').notNull().default(true),
    inAppDocuments: boolean('in_app_documents').notNull().default(true),
    inAppMeetings: boolean('in_app_meetings').notNull().default(true),
    inAppMaintenance: boolean('in_app_maintenance').notNull().default(true),
    inAppViolations: boolean('in_app_violations').notNull().default(true),
    inAppElections: boolean('in_app_elections').notNull().default(true),
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/notification-preferences.ts
git commit -m "feat(db): add in-app category muting columns to notification_preferences"
```

---

## Task 3: DB query helpers

**Files:**
- Create: `packages/db/src/queries/notifications.ts`

- [ ] **Step 1: Create the query file**

```typescript
/**
 * Notifications query helpers.
 *
 * Uses Drizzle directly (within packages/db — not subject to the scoped-client
 * CI guard that applies to apps/web).
 */
import { and, count, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { db } from '../drizzle';
import { notifications } from '../schema/notifications';
import type { NotificationCategory } from '../schema/notifications';

export type { NotificationCategory };

export interface ListNotificationsParams {
  communityId: number;
  userId: string;
  cursor?: number;
  limit: number;
  category?: NotificationCategory;
  unreadOnly?: boolean;
}

export async function listNotifications(params: ListNotificationsParams) {
  const { communityId, userId, cursor, limit, category, unreadOnly } = params;

  const conditions = [
    eq(notifications.communityId, communityId),
    eq(notifications.userId, userId),
    isNull(notifications.archivedAt),
    isNull(notifications.deletedAt),
  ];

  if (cursor != null) conditions.push(lt(notifications.id, cursor));
  if (category != null) conditions.push(eq(notifications.category, category));
  if (unreadOnly) conditions.push(isNull(notifications.readAt));

  return db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit);
}

export async function countUnreadNotifications(
  communityId: number,
  userId: string,
): Promise<number> {
  const result = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(notifications)
    .where(
      and(
        eq(notifications.communityId, communityId),
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
        isNull(notifications.deletedAt),
      ),
    );
  return result[0]?.count ?? 0;
}

export async function markNotificationsRead(
  communityId: number,
  userId: string,
  ids?: number[],
): Promise<void> {
  const conditions = [
    eq(notifications.communityId, communityId),
    eq(notifications.userId, userId),
    isNull(notifications.readAt),
  ];
  if (ids != null && ids.length > 0) conditions.push(inArray(notifications.id, ids));

  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(...conditions));
}

export async function archiveNotifications(
  communityId: number,
  userId: string,
  ids: number[],
): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(notifications)
    .set({ archivedAt: new Date() })
    .where(
      and(
        eq(notifications.communityId, communityId),
        eq(notifications.userId, userId),
        inArray(notifications.id, ids),
      ),
    );
}

export interface InsertNotificationRow {
  communityId: number;
  userId: string;
  category: NotificationCategory;
  title: string;
  body?: string;
  actionUrl?: string;
  sourceType: string;
  sourceId: string;
  priority?: string;
}

export async function insertNotifications(
  rows: InsertNotificationRow[],
): Promise<{ created: number }> {
  if (rows.length === 0) return { created: 0 };
  const result = await db
    .insert(notifications)
    .values(rows.map((r) => ({ ...r, priority: r.priority ?? 'normal' })))
    .onConflictDoNothing()
    .returning({ id: notifications.id });
  return { created: result.length };
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/queries/notifications.ts
git commit -m "feat(db): add notifications query helpers"
```

---

## Task 4: Schema and query exports

**Files:**
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Add schema barrel export**

In `packages/db/src/schema/index.ts`, after line 15 (`export * from './notification-preferences';`), add:

```typescript
export * from './notifications';
```

Then at the bottom of the file, after the `NotificationPreference` type block, add:

```typescript
// Notifications
import type { notifications } from './notifications';
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
```

- [ ] **Step 2: Export query functions from package index**

In `packages/db/src/index.ts`, after the last `export` block (find the ledger or document-access exports), add:

```typescript
// Notification query helpers
export {
  listNotifications,
  countUnreadNotifications,
  markNotificationsRead,
  archiveNotifications,
  insertNotifications,
} from './queries/notifications';
export type {
  ListNotificationsParams,
  InsertNotificationRow,
  NotificationCategory,
} from './queries/notifications';
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/index.ts packages/db/src/index.ts
git commit -m "feat(db): export notifications schema and query helpers"
```

---

## Task 5: Migrations

**Files:**
- Create: `packages/db/migrations/0129_create_notifications_table.sql`
- Create: `packages/db/migrations/0130_add_in_app_muting_columns.sql`
- Modify: `packages/db/migrations/meta/_journal.json`

- [ ] **Step 1: Create migration 0129**

```sql
-- Migration 0129: Create notifications table with RLS and Realtime publication

CREATE TABLE IF NOT EXISTS "notifications" (
  "id"           bigserial PRIMARY KEY,
  "community_id" bigint NOT NULL REFERENCES "communities"("id") ON DELETE CASCADE,
  "user_id"      uuid   NOT NULL REFERENCES "users"("id")       ON DELETE CASCADE,
  "category"     text   NOT NULL,
  "title"        text   NOT NULL,
  "body"         text,
  "action_url"   text,
  "source_type"  text   NOT NULL,
  "source_id"    text   NOT NULL,
  "priority"     text   NOT NULL DEFAULT 'normal',
  "read_at"      timestamptz,
  "archived_at"  timestamptz,
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  "deleted_at"   timestamptz
);

-- Indexes
CREATE INDEX IF NOT EXISTS "notifications_feed_idx"
  ON "notifications" ("community_id", "user_id", "archived_at", "deleted_at", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "notifications_unread_idx"
  ON "notifications" ("community_id", "user_id", "read_at")
  WHERE "read_at" IS NULL AND "deleted_at" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "notifications_dedup_unique"
  ON "notifications" ("community_id", "user_id", "source_type", "source_id");

-- Tenant write-scope trigger (matches pattern from migration 0020)
CREATE TRIGGER "notifications_enforce_tenant_scope"
  BEFORE INSERT OR UPDATE ON "notifications"
  FOR EACH ROW EXECUTE FUNCTION "public"."pp_rls_enforce_tenant_community_id"();

-- Row Level Security
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;

-- SELECT: users see only their own notifications
CREATE POLICY "notifications_user_select"
  ON "notifications" FOR SELECT
  USING ("user_id" = auth.uid());

-- UPDATE: users can mark their own as read/archived
CREATE POLICY "notifications_user_update"
  ON "notifications" FOR UPDATE
  USING ("user_id" = auth.uid())
  WITH CHECK ("user_id" = auth.uid());

-- INSERT/DELETE: no client policy — service_role bypasses RLS for inserts
-- (app server connects as postgres/service_role which has BYPASSRLS)

-- Realtime publication: enables Supabase Realtime Postgres Changes on this table
ALTER PUBLICATION "supabase_realtime" ADD TABLE "notifications";
```

- [ ] **Step 2: Create migration 0130**

```sql
-- Migration 0130: Add in-app per-category muting columns to notification_preferences

ALTER TABLE "notification_preferences"
  ADD COLUMN IF NOT EXISTS "in_app_announcements" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "in_app_documents"     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "in_app_meetings"      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "in_app_maintenance"   boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "in_app_violations"    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "in_app_elections"     boolean NOT NULL DEFAULT true;
```

- [ ] **Step 3: Add journal entries**

Open `packages/db/migrations/meta/_journal.json`. After the idx 128 entry, append two new entries before the closing `]`:

```json
    ,
    {
      "idx": 129,
      "version": "7",
      "when": 1774840000000,
      "tag": "0129_create_notifications_table",
      "breakpoints": true
    },
    {
      "idx": 130,
      "version": "7",
      "when": 1774850000000,
      "tag": "0130_add_in_app_muting_columns",
      "breakpoints": true
    }
```

- [ ] **Step 4: Apply migrations (requires DATABASE_URL)**

```bash
pnpm --filter @propertypro/db db:migrate
```

Expected: migrations 0129 and 0130 applied, no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/db/migrations/0129_create_notifications_table.sql \
        packages/db/migrations/0130_add_in_app_muting_columns.sql \
        packages/db/migrations/meta/_journal.json
git commit -m "feat(db): migrations 0129 (notifications table) and 0130 (in-app muting columns)"
```

---

## Task 6: Extend `UserNotificationPreferences` type

**Files:**
- Modify: `apps/web/src/lib/utils/email-preferences.ts`

- [ ] **Step 1: Add in-app fields to the interface and defaults**

Open `apps/web/src/lib/utils/email-preferences.ts`. Extend the interface and `getDefaultPreferences`:

```typescript
export interface UserNotificationPreferences {
  emailFrequency: EmailFrequency;
  emailAnnouncements: boolean;
  emailMeetings: boolean;
  inAppEnabled: boolean;
  // Per-category in-app muting (default true = unmuted)
  inAppAnnouncements: boolean;
  inAppDocuments: boolean;
  inAppMeetings: boolean;
  inAppMaintenance: boolean;
  inAppViolations: boolean;
  inAppElections: boolean;
}

/** Default preferences for a new user (P1-26 acceptance). */
export function getDefaultPreferences(): UserNotificationPreferences {
  return {
    emailFrequency: 'immediate',
    emailAnnouncements: true,
    emailMeetings: true,
    inAppEnabled: true,
    inAppAnnouncements: true,
    inAppDocuments: true,
    inAppMeetings: true,
    inAppMaintenance: true,
    inAppViolations: true,
    inAppElections: true,
  };
}
```

- [ ] **Step 2: Update the preferences mapping in `notification-service.ts`**

In `apps/web/src/lib/services/notification-service.ts`, find the `preferencesByUserId` mapping (around line 282). Add the 6 new fields:

```typescript
      preferencesByUserId.set(userId, {
        emailFrequency:
          rawFrequency === 'immediate' ||
          rawFrequency === 'daily_digest' ||
          rawFrequency === 'weekly_digest' ||
          rawFrequency === 'never'
            ? rawFrequency
            : 'immediate',
        emailAnnouncements: (row['emailAnnouncements'] as boolean | undefined) ?? true,
        emailMeetings: (row['emailMeetings'] as boolean | undefined) ?? true,
        inAppEnabled: (row['inAppEnabled'] as boolean | undefined) ?? true,
        inAppAnnouncements: (row['inAppAnnouncements'] as boolean | undefined) ?? true,
        inAppDocuments: (row['inAppDocuments'] as boolean | undefined) ?? true,
        inAppMeetings: (row['inAppMeetings'] as boolean | undefined) ?? true,
        inAppMaintenance: (row['inAppMaintenance'] as boolean | undefined) ?? true,
        inAppViolations: (row['inAppViolations'] as boolean | undefined) ?? true,
        inAppElections: (row['inAppElections'] as boolean | undefined) ?? true,
      });
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors. The extended interface is additive; no callers break because all new fields have defaults in `getDefaultPreferences`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/utils/email-preferences.ts \
        apps/web/src/lib/services/notification-service.ts
git commit -m "feat: extend UserNotificationPreferences with in-app category toggles"
```

---

## Task 7: `createNotificationsForEvent()` service function

**Files:**
- Modify: `apps/web/src/lib/services/notification-service.ts`

- [ ] **Step 1: Add imports and types at the top of `notification-service.ts`**

After the existing imports, add:

```typescript
import {
  notifications,
  insertNotifications,
  type NotificationCategory,
  type InsertNotificationRow,
} from '@propertypro/db';
```

- [ ] **Step 2: Add the event type and category-to-preference mapping after the existing constants**

After the `EVENT_TO_KIND` constant (around line 126), add:

```typescript
export interface InAppNotificationEvent {
  category: NotificationCategory;
  title: string;
  body?: string;
  actionUrl?: string;
  sourceType: string;
  sourceId: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}

export interface CreateNotificationsResult {
  created: number;
  skipped: number;
}

const CATEGORY_TO_IN_APP_PREF_KEY: Record<
  NotificationCategory,
  keyof UserNotificationPreferences | null
> = {
  announcement: 'inAppAnnouncements',
  document: 'inAppDocuments',
  meeting: 'inAppMeetings',
  maintenance: 'inAppMaintenance',
  violation: 'inAppViolations',
  election: 'inAppElections',
  system: null, // system notifications always deliver
};

function isInAppEnabled(
  prefs: UserNotificationPreferences,
  category: NotificationCategory,
): boolean {
  if (!prefs.inAppEnabled) return false;
  const prefKey = CATEGORY_TO_IN_APP_PREF_KEY[category];
  if (prefKey === null) return true;
  return (prefs[prefKey] as boolean | undefined) !== false;
}
```

- [ ] **Step 3: Add `createNotificationsForEvent` as an exported function at the bottom of the file**

```typescript
/**
 * Create in-app notification rows for all eligible recipients.
 *
 * Called alongside queueNotification/email calls — operates as an independent
 * channel. Failures are logged and do not propagate to callers.
 */
export async function createNotificationsForEvent(
  communityId: number,
  event: InAppNotificationEvent,
  recipientFilter: RecipientFilter,
  actorUserId?: string,
): Promise<CreateNotificationsResult> {
  // Reuse email recipient resolution — pass supportsDigest=false so all
  // immediate recipients are returned; we only need the user list.
  const notificationKind = EVENT_TO_KIND[
    event.category === 'announcement' ? 'meeting_notice'
    : event.category === 'document' ? 'document_posted'
    : event.category === 'meeting' ? 'meeting_notice'
    : event.category === 'maintenance' ? 'maintenance_update'
    : 'compliance_alert'
  ] as NotificationKind;

  let deliveries: Awaited<ReturnType<typeof resolveRecipientDeliveries>>;
  try {
    deliveries = await resolveRecipientDeliveries(
      communityId,
      recipientFilter,
      notificationKind,
      false, // supportsDigest: false — we want the full recipient list
    );
  } catch (error) {
    console.error('[notification-service] createNotificationsForEvent: recipient resolution failed', {
      communityId,
      category: event.category,
      error: error instanceof Error ? error.message : String(error),
    });
    return { created: 0, skipped: 0 };
  }

  // Filter by in-app preferences and exclude actor
  const eligible = deliveries.filter((d) => {
    if (actorUserId && d.userId === actorUserId) return false;
    return isInAppEnabled(d.preferences, event.category);
  });

  if (eligible.length === 0) return { created: 0, skipped: deliveries.length };

  const rows: InsertNotificationRow[] = eligible.map((d) => ({
    communityId,
    userId: d.userId,
    category: event.category,
    title: event.title,
    body: event.body,
    actionUrl: event.actionUrl,
    sourceType: event.sourceType,
    sourceId: event.sourceId,
    priority: event.priority ?? 'normal',
  }));

  let created = 0;
  try {
    const result = await insertNotifications(rows);
    created = result.created;
  } catch (error) {
    console.error('[notification-service] createNotificationsForEvent: insert failed', {
      communityId,
      category: event.category,
      recipientCount: rows.length,
      error: error instanceof Error ? error.message : String(error),
    });
    return { created: 0, skipped: eligible.length };
  }

  return { created, skipped: deliveries.length - eligible.length };
}
```

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors. The `resolveRecipientDeliveries` function is already defined in the file so no import needed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/services/notification-service.ts
git commit -m "feat: add createNotificationsForEvent to notification-service"
```

---

## Task 8: API route — GET `/api/v1/notifications`

**Files:**
- Create: `apps/web/src/app/api/v1/notifications/route.ts`

- [ ] **Step 1: Create the route**

```typescript
/**
 * GET /api/v1/notifications
 *
 * Returns a paginated list of in-app notifications for the current user.
 * Excludes archived and soft-deleted. Cursor-based pagination (id < cursor).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { listNotifications, type NotificationCategory } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';

const VALID_CATEGORIES = [
  'announcement', 'document', 'meeting', 'maintenance',
  'violation', 'election', 'system',
] as const;

const querySchema = z.object({
  communityId: z.coerce.number().int().positive(),
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  category: z.enum(VALID_CATEGORIES).optional(),
  unread_only: z.coerce.boolean().default(false),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    communityId: searchParams.get('communityId'),
    cursor: searchParams.get('cursor') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
    category: searchParams.get('category') ?? undefined,
    unread_only: searchParams.get('unread_only') ?? undefined,
  });

  if (!parsed.success) {
    throw new ValidationError('Invalid query parameters');
  }

  const { cursor, limit, category, unread_only } = parsed.data;
  const communityId = resolveEffectiveCommunityId(req, parsed.data.communityId);
  const userId = await requireAuthenticatedUserId();
  await requireCommunityMembership(communityId, userId);

  const rows = await listNotifications({
    communityId,
    userId,
    cursor,
    limit: limit + 1, // fetch one extra to determine if there's a next page
    category: category as NotificationCategory | undefined,
    unreadOnly: unread_only,
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? String(items[items.length - 1]?.id) : null;

  return NextResponse.json({
    data: {
      notifications: items,
      nextCursor,
    },
  });
});
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/v1/notifications/route.ts
git commit -m "feat(api): GET /api/v1/notifications — paginated notification list"
```

---

## Task 9: API route — GET `/api/v1/notifications/unread-count`

**Files:**
- Create: `apps/web/src/app/api/v1/notifications/unread-count/route.ts`

- [ ] **Step 1: Create the route**

```typescript
/**
 * GET /api/v1/notifications/unread-count
 *
 * Returns the count of unread, non-deleted notifications for the current user.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { countUnreadNotifications } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';

const querySchema = z.object({
  communityId: z.coerce.number().int().positive(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({ communityId: searchParams.get('communityId') });
  if (!parsed.success) throw new ValidationError('Invalid or missing communityId');

  const communityId = resolveEffectiveCommunityId(req, parsed.data.communityId);
  const userId = await requireAuthenticatedUserId();
  await requireCommunityMembership(communityId, userId);

  const count = await countUnreadNotifications(communityId, userId);
  return NextResponse.json({ data: { count } });
});
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm typecheck
git add apps/web/src/app/api/v1/notifications/unread-count/route.ts
git commit -m "feat(api): GET /api/v1/notifications/unread-count"
```

---

## Task 10: API route — PATCH `/api/v1/notifications/read`

**Files:**
- Create: `apps/web/src/app/api/v1/notifications/read/route.ts`

- [ ] **Step 1: Create the route**

```typescript
/**
 * PATCH /api/v1/notifications/read
 *
 * Mark notifications as read. Body: { ids: number[] } | { all: true }
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { markNotificationsRead } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';

const bodySchema = z.union([
  z.object({ communityId: z.number().int().positive(), ids: z.array(z.number().int().positive()).min(1) }),
  z.object({ communityId: z.number().int().positive(), all: z.literal(true) }),
]);

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const body: unknown = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) throw new ValidationError('Body must be { communityId, ids } or { communityId, all: true }');

  const communityId = resolveEffectiveCommunityId(req, parsed.data.communityId);
  const userId = await requireAuthenticatedUserId();
  await requireCommunityMembership(communityId, userId);

  const ids = 'ids' in parsed.data ? parsed.data.ids : undefined;
  await markNotificationsRead(communityId, userId, ids);

  return NextResponse.json({ data: { ok: true } });
});
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm typecheck
git add apps/web/src/app/api/v1/notifications/read/route.ts
git commit -m "feat(api): PATCH /api/v1/notifications/read"
```

---

## Task 11: API route — PATCH `/api/v1/notifications/archive`

**Files:**
- Create: `apps/web/src/app/api/v1/notifications/archive/route.ts`

- [ ] **Step 1: Create the route**

```typescript
/**
 * PATCH /api/v1/notifications/archive
 *
 * Archive notifications. Body: { communityId: number, ids: number[] }
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { archiveNotifications } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';

const bodySchema = z.object({
  communityId: z.number().int().positive(),
  ids: z.array(z.number().int().positive()).min(1),
});

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const body: unknown = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) throw new ValidationError('Body must be { communityId, ids: number[] }');

  const communityId = resolveEffectiveCommunityId(req, parsed.data.communityId);
  const userId = await requireAuthenticatedUserId();
  await requireCommunityMembership(communityId, userId);

  await archiveNotifications(communityId, userId, parsed.data.ids);
  return NextResponse.json({ data: { ok: true } });
});
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm typecheck
git add apps/web/src/app/api/v1/notifications/archive/route.ts
git commit -m "feat(api): PATCH /api/v1/notifications/archive"
```

---

## Task 12: TanStack Query hooks

**Files:**
- Create: `apps/web/src/hooks/use-notifications.ts`

- [ ] **Step 1: Create the hook file**

```typescript
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { NotificationCategory } from '@propertypro/db';

// Re-export for use in the Realtime hook
export const NOTIFICATION_KEYS = {
  all: (communityId: number) => ['notifications', communityId] as const,
  list: (communityId: number, filters?: NotificationFilters) =>
    ['notifications', communityId, 'list', filters ?? {}] as const,
  unreadCount: (communityId: number) =>
    ['notifications', communityId, 'unread-count'] as const,
};

export interface NotificationFilters {
  limit?: number;
  cursor?: number;
  category?: NotificationCategory;
  unreadOnly?: boolean;
}

export interface NotificationItem {
  id: number;
  category: string;
  title: string;
  body: string | null;
  actionUrl: string | null;
  sourceType: string;
  sourceId: string;
  priority: string;
  readAt: string | null;
  archivedAt: string | null;
  createdAt: string;
}

interface ListResponse {
  notifications: NotificationItem[];
  nextCursor: string | null;
}

function buildListUrl(communityId: number, filters: NotificationFilters): string {
  const params = new URLSearchParams({ communityId: String(communityId) });
  if (filters.cursor != null) params.set('cursor', String(filters.cursor));
  if (filters.limit != null) params.set('limit', String(filters.limit));
  if (filters.category != null) params.set('category', filters.category);
  if (filters.unreadOnly) params.set('unread_only', 'true');
  return `/api/v1/notifications?${params}`;
}

export function useNotifications(communityId: number, filters: NotificationFilters = {}) {
  return useQuery<ListResponse>({
    queryKey: NOTIFICATION_KEYS.list(communityId, filters),
    queryFn: async () => {
      const res = await fetch(buildListUrl(communityId, filters));
      if (!res.ok) throw new Error('Failed to fetch notifications');
      const json = await res.json() as { data: ListResponse };
      return json.data;
    },
    enabled: communityId > 0,
    staleTime: 30_000,
  });
}

export function useUnreadCount(communityId: number) {
  return useQuery<{ count: number }>({
    queryKey: NOTIFICATION_KEYS.unreadCount(communityId),
    queryFn: async () => {
      const res = await fetch(`/api/v1/notifications/unread-count?communityId=${communityId}`);
      if (!res.ok) throw new Error('Failed to fetch unread count');
      const json = await res.json() as { data: { count: number } };
      return json.data;
    },
    enabled: communityId > 0,
    staleTime: 15_000,
    refetchInterval: 60_000, // poll every 60s as fallback behind Realtime
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { communityId: number; ids?: number[]; all?: true }) => {
      const { communityId, ...rest } = payload;
      const res = await fetch('/api/v1/notifications/read', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, ...rest }),
      });
      if (!res.ok) throw new Error('Failed to mark notifications as read');
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: NOTIFICATION_KEYS.all(variables.communityId),
      });
    },
  });
}

export function useArchiveNotifications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { communityId: number; ids: number[] }) => {
      const res = await fetch('/api/v1/notifications/archive', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to archive notifications');
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: NOTIFICATION_KEYS.all(variables.communityId),
      });
    },
  });
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm typecheck
git add apps/web/src/hooks/use-notifications.ts
git commit -m "feat: useNotifications, useUnreadCount, useMarkRead, useArchiveNotifications hooks"
```

---

## Task 13: Realtime hook

**Files:**
- Create: `apps/web/src/hooks/use-notification-realtime.ts`

- [ ] **Step 1: Create the hook**

```typescript
'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@/lib/supabase/client';
import { NOTIFICATION_KEYS } from './use-notifications';

/**
 * Subscribe to Supabase Realtime for new notification inserts.
 * Invalidates the unread count and list queries immediately on INSERT.
 *
 * The filter `user_id=eq.{userId}` ensures only the current user's rows
 * are received. RLS on the notifications table enforces this at the DB level.
 */
export function useNotificationRealtime(communityId: number, userId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId || communityId <= 0) return;

    const supabase = createBrowserClient();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: NOTIFICATION_KEYS.unreadCount(communityId),
          });
          void queryClient.invalidateQueries({
            queryKey: NOTIFICATION_KEYS.list(communityId),
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [communityId, userId, queryClient]);
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm typecheck
git add apps/web/src/hooks/use-notification-realtime.ts
git commit -m "feat: useNotificationRealtime hook — Supabase Realtime subscription"
```

---

## Task 14: `NotificationListItem` component

**Files:**
- Create: `apps/web/src/components/notifications/notification-list-item.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client';

import {
  AlertTriangle,
  Bell,
  Calendar,
  FileText,
  Megaphone,
  ClipboardList,
  Wrench,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useMarkRead } from '@/hooks/use-notifications';
import type { NotificationItem } from '@/hooks/use-notifications';

const CATEGORY_CONFIG: Record<
  string,
  { icon: React.ElementType; iconClass: string }
> = {
  announcement: { icon: Megaphone, iconClass: 'text-[var(--status-info)]' },
  document:     { icon: FileText,  iconClass: 'text-[var(--status-info)]' },
  meeting:      { icon: Calendar,  iconClass: 'text-[var(--interactive-primary)]' },
  maintenance:  { icon: Wrench,    iconClass: 'text-[var(--status-warning)]' },
  violation:    { icon: AlertTriangle, iconClass: 'text-[var(--status-error)]' },
  election:     { icon: ClipboardList, iconClass: 'text-[var(--interactive-primary)]' },
  system:       { icon: Bell,      iconClass: 'text-[var(--text-tertiary)]' },
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface NotificationListItemProps {
  notification: NotificationItem;
  communityId: number;
  onNavigate?: () => void;
}

export function NotificationListItem({
  notification,
  communityId,
  onNavigate,
}: NotificationListItemProps) {
  const router = useRouter();
  const markRead = useMarkRead();
  const config = CATEGORY_CONFIG[notification.category] ?? CATEGORY_CONFIG['system']!;
  const { icon: Icon, iconClass } = config;
  const isUnread = notification.readAt === null;
  const isUrgent = notification.priority === 'urgent';

  function handleClick() {
    if (isUnread) {
      markRead.mutate({ communityId, ids: [notification.id] });
    }
    onNavigate?.();
    if (notification.actionUrl) {
      router.push(notification.actionUrl);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-quick hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus',
        isUrgent && 'border-l-2 border-[var(--status-error)]',
      )}
    >
      {/* Unread dot */}
      <span
        className={cn(
          'mt-1.5 h-2 w-2 shrink-0 rounded-full',
          isUnread ? 'bg-[var(--interactive-primary)]' : 'bg-transparent',
        )}
        aria-hidden="true"
      />

      {/* Category icon */}
      <span className={cn('mt-0.5 shrink-0', iconClass)}>
        <Icon size={16} aria-hidden="true" />
      </span>

      {/* Content */}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-sm',
            isUnread
              ? 'font-semibold text-[var(--text-primary)]'
              : 'font-normal text-[var(--text-secondary)]',
          )}
        >
          {notification.title}
        </span>
        {notification.body && (
          <span className="mt-0.5 block truncate text-xs text-[var(--text-tertiary)]">
            {notification.body}
          </span>
        )}
      </span>

      {/* Timestamp */}
      <span className="shrink-0 text-xs text-[var(--text-tertiary)]">
        {formatRelative(notification.createdAt)}
      </span>
    </button>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm typecheck
git add apps/web/src/components/notifications/notification-list-item.tsx
git commit -m "feat(ui): NotificationListItem component"
```

---

## Task 15: `NotificationDropdown` component

**Files:**
- Create: `apps/web/src/components/notifications/notification-dropdown.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { useNotifications, useMarkRead } from '@/hooks/use-notifications';
import { NotificationListItem } from './notification-list-item';

interface NotificationDropdownProps {
  communityId: number;
  onClose: () => void;
}

export function NotificationDropdown({ communityId, onClose }: NotificationDropdownProps) {
  const { data, isLoading } = useNotifications(communityId, { limit: 10 });
  const markRead = useMarkRead();
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const items = data?.notifications ?? [];
  const hasUnread = items.some((n) => n.readAt === null);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Notifications"
      className="absolute right-0 top-full z-[var(--z-dropdown,50)] mt-2 w-80 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-card)] shadow-[var(--shadow-e2)]"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-default)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Notifications</h2>
        {hasUnread && (
          <button
            type="button"
            onClick={() => markRead.mutate({ communityId, all: true })}
            className="text-xs text-[var(--interactive-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Mark all read
          </button>
        )}
      </div>

      {/* Body */}
      <div className="max-h-80 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-px p-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-[var(--radius-sm)] bg-[var(--surface-muted)]"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-[var(--text-tertiary)]">You're all caught up</p>
          </div>
        ) : (
          <div role="list">
            {items.map((n) => (
              <NotificationListItem
                key={n.id}
                notification={n}
                communityId={communityId}
                onNavigate={onClose}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-[var(--border-default)] px-4 py-2.5">
        <Link
          href="/notifications"
          onClick={onClose}
          className="block text-center text-xs text-[var(--interactive-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          View all notifications
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm typecheck
git add apps/web/src/components/notifications/notification-dropdown.tsx
git commit -m "feat(ui): NotificationDropdown component"
```

---

## Task 16: `NotificationBell` component + wire into `AppTopBar`

**Files:**
- Create: `apps/web/src/components/notifications/notification-bell.tsx`
- Modify: `apps/web/src/components/layout/app-top-bar.tsx`

- [ ] **Step 1: Create `NotificationBell`**

```typescript
'use client';

import { Bell } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useUnreadCount } from '@/hooks/use-notifications';
import { useNotificationRealtime } from '@/hooks/use-notification-realtime';
import { createBrowserClient } from '@/lib/supabase/client';
import { NotificationDropdown } from './notification-dropdown';

interface NotificationBellProps {
  communityId: number | null;
}

export function NotificationBell({ communityId }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Resolve userId from Supabase session once on mount
  useEffect(() => {
    const supabase = createBrowserClient();
    void supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, []);

  const effectiveCommunityId = communityId ?? 0;
  const { data } = useUnreadCount(effectiveCommunityId);
  useNotificationRealtime(effectiveCommunityId, userId);

  const count = data?.count ?? 0;

  if (!communityId) {
    return (
      <button
        type="button"
        className="flex size-11 items-center justify-center rounded-[var(--radius-md)] text-content-tertiary lg:size-9"
        aria-label="Notifications"
        disabled
      >
        <Bell size={18} aria-hidden="true" />
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex size-11 items-center justify-center rounded-[var(--radius-md)] text-content-tertiary transition-colors duration-quick hover:bg-surface-muted hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus lg:size-9"
        aria-label={count > 0 ? `${count} unread notification${count === 1 ? '' : 's'}` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell size={18} aria-hidden="true" />
        {count > 0 && (
          <span
            className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--status-error)] px-1 text-[10px] font-semibold leading-none text-white lg:right-0.5 lg:top-0.5"
            aria-live="polite"
            aria-atomic="true"
          >
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <NotificationDropdown
          communityId={communityId}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update `AppTopBar`**

Open `apps/web/src/components/layout/app-top-bar.tsx`.

Replace the import line:
```typescript
import { Bell, Menu, Search } from 'lucide-react';
```
with:
```typescript
import { Menu, Search } from 'lucide-react';
import { NotificationBell } from '@/components/notifications/notification-bell';
```

Replace the bell button block (lines 54-60):
```typescript
          <button
            type="button"
            className="flex size-11 items-center justify-center rounded-[var(--radius-md)] text-content-tertiary transition-colors duration-quick hover:bg-surface-muted hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus lg:size-9"
            aria-label="Notifications (coming soon)"
          >
            <Bell size={18} aria-hidden="true" />
          </button>
```
with:
```typescript
          <NotificationBell communityId={communityId} />
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/notifications/notification-bell.tsx \
        apps/web/src/components/layout/app-top-bar.tsx
git commit -m "feat(ui): NotificationBell component, wire into AppTopBar"
```

---

## Task 17: `/notifications` full page

**Files:**
- Create: `apps/web/src/app/(authenticated)/notifications/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
import { Suspense } from 'react';
import { NotificationsPageClient } from './notifications-page-client';
import { getServerCommunityId } from '@/lib/api/tenant-context';

export const metadata = { title: 'Notifications' };

export default async function NotificationsPage() {
  const communityId = await getServerCommunityId();
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 lg:px-6">
      <h1 className="text-xl font-semibold text-[var(--text-primary)]">Notifications</h1>
      <Suspense>
        <NotificationsPageClient communityId={communityId} />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 2: Create the client component alongside the page**

Create `apps/web/src/app/(authenticated)/notifications/notifications-page-client.tsx`:

```typescript
'use client';

import { useState } from 'react';
import {
  useNotifications,
  useMarkRead,
  useArchiveNotifications,
  type NotificationFilters,
} from '@/hooks/use-notifications';
import { NotificationListItem } from '@/components/notifications/notification-list-item';

interface NotificationsPageClientProps {
  communityId: number;
}

const CATEGORIES = [
  { value: '', label: 'All' },
  { value: 'announcement', label: 'Announcements' },
  { value: 'document', label: 'Documents' },
  { value: 'meeting', label: 'Meetings' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'violation', label: 'Violations' },
  { value: 'election', label: 'Elections' },
] as const;

export function NotificationsPageClient({ communityId }: NotificationsPageClientProps) {
  const [category, setCategory] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);

  const filters: NotificationFilters = {
    limit: 20,
    category: category || undefined,
    unreadOnly,
  };

  const { data, isLoading, isFetching, refetch } = useNotifications(communityId, filters);
  const markRead = useMarkRead();
  const archive = useArchiveNotifications();

  const items = data?.notifications ?? [];

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCategory(c.value)}
              className={
                category === c.value
                  ? 'rounded-[var(--radius-sm)] bg-[var(--interactive-primary)] px-3 py-1.5 text-xs font-medium text-white'
                  : 'rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]'
              }
            >
              {c.label}
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
            className="rounded"
          />
          Unread only
        </label>
        <button
          type="button"
          onClick={() => markRead.mutate({ communityId, all: true })}
          className="ml-auto text-xs text-[var(--interactive-primary)] hover:underline"
          disabled={markRead.isPending}
        >
          Mark all read
        </button>
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-card)]">
        {isLoading ? (
          <div className="space-y-px p-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-[var(--radius-sm)] bg-[var(--surface-muted)]" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-[var(--text-primary)]">You're all caught up</p>
            <p className="mt-1 text-xs text-[var(--text-tertiary)]">
              New activity will appear here as it happens.
            </p>
          </div>
        ) : (
          <div role="list">
            {items.map((n) => (
              <NotificationListItem
                key={n.id}
                notification={n}
                communityId={communityId}
              />
            ))}
          </div>
        )}
      </div>

      {/* Load more */}
      {data?.nextCursor && (
        <button
          type="button"
          onClick={() => {/* cursor pagination wired in full implementation */}}
          className="w-full rounded-[var(--radius-md)] border border-[var(--border-default)] py-2.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]"
          disabled={isFetching}
        >
          {isFetching ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
```

> **Note:** The `getServerCommunityId()` helper may not exist — check how other authenticated pages resolve the community. Follow whatever pattern `apps/web/src/app/(authenticated)/dashboard/page.tsx` uses for communityId resolution and replicate it here.

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm typecheck
git add apps/web/src/app/'(authenticated)'/notifications/
git commit -m "feat(pages): /notifications full page"
```

---

## Task 18: `/mobile/notifications` page

**Files:**
- Create: `apps/web/src/app/mobile/notifications/page.tsx`

- [ ] **Step 1: Check how a sibling mobile page resolves communityId**

```bash
head -30 apps/web/src/app/mobile/announcements/page.tsx
```

Replicate the same server/client pattern for communityId resolution.

- [ ] **Step 2: Create the page**

```typescript
'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { useNotifications, useMarkRead } from '@/hooks/use-notifications';
import { NotificationListItem } from '@/components/notifications/notification-list-item';
import { useCommunityId } from '@/hooks/use-community-id'; // use whatever hook mobile pages use

export default function MobileNotificationsPage() {
  const router = useRouter();
  const communityId = useCommunityId();
  const { data, isLoading, refetch, isFetching } = useNotifications(communityId ?? 0, { limit: 30 });
  const markRead = useMarkRead();

  const items = data?.notifications ?? [];

  return (
    <div className="flex min-h-screen flex-col bg-[var(--surface-page)]">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-[var(--border-default)] bg-[var(--surface-card)] px-4 py-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex size-10 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          aria-label="Go back"
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <h1 className="flex-1 text-base font-semibold text-[var(--text-primary)]">Notifications</h1>
        {items.some((n) => n.readAt === null) && communityId && (
          <button
            type="button"
            onClick={() => markRead.mutate({ communityId, all: true })}
            className="text-xs text-[var(--interactive-primary)]"
          >
            Mark all read
          </button>
        )}
      </header>

      {/* List */}
      <div className="flex-1">
        {isLoading ? (
          <div className="space-y-px p-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-[var(--radius-sm)] bg-[var(--surface-muted)]" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-medium text-[var(--text-primary)]">You're all caught up</p>
            <p className="mt-1 text-xs text-[var(--text-tertiary)]">New activity will appear here.</p>
          </div>
        ) : (
          <div role="list" className="bg-[var(--surface-card)]">
            {items.map((n) => (
              <NotificationListItem
                key={n.id}
                notification={n}
                communityId={communityId ?? 0}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

> **Note:** Replace `useCommunityId` with whatever hook or context mobile pages use to get communityId. Check `apps/web/src/app/mobile/announcements/page.tsx` for the exact pattern.

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm typecheck
git add apps/web/src/app/mobile/notifications/page.tsx
git commit -m "feat(pages): /mobile/notifications page"
```

---

## Task 19: Event integration — meetings

**Files:**
- Modify: `apps/web/src/app/api/v1/meetings/route.ts`

- [ ] **Step 1: Add import**

At the top of the file, add to the notification-service import:

```typescript
import { queueNotification, createNotificationsForEvent } from '@/lib/services/notification-service';
```

- [ ] **Step 2: Add in-app call after the existing `queueNotification` try/catch block**

After the closing `}` of the existing `queueNotification` try/catch, add:

```typescript
    void createNotificationsForEvent(
      communityId,
      {
        category: 'meeting',
        title: `New Meeting: ${title}`,
        body: `${startsAtDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: communityTimezone })} · ${location}`,
        actionUrl: `/meetings/${createdMeeting.id}`,
        sourceType: 'meeting',
        sourceId: String(createdMeeting.id),
      },
      'all',
      actorUserId,
    ).catch((err: unknown) => {
      console.error('[meetings] in-app notification failed', { communityId, meetingId: createdMeeting.id, error: err instanceof Error ? err.message : String(err) });
    });
```

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm typecheck
git add apps/web/src/app/api/v1/meetings/route.ts
git commit -m "feat: wire in-app notifications for meeting creation"
```

---

## Task 20: Event integration — maintenance requests

**Files:**
- Modify: `apps/web/src/app/api/v1/maintenance-requests/[id]/route.ts`

- [ ] **Step 1: Add import**

Add `createNotificationsForEvent` to the existing notification-service import.

- [ ] **Step 2: Add in-app call inside the `oldStatus !== undefined && newStatus !== undefined` block**

After the existing `void queueNotification(...)` call, add:

```typescript
    void createNotificationsForEvent(
      communityId,
      {
        category: 'maintenance',
        title: `Maintenance Update: ${existing['title'] as string}`,
        body: `Status changed to ${newStatus}`,
        actionUrl: `/maintenance/${id}`,
        sourceType: 'maintenance',
        sourceId: `maintenance:${id}:status:${newStatus}`,
      },
      { type: 'specific_user', userId: existing['submittedById'] as string },
      actorUserId,
    ).catch((err: unknown) => {
      console.error('[maintenance] in-app notification failed', { communityId, id, error: err instanceof Error ? err.message : String(err) });
    });
```

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm typecheck
git add 'apps/web/src/app/api/v1/maintenance-requests/[id]/route.ts'
git commit -m "feat: wire in-app notifications for maintenance status changes"
```

---

## Task 21: Event integration — document uploads

**Files:**
- Modify: `apps/web/src/lib/documents/create-uploaded-document.ts`

- [ ] **Step 1: Add import**

Add `createNotificationsForEvent` to the existing notification-service import.

- [ ] **Step 2: Add in-app call inside the `sourceType === 'library'` guard, after the existing `queueNotificationDetailed` try/catch**

```typescript
  if (input.sourceType === 'library' && input.sendDocumentNotifications !== false) {
    // ... existing email notification block (unchanged) ...

    // In-app notification (independent of email result)
    void createNotificationsForEvent(
      input.communityId,
      {
        category: 'document',
        title: `New Document: ${input.title}`,
        body: input.documentCategory ?? undefined,
        actionUrl: `/documents/${created['id']}`,
        sourceType: 'document',
        sourceId: String(created['id']),
      },
      'all',
      input.userId,
    ).catch((err: unknown) => {
      console.error('[documents] in-app notification failed', { communityId: input.communityId, error: err instanceof Error ? err.message : String(err) });
    });
  }
```

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm typecheck
git add apps/web/src/lib/documents/create-uploaded-document.ts
git commit -m "feat: wire in-app notifications for document uploads"
```

---

## Task 22: Event integration — announcements

**Files:**
- Modify: `apps/web/src/app/api/v1/announcements/route.ts`

- [ ] **Step 1: Add import**

Add `createNotificationsForEvent` to the existing notification-service import (or add a new import if the file doesn't import from notification-service yet).

- [ ] **Step 2: Map announcement audience to RecipientFilter**

In the announcements route, find the `handleCreate` function. After the `queueAnnouncementDelivery` try/catch block, add:

```typescript
    const audienceFilter: import('@/lib/services/notification-service').RecipientFilter =
      data.audience === 'owners_only' ? 'owners_only'
      : data.audience === 'board_only' ? 'board_only'
      : 'all'; // 'all' and 'tenants_only' both map to 'all' for in-app

    void createNotificationsForEvent(
      communityId,
      {
        category: 'announcement',
        title: data.title,
        body: data.body.replace(/<[^>]+>/g, '').slice(0, 120) || undefined,
        actionUrl: `/announcements/${created.id}`,
        sourceType: 'announcement',
        sourceId: String(created.id),
      },
      audienceFilter,
      audit.userId,
    ).catch((err: unknown) => {
      console.error('[announcements] in-app notification failed', { communityId, announcementId: created.id, error: err instanceof Error ? err.message : String(err) });
    });
```

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm typecheck
git add apps/web/src/app/api/v1/announcements/route.ts
git commit -m "feat: wire in-app notifications for announcement creation"
```

---

## Task 23: Event integration — violations

**Files:**
- Modify: `apps/web/src/lib/services/violations-service.ts`

- [ ] **Step 1: Add import**

Add `createNotificationsForEvent` to the existing notification-service import.

- [ ] **Step 2: Add in-app call in `notifyViolationNotice`**

Inside `notifyViolationNotice`, after the existing `sendNotification` call, add:

```typescript
    void createNotificationsForEvent(
      communityId,
      {
        category: 'violation',
        title: 'Violation Notice Issued',
        body: `Violation #${violation.id} has been noticed.`,
        actionUrl: `/violations/${violation.id}`,
        sourceType: 'violation',
        sourceId: String(violation.id),
        priority: 'high',
      },
      violation.reportedByUserId
        ? { type: 'specific_user', userId: violation.reportedByUserId }
        : 'owners_only',
      actorUserId,
    ).catch((err: unknown) => {
      console.error('[violations] in-app violation notice failed', { communityId, violationId: violation.id, error: err instanceof Error ? err.message : String(err) });
    });
```

- [ ] **Step 3: Add in-app call in `notifyArcDecision`**

Inside `notifyArcDecision`, after the existing `sendNotification` call, add:

```typescript
    const approved = submission.status === 'approved';
    void createNotificationsForEvent(
      communityId,
      {
        category: 'violation',
        title: approved ? 'ARC Application Approved' : 'ARC Application Denied',
        body: `Your ARC application #${submission.id} was ${approved ? 'approved' : 'denied'}.`,
        actionUrl: `/arc/${submission.id}`,
        sourceType: 'violation',
        sourceId: `violation-arc:${submission.id}:${submission.status}`,
        priority: approved ? 'normal' : 'high',
      },
      { type: 'specific_user', userId: submission.submittedByUserId },
      actorUserId,
    ).catch((err: unknown) => {
      console.error('[violations] in-app ARC decision failed', { communityId, arcSubmissionId: submission.id, error: err instanceof Error ? err.message : String(err) });
    });
```

- [ ] **Step 4: Typecheck + commit**

```bash
pnpm typecheck
git add apps/web/src/lib/services/violations-service.ts
git commit -m "feat: wire in-app notifications for violation notice and ARC decisions"
```

---

## Task 24: Final verification

- [ ] **Step 1: Full typecheck**

```bash
pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 2: Run tests**

```bash
pnpm test
```

Expected: existing tests still pass. No regressions.

- [ ] **Step 3: Run integration tests (requires DATABASE_URL)**

```bash
scripts/with-env-local.sh pnpm exec vitest run --config apps/web/vitest.integration.config.ts
```

- [ ] **Step 4: Lint**

```bash
pnpm lint
```

Expected: 0 errors (the DB access guard should pass since all apps/web code uses `@propertypro/db` not direct Drizzle).

- [ ] **Step 5: Final commit if any fixups needed**

```bash
git add -p  # stage only fixup changes
git commit -m "fix: typecheck and lint fixups for notification infrastructure"
```

---

## Self-Review Checklist

| Spec requirement | Task |
|-----------------|------|
| `notifications` schema with indexes + unique | Task 1 |
| Additive muting columns on notification_preferences | Task 2 |
| Query helpers (list, count, read, archive, insert) | Task 3 |
| Schema + query exports from `@propertypro/db` | Task 4 |
| Migration 0129 — table + RLS + Realtime publication | Task 5 |
| Migration 0130 — muting columns | Task 5 |
| Journal entries added | Task 5 |
| Extended `UserNotificationPreferences` type | Task 6 |
| `createNotificationsForEvent()` service | Task 7 |
| GET /api/v1/notifications (paginated) | Task 8 |
| GET /api/v1/notifications/unread-count | Task 9 |
| PATCH /api/v1/notifications/read | Task 10 |
| PATCH /api/v1/notifications/archive | Task 11 |
| TanStack Query hooks | Task 12 |
| Supabase Realtime hook | Task 13 |
| `NotificationListItem` component | Task 14 |
| `NotificationDropdown` component | Task 15 |
| `NotificationBell` + AppTopBar replacement | Task 16 |
| `/notifications` page | Task 17 |
| `/mobile/notifications` page | Task 18 |
| Meeting event wiring | Task 19 |
| Maintenance event wiring | Task 20 |
| Document event wiring | Task 21 |
| Announcement event wiring | Task 22 |
| Violation event wiring (noticed + ARC) | Task 23 |
| Elections — deferred, no POST endpoint exists | noted in spec |
