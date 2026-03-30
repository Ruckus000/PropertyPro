# In-App Notification Infrastructure — Design Spec

> Real-time in-app notifications for PropertyPro, delivered via Supabase Realtime and persisted in a tenant-scoped `notifications` table.

## Context

PropertyPro already has a mature **email** notification pipeline (`notification-service.ts`) that dispatches immediate emails or queues digest items for 4 event types (meeting, maintenance, compliance, document). A bell icon stub exists in `app-top-bar.tsx` but is non-functional.

This spec adds the **in-app** notification channel: a `notifications` table, Supabase Realtime subscription for instant delivery, API routes for CRUD, UI components (bell + dropdown + full page), and integration hooks into all major event flows.

## Goals

1. Users see a live unread-count badge on the bell icon that updates without page refresh.
2. Clicking the bell shows a dropdown of recent notifications with mark-read and navigate actions.
3. A full `/notifications` page provides filtered, paginated history.
4. Mobile gets `/mobile/notifications` matching existing mobile route patterns.
5. Per-category muting lets users silence specific notification types in-app.
6. The system is additive — email delivery continues unchanged.

## Non-Goals

- Push notifications (browser/mobile) — future phase.
- SMS delivery changes — already handled by emergency broadcast service.
- Notification grouping/threading — keep it flat for MVP.
- Notification preferences UI for the new in-app muting columns — reuse existing settings page pattern but out of scope for this spec (the columns are additive and default to `true`).

---

## 1. Database Schema

### 1.1 `notifications` table (`packages/db/src/schema/notifications.ts`)

```
Column              Type                    Constraints
─────────────────── ─────────────────────── ───────────────────────────────
id                  bigserial               PK
community_id        bigint                  NOT NULL FK → communities(id) ON DELETE CASCADE
user_id             uuid                    NOT NULL FK → users(id) ON DELETE CASCADE
category            text                    NOT NULL — enum-like: see Category Values
title               text                    NOT NULL
body                text                    nullable
action_url          text                    nullable — deep link to source
source_type         text                    NOT NULL — entity type ('meeting', 'document', etc.)
source_id           text                    NOT NULL — entity ID for dedup + navigation
priority            text                    NOT NULL DEFAULT 'normal' — 'low' | 'normal' | 'high' | 'urgent'
read_at             timestamptz             nullable — NULL = unread
archived_at         timestamptz             nullable — NULL = active
created_at          timestamptz             NOT NULL DEFAULT now()
deleted_at          timestamptz             nullable — soft delete
```

**Category Values:** `'announcement'`, `'document'`, `'meeting'`, `'maintenance'`, `'violation'`, `'election'`, `'system'`

**Indexes:**

| Name | Columns | Purpose |
|------|---------|---------|
| `notifications_feed_idx` | `(community_id, user_id, archived_at, deleted_at, created_at DESC)` | Main feed query |
| `notifications_unread_idx` | `(community_id, user_id, read_at)` WHERE `read_at IS NULL AND deleted_at IS NULL` | Unread count (partial index) |
| `notifications_dedup_unique` | `(community_id, user_id, source_type, source_id)` | Prevent duplicate notifications per user per event. Note: `source_id` should encode enough specificity to allow multiple notifications from the same entity (e.g., `"maintenance:45:status:resolved"` vs `"maintenance:45:status:in_progress"`). For single-fire events (announcement published, meeting created), plain entity ID suffices. |

### 1.2 Additive columns on `notification_preferences`

Six boolean columns, all `DEFAULT true`:

```sql
in_app_announcements  boolean NOT NULL DEFAULT true
in_app_documents      boolean NOT NULL DEFAULT true
in_app_meetings       boolean NOT NULL DEFAULT true
in_app_maintenance    boolean NOT NULL DEFAULT true
in_app_violations     boolean NOT NULL DEFAULT true
in_app_elections      boolean NOT NULL DEFAULT true
```

These work with the existing `in_app_enabled` master toggle:
- `in_app_enabled = false` → no in-app notifications at all
- `in_app_enabled = true` AND `in_app_violations = false` → violations muted, everything else on

### 1.3 Migrations

**Migration 0129** — `create_notifications_table`:
- CREATE TABLE `notifications` with all columns, indexes, and unique constraint
- RLS: `ALTER TABLE notifications ENABLE ROW LEVEL SECURITY; ALTER TABLE notifications FORCE ROW LEVEL SECURITY;`
- RLS SELECT policy: `user_id = auth.uid()` (users see only their own)
- RLS INSERT policy: service role only (server inserts, not client)
- Write-scope trigger: `BEFORE INSERT OR UPDATE` trigger calling `pp_rls_enforce_tenant_community_id()` (matches the canonical pattern from migration 0020, used by `move_checklists`, `access_requests`, and other tenant tables — NOT `enforce_community_write_scope()`)
- Realtime publication: `ALTER PUBLICATION supabase_realtime ADD TABLE notifications;`

**Migration 0130** — `add_in_app_muting_columns`:
- ALTER TABLE `notification_preferences` ADD COLUMN for each of the 6 booleans
- All `NOT NULL DEFAULT true` (additive, non-breaking)

---

## 2. Service Layer

### 2.1 `createNotificationsForEvent()` in `notification-service.ts`

```typescript
interface InAppNotificationEvent {
  category: NotificationCategory;
  title: string;
  body?: string;
  actionUrl?: string;
  sourceType: string;
  sourceId: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}

interface CreateNotificationsResult {
  created: number;
  skipped: number;
}

async function createNotificationsForEvent(
  communityId: number,
  event: InAppNotificationEvent,
  recipientFilter: RecipientFilter,
  actorUserId?: string,
): Promise<CreateNotificationsResult>
```

**Logic:**
1. Resolve eligible recipients by reusing the role-matching logic from `resolveRecipientDeliveries` (specifically `isRoleMatch`), but with in-app-specific preference checks instead of email frequency checks.
2. For each recipient, check:
   - `in_app_enabled = true` (master toggle)
   - Category-specific toggle is `true` (e.g., `in_app_meetings` for category `'meeting'`)
3. Exclude `actorUserId` from recipients (don't notify yourself).
4. Batch-insert notification rows (chunks of 100, using `ON CONFLICT DO NOTHING` on the unique constraint for idempotency).
5. Return `{ created, skipped }`.

### 2.2 Category-to-preference mapping

```typescript
const CATEGORY_TO_PREF_KEY: Record<NotificationCategory, keyof NotificationPreferences | null> = {
  announcement: 'inAppAnnouncements',
  document:     'inAppDocuments',
  meeting:      'inAppMeetings',
  maintenance:  'inAppMaintenance',
  violation:    'inAppViolations',
  election:     'inAppElections',
  system:       null,  // system notifications always delivered
};
```

---

## 3. API Routes

All routes under `apps/web/src/app/api/v1/notifications/`.

### 3.1 `GET /api/v1/notifications`

**Query params:**
- `cursor` (string, optional) — cursor for pagination (notification ID). Pagination fetches rows with `id < cursor`, ordered by `created_at DESC`. Excludes archived and soft-deleted by default.
- `limit` (number, optional, default 20, max 50)
- `category` (string, optional) — filter by category
- `unread_only` (boolean, optional) — filter to unread

**Response:**
```json
{
  "notifications": [
    {
      "id": 123,
      "category": "meeting",
      "title": "Board Meeting Scheduled",
      "body": "March 15 at 7:00 PM · Community Center",
      "actionUrl": "/meetings/45",
      "sourceType": "meeting",
      "sourceId": "45",
      "priority": "normal",
      "readAt": null,
      "createdAt": "2026-03-29T14:00:00Z"
    }
  ],
  "nextCursor": "122"
}
```

### 3.2 `GET /api/v1/notifications/unread-count`

**Response:**
```json
{ "count": 7 }
```

Lightweight query using the partial index on `read_at IS NULL`.

### 3.3 `PATCH /api/v1/notifications/read`

**Body (one of):**
```json
{ "ids": [123, 124, 125] }
// or
{ "all": true }
```

Sets `read_at = now()` on matching rows scoped to current user.

### 3.4 `PATCH /api/v1/notifications/archive`

**Body:**
```json
{ "ids": [123, 124] }
```

Sets `archived_at = now()` on matching rows scoped to current user.

---

## 4. Client Components

### 4.1 `NotificationBell` (`apps/web/src/components/notifications/notification-bell.tsx`)

- Wraps the existing bell icon button in `app-top-bar.tsx`.
- Fetches unread count via `GET /api/v1/notifications/unread-count` (TanStack Query).
- Subscribes to Supabase Realtime channel `public:notifications` filtered by `user_id=eq.{userId}` for INSERT events.
- On Realtime INSERT: increment local unread count, optionally show toast.
- On click: opens `NotificationDropdown` popover.
- Badge: red dot with count (hidden when 0, shows "9+" for > 9).

### 4.2 `NotificationDropdown` (`apps/web/src/components/notifications/notification-dropdown.tsx`)

- Popover anchored to the bell button.
- Fetches latest 10 notifications via `GET /api/v1/notifications?limit=10`.
- Header: "Notifications" + "Mark all read" button.
- Body: list of `NotificationListItem` components.
- Footer: "View all notifications" link → `/notifications`.
- Empty state: "You're all caught up" with illustration.

### 4.3 `NotificationListItem` (`apps/web/src/components/notifications/notification-list-item.tsx`)

- Category icon (mapped from category → Lucide icon + color).
- Title (bold if unread) + body preview (1 line, truncated).
- Relative timestamp ("2m ago", "1h ago", "Yesterday").
- Unread indicator: blue dot on left edge.
- Click: navigate to `actionUrl`, fire `PATCH /notifications/read` with the notification ID.
- Priority "urgent": subtle left border accent in `--status-error` color.

### 4.4 TanStack Query Hook (`apps/web/src/hooks/use-notifications.ts`)

```typescript
const NOTIFICATION_KEYS = {
  all: (communityId: number) => ['notifications', communityId] as const,
  list: (communityId: number, filters?: NotificationFilters) =>
    ['notifications', communityId, 'list', filters] as const,
  unreadCount: (communityId: number) =>
    ['notifications', communityId, 'unread-count'] as const,
};

export function useNotifications(communityId: number, filters?: NotificationFilters);
export function useUnreadCount(communityId: number);
export function useMarkRead();
export function useArchiveNotifications();
```

### 4.5 Realtime Hook (`apps/web/src/hooks/use-notification-realtime.ts`)

Subscribes to Supabase Realtime channel. On INSERT event:
- Invalidates `NOTIFICATION_KEYS.unreadCount` and `NOTIFICATION_KEYS.list` queries.
- Returns cleanup function for unsubscribe on unmount.

---

## 5. Pages

### 5.1 `/notifications` (`apps/web/src/app/(authenticated)/notifications/page.tsx`)

Full notification center:
- Filter bar: category dropdown, read/unread toggle.
- Infinite scroll list using cursor-based pagination.
- Bulk actions: "Mark all read", "Archive selected".
- Empty state per existing design system patterns.

### 5.2 `/mobile/notifications` (`apps/web/src/app/mobile/notifications/page.tsx`)

Mobile-optimized:
- Full-bleed list, no sidebar.
- Pull-to-refresh via `refetch()`.
- Same data source, mobile layout matching `/mobile/announcements` pattern.

---

## 6. Event Integration

### 6.1 Wiring Points

Each call site already calls `queueNotification()` for email. Add a parallel `createNotificationsForEvent()` call at each location.

| Event | File | Category | Recipients | Source |
|-------|------|----------|------------|--------|
| Announcement published | `apps/web/src/app/api/v1/announcements/route.ts` (POST) — alongside `queueAnnouncementDelivery()` | `announcement` | Map announcement `audience` field to `RecipientFilter` (`'all'` \| `'owners_only'` \| `'board_only'` \| `'tenants_only'` → matching `RecipientFilter` value) | `announcement:{id}` |
| Document uploaded | `apps/web/src/lib/documents/create-uploaded-document.ts` — inside the `sourceType === 'library'` guard | `document` | `all` | `document:{id}` |
| Meeting created | `apps/web/src/app/api/v1/meetings/route.ts` (POST) — alongside existing `queueNotification()` | `meeting` | `all` | `meeting:{id}` |
| Maintenance status change | `apps/web/src/app/api/v1/maintenance-requests/[id]/route.ts` (PATCH) — alongside existing `queueNotification()` | `maintenance` | `specific_user` (submitter, from `existing['submittedById']`) | `maintenance:{id}:status:{newStatus}` |
| Violation noticed | `apps/web/src/lib/services/violations-service.ts` — inside `notifyViolationNotice()` alongside existing `sendNotification()` | `violation` | `reportedByUserId` if set, else `owners_only` | `violation:{id}` |
| Violation ARC decision | `apps/web/src/lib/services/violations-service.ts` — inside `notifyArcDecision()` alongside existing `sendNotification()` | `violation` | `specific_user` (submitter) | `violation-arc:{submissionId}:{decision}` |

> **Elections:** No POST handler exists for election creation as of 2026-03-29. Wire in-app notifications here when that endpoint is built.

### 6.2 Integration Pattern

```typescript
// Existing email dispatch (unchanged)
await queueNotification(communityId, emailEvent, recipientFilter, actorUserId);

// New in-app dispatch (parallel, independent)
await createNotificationsForEvent(communityId, {
  category: 'meeting',
  title: `New Meeting: ${meetingTitle}`,
  body: `${meetingDate} at ${meetingTime} · ${location}`,
  actionUrl: `/meetings/${meetingId}`,
  sourceType: 'meeting',
  sourceId: String(meetingId),
}, recipientFilter, actorUserId);
```

---

## 7. Schema Exports

Add to `packages/db/src/schema/index.ts`:
- `export * from './notifications'`
- Type aliases: `Notification`, `NewNotification`

Update `notification-preferences` type aliases to include the new columns.

---

## 8. File Manifest

| File | Action |
|------|--------|
| `packages/db/src/schema/notifications.ts` | CREATE |
| `packages/db/src/schema/notification-preferences.ts` | MODIFY (add type exports if needed) |
| `packages/db/src/schema/index.ts` | MODIFY (add exports) |
| `packages/db/migrations/0129_create_notifications_table.sql` | CREATE |
| `packages/db/migrations/0130_add_in_app_muting_columns.sql` | CREATE |
| `packages/db/migrations/meta/_journal.json` | MODIFY (add entries) |
| `apps/web/src/lib/services/notification-service.ts` | MODIFY (add `createNotificationsForEvent`) |
| `apps/web/src/app/api/v1/notifications/route.ts` | CREATE (GET list) |
| `apps/web/src/app/api/v1/notifications/unread-count/route.ts` | CREATE (GET count) |
| `apps/web/src/app/api/v1/notifications/read/route.ts` | CREATE (PATCH mark read) |
| `apps/web/src/app/api/v1/notifications/archive/route.ts` | CREATE (PATCH archive) |
| `apps/web/src/hooks/use-notifications.ts` | CREATE |
| `apps/web/src/hooks/use-notification-realtime.ts` | CREATE |
| `apps/web/src/components/notifications/notification-bell.tsx` | CREATE |
| `apps/web/src/components/notifications/notification-dropdown.tsx` | CREATE |
| `apps/web/src/components/notifications/notification-list-item.tsx` | CREATE |
| `apps/web/src/components/layout/app-top-bar.tsx` | MODIFY (replace bell stub) |
| `apps/web/src/app/(authenticated)/notifications/page.tsx` | CREATE |
| `apps/web/src/app/mobile/notifications/page.tsx` | CREATE |
| `apps/web/src/app/api/v1/announcements/route.ts` | MODIFY (add call alongside `queueAnnouncementDelivery`) |
| `apps/web/src/lib/documents/create-uploaded-document.ts` | MODIFY (add call inside library guard) |
| `apps/web/src/app/api/v1/meetings/route.ts` | MODIFY (add call alongside `queueNotification`) |
| `apps/web/src/app/api/v1/maintenance-requests/[id]/route.ts` | MODIFY (add call alongside `queueNotification`) |
| `apps/web/src/lib/services/violations-service.ts` | MODIFY (add calls inside `notifyViolationNotice` and `notifyArcDecision`) |
