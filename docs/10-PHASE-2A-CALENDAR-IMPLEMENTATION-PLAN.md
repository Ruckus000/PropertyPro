# Phase 2A: Calendar View + iCal Feed — Implementation Plan

**Date:** March 18, 2026
**Status:** Plan (pre-implementation)
**Source:** [09-IMPLEMENTATION-ROADMAP-2026-03-16.md](09-IMPLEMENTATION-ROADMAP-2026-03-16.md) lines 344-369
**Revision:** v2 — incorporates senior dev code review, codebase audit, and design system alignment.

---

## 1. Current State Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Meetings table | Exists | `starts_at` only (no `ends_at`); types: board, annual, special, budget, committee |
| `meeting_documents` join table | Exists | Links meetings ↔ documents; attach/detach via POST actions |
| iCal feed (public) | Exists | `/api/v1/calendar/meetings.ics` — unauthenticated, subdomain-resolved tenant |
| iCal feed (authenticated) | Exists | `/api/v1/calendar/my-meetings.ics` — session-scoped |
| ICS builder (`ics.ts`) | Exists | Meetings only; hardcoded 1-hour duration; no assessment events |
| Google Calendar adapter | **Mock** | Uses `oauth.google.example` — deterministic fakes, not production |
| `calendar_sync_tokens` | Exists | Per-user, per-community, encrypted token storage |
| Desktop meetings page | **Missing** | Nav links to `/communities/[id]/meetings` → 404 |
| MeetingForm / MeetingList | **Broken stubs** | Neither calls the API; no TanStack Query; no design token usage; raw HTML inputs |
| Assessment line items | Exists | `due_date` (date type) per unit; status: pending/paid/overdue/waived |
| `user_roles` | Exists | V2 model: unique `(userId, communityId)`; `unitId` nullable for manager/pm_admin roles |
| Nav config | Exists | `meetings` entry present, gated by `hasMeetings` feature flag |

### Key Codebase Gaps Identified

1. **No TanStack Query hooks** for meetings — every other feature area has a `use-[resource].ts` file
2. **No `GET /api/v1/meetings/:id`** detail endpoint — documents are managed via attach/detach actions on the list route
3. **`requireMeetingsEnabled` blocks apartments** at the API layer but `hasMeetings: true` for all types — apartments see nav link but get 403
4. **Meeting duration hardcoded** — ICS builder assumes 1 hour; no `ends_at` column in schema
5. **ICS feed has no date filtering** — returns all meetings (including historical) on every request

---

## 2. Resolved Decisions

All open questions from v1 have been resolved:

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | Add `ends_at` to meetings? | **Yes — add now** | Nullable column, fallback to `starts_at + 1hr` in ICS builder. Hardcoded durations are a data integrity problem. |
| 2 | Apartments + meetings inconsistency? | **Remove `requireMeetingsEnabled` block** | Let apartments have meetings. Aligns API with feature flag matrix. |
| 3 | Assessment due dates for admin roles? | **Admins see community-wide aggregates; owners see their unit only; tenants see nothing** | Matches existing line-items API pattern (owner forced to their unit, admin sees all). See §2.1 for details. |
| 4 | Calendar UI library? | **Custom month grid** | Zero external UI libraries in codebase; design system is opinionated (10px radius, E0-E3 elevation, semantic tokens). Custom grid stays native. ~200 lines of JSX using existing Card/Badge/Button. |
| 5 | Google Calendar OAuth? | **Defer to Phase 3** | Mock adapter stays. No env vars needed for 2A. |
| 6 | ICS past meeting cutoff? | **Include all historical** | Calendar clients handle large feeds fine; no artificial cutoff. |
| 7 | Meeting documents in API? | **Add `GET /api/v1/meetings/:id`** | Clean detail endpoint; avoids N+1 in the list response. |
| 8 | MeetingForm / MeetingList? | **Rewrite from scratch** | Neither calls the API, neither uses TanStack Query, neither follows design tokens. Not salvageable. |

### 2.1 Assessment Due Date Visibility Model

The existing pattern from `GET /api/v1/assessments/[id]/line-items` provides the template:

| Role | Calendar shows | Query approach |
|------|---------------|----------------|
| **Admin roles** (board_member, board_president, cam, pm_admin) | Community-wide aggregated due dates (e.g., "Q1 Assessment Due — 42 units pending") | Query all `assessment_line_items` for community, aggregate by `(due_date, assessment_id)` |
| **Owner resident** | Their unit's specific due dates and amounts | Use `listActorUnitIds()` to resolve unit(s), filter line items to those units |
| **Tenant resident** | No assessment events | Assessments are owner-only charges; `assessment_line_items` links to `unitId` not `userId` |
| **Board member who owns a unit** | Admin view (all units aggregated) | `(userId, communityId)` is unique in `user_roles` — they have `role='manager'`, so they're in the admin bucket |

**ICS feeds:**
- **Public feed:** Aggregated by `(due_date, assessment_id)`. Title: assessment title or "Dues Due". No PII, no per-unit amounts.
- **My-meetings feed:** Admin roles see same aggregation. Owner residents see only their unit's line items. Tenants see no assessment events.

---

## 3. Schema Migration

### 3.1 Migration: `0103_add_meetings_ends_at.sql`

```sql
-- Add optional ends_at column to meetings table
ALTER TABLE meetings
  ADD COLUMN ends_at timestamptz;

-- Backfill existing rows: set ends_at = starts_at + 1 hour
UPDATE meetings
  SET ends_at = starts_at + interval '1 hour'
  WHERE ends_at IS NULL;

COMMENT ON COLUMN meetings.ends_at IS 'Optional meeting end time. Nullable; consumers fall back to starts_at + 1 hour when NULL.';
```

**Drizzle schema update** (`packages/db/src/schema/meetings.ts`):
```typescript
/** Optional end datetime. Consumers fall back to startsAt + 1hr when null. */
endsAt: timestamp('ends_at', { withTimezone: true }),
```

**Column is nullable** — existing code continues to work with the `+ 1hr` fallback. New meetings can optionally specify an end time.

---

## 4. Implementation Tasks — Dependency-Ordered

Tasks are organized by dependency chain, not arbitrary priority labels. Each workstream can proceed in parallel where indicated.

### Track A: API Layer (prerequisite for all UI work)

#### A1. Remove apartment meetings block
**Files:** `apps/web/src/app/api/v1/meetings/route.ts`

- Delete the `requireMeetingsEnabled` function and its invocation
- All community types already have `hasMeetings: true` in the feature matrix
- The ICS endpoints already have their own `requireCalendarSyncEnabled` gate

**Verification:** Apartments can create/read meetings via API.

#### A2. Add `GET /api/v1/meetings/:id` detail endpoint
**Files:** Create `apps/web/src/app/api/v1/meetings/[id]/route.ts`

- Authenticated, tenant-scoped, permission-gated (`meetings`, `read`)
- Returns meeting row + joined `meeting_documents` (with document title, category, file size)
- Uses `createScopedClient` for both queries
- Pattern: fetch meeting by ID, verify community match, then fetch associated documents

**Response shape:**
```typescript
{
  data: {
    id: number;
    title: string;
    meetingType: string;
    startsAt: string; // ISO
    endsAt: string | null; // ISO
    location: string;
    noticePostedAt: string | null;
    minutesApprovedAt: string | null;
    deadlines: {
      noticePostBy: string;
      ownerVoteDocsBy: string;
      minutesPostBy: string;
    };
    documents: Array<{
      id: number;
      title: string;
      category: string;
      attachedAt: string;
    }>;
  }
}
```

#### A3. Extend `GET /api/v1/meetings` with date range filtering
**Files:** `apps/web/src/app/api/v1/meetings/route.ts`

- Add optional query params: `?start=YYYY-MM-DD&end=YYYY-MM-DD`
- Filter: `startsAt >= start` AND `startsAt < end + 1 day`
- **Validation:** Zod; reject invalid date format, `start > end`, range > 366 days
- When params are omitted, return all meetings (backward compatible with dashboard)
- Response shape unchanged (flat meeting rows + computed deadlines)

#### A4. Add assessment due dates to calendar data
**Files:** Create `apps/web/src/app/api/v1/calendar/events/route.ts`

This is a **read-only aggregation endpoint** that merges meetings and assessment due dates for the calendar UI. It is distinct from the meetings CRUD route.

- Authenticated, tenant-scoped
- Query params: `?start=YYYY-MM-DD&end=YYYY-MM-DD` (required)
- Permission: `meetings` read (for meeting events) + `finances` read (for assessment events)
- Returns a unified event list:

```typescript
{
  data: Array<
    | { type: 'meeting'; id: number; title: string; meetingType: string; startsAt: string; endsAt: string | null; location: string; }
    | { type: 'assessment_due'; dueDate: string; assessmentTitle: string; assessmentId: number; unitCount: number; pendingCount: number; totalAmountCents: number; }
    | { type: 'my_assessment_due'; dueDate: string; assessmentTitle: string; assessmentId: number; amountCents: number; status: string; unitLabel: string; }
  >
}
```

**Visibility logic:**
- Meetings: returned for all roles with `meetings` read permission
- Assessment events: role-branching per §2.1:
  - Admin → `type: 'assessment_due'` with aggregate counts
  - Owner → `type: 'my_assessment_due'` filtered to their unit(s) via `listActorUnitIds()`
  - Tenant → no assessment events in response
- If user lacks `finances` read permission → assessment events omitted entirely (meetings still returned)

**Rationale for separate endpoint:** The meetings CRUD route handles mutations and compliance deadlines. Mixing assessment aggregation into it violates single-responsibility. The calendar events endpoint is a pure read projection that composes data from multiple sources.

### Track B: Client Infrastructure (parallel with Track A)

#### B1. Create TanStack Query hooks
**Files:** Create `apps/web/src/hooks/use-meetings.ts`

Follow the established pattern from other hook files (`use-documents.ts`, `use-announcements.ts`):

```typescript
// Query keys
export const MEETING_KEYS = {
  all: ['meetings'] as const,
  list: (communityId: number) => [...MEETING_KEYS.all, 'list', communityId] as const,
  detail: (communityId: number, id: number) => [...MEETING_KEYS.all, 'detail', communityId, id] as const,
  calendarEvents: (communityId: number, start: string, end: string) =>
    [...MEETING_KEYS.all, 'calendar', communityId, start, end] as const,
};

// Hooks
export function useMeetings(communityId: number, options?: { start?: string; end?: string });
export function useMeeting(communityId: number, id: number);
export function useCalendarEvents(communityId: number, start: string, end: string);
export function useCreateMeeting(communityId: number);
export function useUpdateMeeting(communityId: number);
export function useDeleteMeeting(communityId: number);
```

Mutations invalidate `MEETING_KEYS.all` on success.

#### B2. Create calendar event type definitions
**Files:** Create `apps/web/src/lib/calendar/event-types.ts`

```typescript
export type CalendarEventType = 'meeting' | 'assessment_due' | 'my_assessment_due';

export interface CalendarMeetingEvent {
  type: 'meeting';
  id: number;
  title: string;
  meetingType: MeetingType;
  startsAt: string;
  endsAt: string | null;
  location: string;
}

export interface CalendarAssessmentEvent {
  type: 'assessment_due';
  dueDate: string;
  assessmentTitle: string;
  assessmentId: number;
  unitCount: number;
  pendingCount: number;
  totalAmountCents: number;
}

export interface CalendarMyAssessmentEvent {
  type: 'my_assessment_due';
  dueDate: string;
  assessmentTitle: string;
  assessmentId: number;
  amountCents: number;
  status: AssessmentLineItemStatus;
  unitLabel: string;
}

export type CalendarEvent = CalendarMeetingEvent | CalendarAssessmentEvent | CalendarMyAssessmentEvent;

/** Meeting type → semantic color mapping using design token names */
export const MEETING_TYPE_COLORS: Record<MeetingType, { token: string; label: string }> = {
  board: { token: 'info', label: 'Board' },
  annual: { token: 'success', label: 'Annual' },
  special: { token: 'warning', label: 'Special' },
  budget: { token: 'neutral', label: 'Budget' },
  committee: { token: 'info', label: 'Committee' },
};
```

### Track C: Calendar UI Components

#### C1. Build `MonthGrid` component
**Files:** Create `apps/web/src/components/calendar/month-grid.tsx`

A custom month grid built entirely with design system tokens. No external calendar library.

**Visual specification (aligned with design system):**

```
┌─────────────────────────────────────────────────────┐
│  Card (var(--surface-card), border-subtle, radius-md)│
│                                                      │
│  ◄  March 2026  ►          [Today]  [Month ▾]       │
│  ─────────────────────────────────────────────────── │
│  Sun   Mon   Tue   Wed   Thu   Fri   Sat             │
│  ─────────────────────────────────────────────────── │
│  │  1  │  2  │  3  │  4  │  5  │  6  │  7  │        │
│  │     │     │ ●●  │     │     │  ●  │     │        │
│  ├─────┼─────┼─────┼─────┼─────┼─────┼─────┤        │
│  │  8  │  9  │ 10  │ 11  │ 12  │ 13  │ 14  │        │
│  │     │     │     │     │  ●  │     │     │        │
│  ...                                                 │
│                                                      │
│  Legend: ● Meeting  ● Assessment Due                 │
└─────────────────────────────────────────────────────┘
```

**Design token usage:**
- Container: `Card` component from `@propertypro/ui`
- Grid: 7-column CSS grid with `border-[var(--border-subtle)]` dividers
- Day cells: `min-h-[100px]` on desktop, `min-h-[48px]` on mobile
- Today: `ring-2 ring-[var(--interactive-primary)]` on the date number (matches focus ring style)
- Out-of-month days: `text-[var(--text-disabled)]` with `bg-[var(--surface-subtle)]`
- Event dots: `Badge` component from `@propertypro/ui` in status colors
  - Meetings: status badge variant matching meeting type (see `MEETING_TYPE_COLORS`)
  - Assessment due dates: `warning` variant (amber)
- Selected day: `bg-[var(--surface-hover)]` with `border-[var(--interactive-primary)]`
- Month nav: `Button` ghost variant with `ChevronLeft`/`ChevronRight` icons from lucide-react
- "Today" button: `Button` secondary variant
- **Responsive:** On mobile (`<768px`), day cells collapse to show date number + dot count only. Full event labels hidden behind tap-to-expand.

**Interaction:**
- Click a day → sets `selectedDate` state, opens `DayDetailPanel`
- Prev/next month → updates `currentMonth` state, triggers `useCalendarEvents` refetch
- Keyboard: arrow keys to navigate days, Enter to select

**Props interface:**
```typescript
interface MonthGridProps {
  events: CalendarEvent[];
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
  currentMonth: Date;
  onMonthChange: (month: Date) => void;
  isLoading?: boolean;
}
```

#### C2. Build `DayDetailPanel` component
**Files:** Create `apps/web/src/components/calendar/day-detail-panel.tsx`

Slides open below the grid (or right side on `lg+` breakpoint) when a day is selected.

**Contents:**
- Date heading: `heading.md` (18px/600)
- Event cards: `Card.Section` pattern per event
  - Meeting event card: type badge, title (`heading.sm`), time range (formatted in community timezone via `date-fns`), location, document count with link to detail
  - Assessment event card (admin): assessment title, unit count, pending count, total amount formatted as currency
  - Assessment event card (owner): assessment title, amount, status badge, unit label
- Empty state: dashed border container with "No events on this day" in `text-[var(--text-secondary)]`
- "Create Meeting" button: `Button` primary variant, visible only for admin roles

**Props interface:**
```typescript
interface DayDetailPanelProps {
  date: Date;
  events: CalendarEvent[];
  communityId: number;
  communityTimezone: string;
  canCreateMeeting: boolean;
  onCreateMeeting: () => void;
  onViewMeetingDetail: (meetingId: number) => void;
  onClose: () => void;
}
```

#### C3. Build `MeetingDetailModal` component
**Files:** Create `apps/web/src/components/calendar/meeting-detail-modal.tsx`

Modal that shows full meeting details when clicking a meeting event.

**Design:**
- Uses the existing modal pattern: `fixed inset-0 z-50 bg-black/50 backdrop-blur-sm` backdrop
- Container: `rounded-[var(--radius-lg)]` (16px), `shadow-[var(--elevation-e3)]`, `bg-[var(--surface-card)]`
- Max width: 540px, centered
- Content sections:
  - Header: meeting type badge + title
  - Time: formatted range in community timezone (or "starts_at + 1hr" fallback if `ends_at` is null)
  - Location
  - Compliance deadlines: notice post-by, vote docs deadline, minutes deadline — using the 4-tier status escalation (`calm`/`aware`/`urgent`/`critical` based on distance from today)
  - Attached documents: list with download links
- Footer: Edit / Delete buttons for admin roles

**Data:** Fetched via `useMeeting(communityId, meetingId)` which calls `GET /api/v1/meetings/:id`.

#### C4. Rewrite `MeetingForm` component
**Files:** Replace `apps/web/src/components/meetings/meeting-form.tsx`

Complete rewrite using design system tokens and TanStack Query mutations.

**Form fields:**
- Title: text input, `var(--input-height-md)`, `rounded-[var(--radius-sm)]`
- Meeting type: select dropdown with the 5 types
- Start date/time: `<input type="datetime-local">` — browsers handle the picker natively. Value stored as ISO string, converted to UTC on submit using community timezone offset.
- End date/time: `<input type="datetime-local">` — optional, defaults to start + 1hr in the UI
- Location: text input

**Behavior:**
- Create mode: calls `useCreateMeeting` mutation
- Edit mode: pre-fills from meeting data, calls `useUpdateMeeting` mutation
- On success: invalidates query cache, closes modal, shows success toast
- On error: inline error message below the form

**Validation (client-side):**
- Title required, max 200 chars
- Start date required, must be in the future for new meetings
- End date must be after start date (when provided)
- Location required

#### C5. Delete `MeetingList` component
**Files:** Delete `apps/web/src/components/meetings/meeting-list.tsx`

The calendar view replaces the list view. No standalone meeting list is needed. If a list view is desired later, it can be a tab on the meetings page that reuses the same `useMeetings` hook.

### Track D: Meetings Page

#### D1. Create meetings page
**Files:** Create `apps/web/src/app/(authenticated)/communities/[id]/meetings/page.tsx`

**Architecture:** Server component validates auth and resolves community, then renders a client component shell (pattern B — needed for interactive calendar with client-side date navigation).

```
// Server component (page.tsx)
1. requireAuthenticatedUserId()
2. requireCommunityMembership()
3. requirePermission(membership, 'meetings', 'read')
4. Resolve community timezone
5. Render <MeetingsPageShell communityId={...} timezone={...} canWrite={...} />
```

```
// Client component (MeetingsPageShell)
1. State: currentMonth, selectedDate, showCreateModal
2. useCalendarEvents(communityId, monthStart, monthEnd)
3. Render:
   ├── Page header: "Meetings & Calendar" + "Create Meeting" button (if canWrite)
   ├── MonthGrid (events, selection handlers)
   ├── DayDetailPanel (when selectedDate is set)
   ├── MeetingDetailModal (when a meeting is clicked)
   ├── MeetingForm modal (when creating/editing)
   └── "Subscribe to Calendar" link (ICS URL with copy button)
```

**ICS subscribe section:**
- Below the calendar grid
- Shows copyable URL: `https://[subdomain].propertyprofl.com/api/v1/calendar/meetings.ics`
- Helper text: "Add this URL to Apple Calendar, Google Calendar, or Outlook to stay synced."
- Uses `Button` secondary variant with a copy icon

### Track E: ICS Feed Enhancements

#### E1. Update ICS builder for `ends_at`
**Files:** `apps/web/src/lib/calendar/ics.ts`

- Update `IcsMeetingInput` to include `endsAt?: Date`
- Use `endsAt` when present, fall back to `startsAt + 1hr` when null
- No change to the public API of `buildMeetingsIcs`

```typescript
export interface IcsMeetingInput {
  id: number;
  title: string;
  meetingType: string;
  startsAt: Date;
  endsAt?: Date; // NEW: optional, falls back to startsAt + 1hr
  location: string;
}
```

#### E2. Add assessment events to ICS feeds
**Files:** `apps/web/src/lib/calendar/ics.ts`, `apps/web/src/lib/services/calendar-sync-service.ts`

**New ICS input type:**
```typescript
export interface IcsAssessmentInput {
  assessmentId: number;
  dueDate: string; // YYYY-MM-DD
  title: string;
}
```

**New builder function:** `buildCalendarIcs(meetings, assessments, options?)` — replaces `buildMeetingsIcs` as the primary entry point. Assessment events use `VALUE=DATE` (all-day events per RFC 5545):

```ics
BEGIN:VEVENT
UID:assessment-{assessmentId}-{dueDate}@propertyprofl.com
DTSTAMP:20260318T120000Z
DTSTART;VALUE=DATE:20260401
SUMMARY:Q1 Assessment Due
DESCRIPTION:Quarterly assessment due date
END:VEVENT
```

**Public feed** (`meetings.ics`):
- Aggregate `assessment_line_items` by `(due_date, assessment_id)` — one event per unique combination
- Join to `assessments` table for the title
- Filter: only `status IN ('pending', 'overdue')` items (exclude paid/waived from the count)
- No PII: no per-unit amounts, no owner names

**My-meetings feed** (`my-meetings.ics`):
- Meetings: same as today (all community meetings)
- Assessment events: apply §2.1 visibility model:
  - Admin roles → same aggregation as public feed
  - Owner residents → filter to their unit(s) via `listActorUnitIds()`, include amount in description
  - Tenant residents → no assessment events

#### E3. Update calendar-sync-service
**Files:** `apps/web/src/lib/services/calendar-sync-service.ts`

- Add `listCommunityAssessmentDueDates(communityId, options?)` query function
- Update `generateCommunityMeetingsIcs` → `generateCommunityCalendarIcs` to include assessment events
- Update `generateMyMeetingsIcs` → `generateMyCalendarIcs` with role-aware assessment visibility
- Both functions now call the new `buildCalendarIcs` builder

---

## 5. File Summary

| Action | Path | Track |
|--------|------|-------|
| **Create** | `packages/db/migrations/0103_add_meetings_ends_at.sql` | Schema |
| **Modify** | `packages/db/src/schema/meetings.ts` — add `endsAt` column | Schema |
| **Modify** | `apps/web/src/app/api/v1/meetings/route.ts` — remove apartment block, add `?start=&end=` | A1, A3 |
| **Create** | `apps/web/src/app/api/v1/meetings/[id]/route.ts` | A2 |
| **Create** | `apps/web/src/app/api/v1/calendar/events/route.ts` | A4 |
| **Create** | `apps/web/src/hooks/use-meetings.ts` | B1 |
| **Create** | `apps/web/src/lib/calendar/event-types.ts` | B2 |
| **Create** | `apps/web/src/components/calendar/month-grid.tsx` | C1 |
| **Create** | `apps/web/src/components/calendar/day-detail-panel.tsx` | C2 |
| **Create** | `apps/web/src/components/calendar/meeting-detail-modal.tsx` | C3 |
| **Rewrite** | `apps/web/src/components/meetings/meeting-form.tsx` | C4 |
| **Delete** | `apps/web/src/components/meetings/meeting-list.tsx` | C5 |
| **Create** | `apps/web/src/app/(authenticated)/communities/[id]/meetings/page.tsx` | D1 |
| **Modify** | `apps/web/src/lib/calendar/ics.ts` — add `endsAt`, assessment events, `buildCalendarIcs` | E1, E2 |
| **Modify** | `apps/web/src/lib/services/calendar-sync-service.ts` — assessment queries, renamed generators | E3 |
| **Defer** | `apps/web/src/lib/calendar/google-calendar-adapter.ts` — remains mock (Phase 3) | — |

**Total: 8 new files, 4 modified files, 1 deleted file, 1 migration.**

---

## 6. Dependency Graph

```
Schema Migration (0103)
  │
  ├── Track A (API) ──────────────────────────────────────────┐
  │   A1: Remove apartment block                              │
  │   A2: GET /meetings/:id ──────────────────────────┐       │
  │   A3: Extend GET /meetings with ?start=&end= ─────┤       │
  │   A4: GET /calendar/events ────────────────────────┤       │
  │                                                    │       │
  ├── Track B (Client infra, parallel with A) ─────────┤       │
  │   B1: TanStack Query hooks ────────────────────────┤       │
  │   B2: Event type definitions ──────────────────────┘       │
  │                                                            │
  ├── Track C (UI components, after A+B) ──────────────────────┤
  │   C1: MonthGrid                                            │
  │   C2: DayDetailPanel                                       │
  │   C3: MeetingDetailModal                                   │
  │   C4: Rewrite MeetingForm                                  │
  │   C5: Delete MeetingList                                   │
  │                                                            │
  ├── Track D (Page, after C) ─────────────────────────────────┤
  │   D1: Meetings page (wires everything together)            │
  │                                                            │
  └── Track E (ICS feeds, independent of C/D) ─────────────────┘
      E1: Update ICS builder for ends_at
      E2: Add assessment events to ICS
      E3: Update calendar-sync-service
```

**Parallelization:**
- Tracks A and B can proceed simultaneously
- Track C begins once A+B are complete (needs hooks + API)
- Track D begins once C is complete (needs components)
- Track E is independent — can run in parallel with C/D after the migration

---

## 7. Design System Compliance

All new UI must use semantic tokens from `packages/ui/src/styles/tokens.css`. Never use Tailwind's literal color classes (`bg-white`, `text-gray-900`) — always bracket notation (`bg-[var(--surface-card)]`, `text-[var(--text-primary)]`).

### Token Reference for Calendar Components

| Element | Token(s) |
|---------|----------|
| Calendar container | `Card` component, `var(--surface-card)`, `var(--border-subtle)`, `var(--radius-md)` |
| Day cell border | `var(--border-subtle)` |
| Day cell hover | `var(--surface-hover)` |
| Today indicator | `ring-2 ring-[var(--interactive-primary)]` |
| Selected day | `bg-[var(--surface-hover)]`, `border-[var(--interactive-primary)]` |
| Out-of-month days | `text-[var(--text-disabled)]`, `bg-[var(--surface-subtle)]` |
| Meeting badge | `Badge` component, variant per `MEETING_TYPE_COLORS` |
| Assessment badge | `Badge` component, `warning` variant |
| Month nav buttons | `Button` ghost variant |
| Create meeting button | `Button` primary variant |
| Detail panel | `Card` component |
| Modal backdrop | `bg-black/50 backdrop-blur-sm` |
| Modal container | `var(--radius-lg)`, `var(--elevation-e3)`, `var(--surface-card)` |
| Form inputs | `var(--input-height-md)` (40px), `var(--radius-sm)` (6px) |
| Focus rings | `outline: 2px solid var(--focus-ring-color)` with 2px offset |
| Transitions | `transition-colors duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]` |
| Empty state | `border-dashed border-[var(--border-default)]`, `text-[var(--text-secondary)]` |

### Compliance Deadline Status Escalation

Deadlines in the meeting detail modal use the 4-tier system:

| Tier | Condition | Visual |
|------|-----------|--------|
| `calm` | >30 days away | `neutral` badge |
| `aware` | 8–30 days away | `warning` badge (amber) |
| `urgent` | 1–7 days away | `warning` badge with stronger prominence |
| `critical` | Overdue | `danger` badge (red), icon + label always |

### Responsive Behavior

| Breakpoint | Calendar behavior |
|------------|-------------------|
| `<768px` (mobile) | Day cells show date + dot count only. Tap to expand. Detail panel below grid. Touch targets ≥48px. |
| `768px–1023px` (tablet) | Full day cells with truncated event labels. Detail panel below grid. |
| `≥1024px` (desktop) | Full day cells with event labels. Detail panel as right sidebar (optional, can stay below). |

---

## 8. Security & Validation

| Concern | Mitigation |
|---------|------------|
| Date range abuse | Zod validation: `start`/`end` must be valid ISO dates, `start ≤ end`, range ≤ 366 days |
| Cross-tenant data | All queries through `createScopedClient(communityId)` — tenant isolation enforced at query layer |
| Assessment PII in public ICS | Public feed shows only aggregate event title ("Q1 Assessment Due"), no per-unit amounts or owner names |
| Meeting detail unauthorized access | `GET /meetings/:id` requires `requireCommunityMembership` + `requirePermission(meetings, read)` |
| Calendar events endpoint | Requires both `meetings` read permission (for meetings) and gracefully degrades when `finances` read is absent (omits assessments) |
| ICS injection | All text values run through existing `escapeIcsText()` (handles `\`, newlines, commas, semicolons) |
| CSRF on mutations | Existing pattern: mutations are POST with session cookie + community membership validation |

---

## 9. Testing Plan

### Unit Tests

| Test | File |
|------|------|
| `buildCalendarIcs` produces valid ICS with meetings + assessments | `apps/web/src/lib/calendar/__tests__/ics.test.ts` |
| Assessment all-day events use `VALUE=DATE` format | same |
| `ends_at` fallback (null → startsAt + 1hr) | same |
| `MEETING_TYPE_COLORS` maps all meeting types | `apps/web/src/lib/calendar/__tests__/event-types.test.ts` |
| Date range validation rejects invalid inputs | `apps/web/src/app/api/v1/meetings/__tests__/route.test.ts` |

### Integration Tests

| Test | Scenario |
|------|----------|
| `GET /api/v1/meetings?start=&end=` | Returns meetings within range; excludes out-of-range |
| `GET /api/v1/meetings/:id` | Returns meeting with documents; 404 for wrong community |
| `GET /api/v1/calendar/events` | Admin sees aggregate assessments; owner sees unit-specific; tenant sees none |
| `GET /api/v1/calendar/meetings.ics` | Includes assessment all-day events; no PII |
| `GET /api/v1/calendar/my-meetings.ics` | Owner sees their unit's assessments; admin sees aggregates |
| Apartment community | Can create meetings (no 403); calendar events include both meetings and assessments |

### Manual Testing

| Scenario | Steps |
|----------|-------|
| Calendar month navigation | Navigate forward/back; verify events load per month |
| Day selection | Click a day with multiple events; verify detail panel renders all |
| Meeting CRUD | Create, edit, delete a meeting; verify calendar updates |
| ICS subscription | Copy URL, add to Apple Calendar / Google Calendar; verify events appear |
| Mobile responsiveness | Resize to mobile; verify dot-only cells, tap-to-expand |
| Cross-tenant isolation | Log in as different communities; verify no data leakage |

---

## 10. Ship Gate

All items must pass before merging:

- [ ] Migration `0103` applied successfully
- [ ] `GET /api/v1/meetings` accepts `?start=&end=` with Zod validation
- [ ] `GET /api/v1/meetings/:id` returns meeting + attached documents
- [ ] `GET /api/v1/calendar/events` returns merged meetings + assessment due dates
- [ ] Assessment visibility: admin=aggregate, owner=unit-specific, tenant=none
- [ ] Apartment communities can create/read meetings (no 403)
- [ ] MonthGrid renders with correct design tokens (no literal Tailwind colors)
- [ ] Day click opens detail panel with meeting and assessment cards
- [ ] Meeting detail modal shows compliance deadlines with 4-tier status escalation
- [ ] MeetingForm creates/edits meetings with proper date/time handling
- [ ] ICS public feed includes assessment all-day events (no PII)
- [ ] ICS my-meetings feed applies role-based assessment visibility
- [ ] ICS `DTEND` uses `ends_at` when present, falls back to +1hr
- [ ] Calendar renders correctly at mobile, tablet, desktop breakpoints
- [ ] "Subscribe to Calendar" with copyable ICS URL visible on page
- [ ] All unit tests pass
- [ ] Integration tests pass for date range, detail, calendar events, ICS feeds
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes (including `guard:db-access`)
- [ ] Dashboard meetings widget still works (backward compatible)

---

## 11. Out of Scope (Deferred)

| Item | Deferred to | Reason |
|------|-------------|--------|
| Google Calendar OAuth (real adapter) | Phase 3 | Requires `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, OAuth consent screen, external dependency |
| Week/day calendar views | Phase 3+ | Month view sufficient for meetings and assessment due dates; hour-level granularity not needed yet |
| Two-way calendar sync | Phase 3+ | One-way (PropertyPro → external) is the core use case |
| Meeting recurrence rules | Phase 3+ | Each meeting is currently a standalone row; no RRULE support |
| Assessment payment links in calendar | Phase 3+ | Calendar shows due dates; payment flow is a separate feature |
