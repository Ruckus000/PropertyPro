# Plan: 16 Targeted Edits to Phase 2A Calendar Implementation Plan

**Target file:** `docs/10-PHASE-2A-CALENDAR-IMPLEMENTATION-PLAN.md`  
**Goal:** Apply 16 audit remediation edits grouped by document section to minimize passes.

---

## Edit Strategy

Edits are grouped by the section they modify. Within each section group, the edits are listed in document-order (by line number). Each edit specifies:
- The **finding number** it addresses
- The **exact text anchor** (line numbers and surrounding content) to locate the edit point
- The **operation** (insert, replace, append)
- The **replacement/insertion text**

---

## Group 1: Section 2.1 (Lines 52-66)

### Edit 1A (Finding 7 — listActorUnitIds signature mismatch)
**Location:** Line 59, the Owner resident row in the 2.1 table  
**Current:** `Use \`listActorUnitIds()\` to resolve unit(s)`  
**Replace with:** `Use \`listActorUnitIds(scopedClient, actorUserId)\` to resolve unit(s)`  
**Rationale:** The function in `apps/web/src/lib/units/actor-units.ts` takes `(scopedClient: ScopedClient, actorUserId: string)`.

---

## Group 2: Section 3.1 (Lines 69-93)

### Edit 2A (Finding 15 — endsAt nullable exception)
**Location:** Lines 88-89, the Drizzle schema snippet comment  
**Replace:**
```typescript
/** Optional end datetime. Consumers fall back to startsAt + 1hr when null. */
endsAt: timestamp('ends_at', { withTimezone: true }),
```
**With:**
```typescript
/**
 * Optional end datetime. Consumers fall back to startsAt + 1hr when null.
 * NOTE: Intentionally nullable — unlike other timestamps in the schema which use
 * .notNull().defaultNow(), this column has no sensible default value.
 */
endsAt: timestamp('ends_at', { withTimezone: true }),
```

### Edit 2B (Finding 5 — migration journal drift)
**Location:** After line 92 (after the "Column is nullable" paragraph), before the `---`  
**Insert:**
```markdown
**Migration journal verification:** After applying via `pnpm --filter @propertypro/db db:migrate`, verify that `packages/db/migrations/meta/_journal.json` contains an entry for `0103_add_meetings_ends_at`. If the journal index drifts (see MEMORY.md note on migration journal drift), manually add the entry. Checked in Section 10 Ship Gate.
```

---

## Group 3: Section A1 (Lines 102-109)

### Edit 3A (Finding 1 — RBAC matrix blocks apartments — CRITICAL)
**Location:** Lines 103-109, replace the entire A1 task body  
**Replace with:**
```markdown
**Files:** `apps/web/src/app/api/v1/meetings/route.ts`, `packages/shared/src/rbac-matrix.ts`

- Delete the `requireMeetingsEnabled` function and its invocation in the meetings route
- All community types already have `hasMeetings: true` in the feature matrix
- The ICS endpoints already have their own `requireCalendarSyncEnabled` gate

**RBAC matrix updates** (`packages/shared/src/rbac-matrix.ts`):

The apartment section of `BASE_RBAC_MATRIX` currently has `meetings: { read: false, write: false }` for all apartment roles. Update:

| Apartment Role | `meetings` | `calendar_sync` | Rationale |
|---|---|---|---|
| `tenant` | `{ read: true, write: false }` | `{ read: true, write: false }` | Tenants can view meetings and subscribe to calendar |
| `site_manager` | `{ read: true, write: true }` | _(already true/true)_ | Site managers can create/manage meetings |
| `property_manager_admin` | `{ read: true, write: true }` | _(already true/true)_ | PM admins can create/manage meetings |

Leave `owner`, `board_member`, `board_president`, `cam` at `{ read: false, write: false }` — not valid apartment roles per ADR-001.

**RBAC parity test:** Add test cases verifying `apartment.tenant` has `meetings.read = true` and `apartment.site_manager` has `meetings.write = true`.

**Verification:** Apartments can create/read meetings via API. RBAC matrix permits tenant read, site_manager/pm_admin read+write.
```

---

## Group 4: Section A2 (Lines 111-144)

### Edit 4A (Finding 9 — detail endpoint response shape)
**Location:** Line 115  
**Current:** `(with document title, category, file size)`  
**Replace:** `(with document title, categoryId, file size)`

**Location:** Lines 137-141, the documents array  
**Replace:**
```typescript
    documents: Array<{
      id: number;
      title: string;
      category: string;
      attachedAt: string;
    }>;
```
**With:**
```typescript
    documents: Array<{
      id: number;
      title: string;
      categoryId: number | null;
      fileSize: number;
      attachedAt: string;
    }>;
```

---

## Group 5: Section A3 (Lines 146-153)

### Edit 5A (Finding 10 — endsAt not validated server-side)
**Location:** After line 153, before the A4 heading  
**Insert:**
```markdown
**Schema update for `endsAt`:** Zod validation schemas for meeting create/update must include:
\`\`\`typescript
endsAt: z.string().datetime().optional().refine(
  (val, ctx) => {
    if (!val) return true;
    const startsAt = ctx.parent?.startsAt;
    return !startsAt || new Date(val) > new Date(startsAt);
  },
  { message: 'End time must be after start time' }
),
\`\`\`
Applies to both `POST /api/v1/meetings` and future `PATCH /api/v1/meetings/:id`.
```

---

## Group 6: Section A4 (Lines 155-183)

### Edit 6A (Finding 4 — finances permission throws instead of degrading)
**Location:** Lines 176-181, replace the "Visibility logic" block  
**Replace with:**
```markdown
**Visibility logic:**
- Meetings: returned for all roles with `meetings` read permission (enforced via `requirePermission`)
- Assessment events: **use `checkPermissionV2()` (returns boolean)** — not `requirePermission()` (which throws):
  \`\`\`typescript
  const canReadFinances = checkPermissionV2(
    membership.role, membership.communityType, 'finances', 'read',
    { isUnitOwner: membership.isUnitOwner, permissions: membership.permissions }
  );
  if (canReadFinances) {
    // Role-branching per Section 2.1:
    //   Admin -> type: 'assessment_due' with aggregate counts
    //   Owner -> type: 'my_assessment_due' via listActorUnitIds(scopedClient, actorUserId)
    //   Tenant -> no assessment events
  }
  // If !canReadFinances -> assessment events omitted, meetings still returned
  \`\`\`
```

### Edit 6B (Finding 3 — soft-delete filter missing — CRITICAL)
**Location:** After the visibility logic, before "Rationale for separate endpoint"  
**Insert:**
```markdown
**Soft-delete filtering:** All assessment queries MUST include `AND(isNull(assessments.deletedAt), isNull(assessmentLineItems.deletedAt))`. The scoped client does not auto-filter soft-deleted rows.
```

### Edit 6C (Finding 12 — calendar/events namespace)
**Location:** After line 183 (after "Rationale for separate endpoint")  
**Insert:**
```markdown
**Namespace note:** Other `/api/v1/calendar/` routes require `hasCalendarSync` via `requireCalendarSyncEnabled`. This `/calendar/events` endpoint does **not** — it serves the in-app calendar UI (available to all community types), not external calendar subscription. The `/calendar/` prefix is for grouping, not a feature gate.
```

---

## Group 7: Section B2 (Lines 214-259)

### Edit 7A (Finding 2 — type exports will fail DB guard — CRITICAL)
**Location:** Lines 216-258, replace the entire code block  
**Replace with:**
```typescript
import type { MeetingType } from '@/lib/utils/meeting-calculator';

/**
 * Assessment line item status values.
 * Inlined to avoid importing from @propertypro/db/schema which would
 * trip guard:db-access. Source of truth: packages/db/src/schema/assessment-line-items.ts
 */
type AssessmentLineItemStatus = 'pending' | 'paid' | 'overdue' | 'waived';

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

/** Meeting type -> semantic color mapping using design token names */
export const MEETING_TYPE_COLORS: Record<MeetingType, { token: string; label: string }> = {
  board: { token: 'info', label: 'Board' },
  annual: { token: 'success', label: 'Annual' },
  special: { token: 'warning', label: 'Special' },
  budget: { token: 'neutral', label: 'Budget' },
  committee: { token: 'info', label: 'Committee' },
};
```

---

## Group 8: Section C3 (Lines 348-365)

### Edit 8A (Finding 13 — component directory split)
**Location:** Line 349  
**Current:** `Create \`apps/web/src/components/calendar/meeting-detail-modal.tsx\``  
**Replace:** `Create \`apps/web/src/components/meetings/meeting-detail-modal.tsx\``

### Edit 8B (Finding 14 — modal backdrop literal color)
**Location:** After line 354  
**Insert:**
```markdown
> **Design system exception:** `bg-black/50` is a literal color used for modal backdrops across the codebase. Accepted exception — CSS custom properties cannot express alpha-modified colors portably.
```

---

## Group 9: Section C5 (Lines 391-394)

### Edit 9A (Finding 16 — mobile meetings page)
**Location:** After line 394, append to C5  
**Insert:**
```markdown
**Audit note:** `apps/web/src/app/mobile/meetings/page.tsx` exists and renders a mobile meetings view. Not deleted as part of C5 (it serves `/mobile/meetings`). Must be audited post-implementation to verify it still works after MeetingList removal and API changes. Added to Section 10 Ship Gate.
```

---

## Group 10: Section D1 (Lines 397-430)

### Edit 10A (Finding 6 — page auth guard throws 500)
**Location:** Lines 404-409, replace the server component pseudo-code  
**Replace with:**
```
// Server component (page.tsx) — follows compliance page pattern
1. requireAuthenticatedUserId() — redirect to /auth/login on failure
2. requireCommunityMembership(communityId, userId)
3. Permission check (boolean, does NOT throw):
   if (!checkPermission(membership.role, membership.communityType, 'meetings', 'read', {
     isUnitOwner: membership.isUnitOwner, permissions: membership.permissions,
   })) { redirect('/dashboard?reason=insufficient-permissions'); }
   Import: checkPermission from '@propertypro/shared'
4. Resolve community timezone
5. canWrite = checkPermission(..., 'meetings', 'write', { ... })
6. Render <MeetingsPageShell communityId={...} timezone={...} canWrite={canWrite} />
```

---

## Group 11: Section E2 (Lines 453-486)

### Edit 11A (Finding 3 — soft-delete filter — CRITICAL)
**Location:** After line 478 (the status filter bullet)  
**Insert new bullet:**
```markdown
- Soft-delete: `AND(isNull(assessments.deletedAt), isNull(assessmentLineItems.deletedAt))` — exclude soft-deleted records
```

### Edit 11B (Finding 7 — listActorUnitIds signature)
**Location:** Line 485  
**Current:** `via \`listActorUnitIds()\``  
**Replace:** `via \`listActorUnitIds(scopedClient, actorUserId)\``

### Edit 11C (Finding 11 — buildMeetingsIcs import breakage)
**Location:** After line 463 (after "replaces `buildMeetingsIcs` as the primary entry point")  
**Insert:**
```markdown
**Migration note:** `buildMeetingsIcs` is imported by `calendar-sync-service.ts`. Keep it as a thin wrapper delegating to `buildCalendarIcs(meetings, [], options)`. Mark `@deprecated` with pointer to `buildCalendarIcs`.
```

---

## Group 12: Section E3 (Lines 488-495)

### Edit 12A (Finding 3 — soft-delete filter — CRITICAL)
**Location:** Line 491  
**Current:** `Add \`listCommunityAssessmentDueDates(communityId, options?)\` query function`  
**Append:** ` — must include \`AND(isNull(assessments.deletedAt), isNull(assessmentLineItems.deletedAt))\` in WHERE clause`

---

## Group 13: Section 5 — File Summary (Lines 498-519)

### Edit 13A (Finding 1 — add RBAC matrix file)
**Location:** After line 504, insert new row:
```
| **Modify** | `packages/shared/src/rbac-matrix.ts` — update apartment meetings/calendar_sync permissions | A1 |
```

### Edit 13B (Finding 13 — fix meeting-detail-modal path)
**Location:** Line 511  
**Current:** `apps/web/src/components/calendar/meeting-detail-modal.tsx`  
**Replace:** `apps/web/src/components/meetings/meeting-detail-modal.tsx`

### Edit 13C (Update file count)
**Location:** Line 519  
**Current:** `8 new files, 4 modified files`  
**Replace:** `8 new files, 5 modified files`

---

## Group 14: Section 7 — Design System (Lines 562-606)

### Edit 14A (Finding 14 — modal backdrop exception)
**Location:** Line 581  
**Current:** `| Modal backdrop | \`bg-black/50 backdrop-blur-sm\` |`  
**Replace:** `| Modal backdrop | \`bg-black/50 backdrop-blur-sm\` _(accepted exception — CSS vars cannot express alpha colors portably)_ |`

---

## Group 15: Section 9 — Testing Plan (Lines 622-656)

### Edit 15A (Finding 8 — integration test runner)
**Location:** After line 643 (after integration tests table)  
**Insert:**
```markdown
**Running integration tests:** Per CLAUDE.md:
\`\`\`bash
scripts/with-env-local.sh pnpm exec vitest run --config apps/web/vitest.integration.config.ts
\`\`\`
```

---

## Group 16: Section 10 — Ship Gate (Lines 659-683)

### Edit 16A (Finding 5 — migration journal)
After line 663, insert:
```
- [ ] Migration journal contains entry for `0103_add_meetings_ends_at`
```

### Edit 16B (Finding 10 — endsAt validation)
After the migration items, insert:
```
- [ ] `endsAt` Zod validation enforces `endsAt > startsAt` on create and update
```

### Edit 16C (Finding 1 — RBAC gate items)
After line 668, insert:
```
- [ ] RBAC matrix: apartment.tenant has meetings.read=true, apartment.site_manager has meetings.read/write=true
- [ ] RBAC parity tests pass for updated apartment permissions
```

### Edit 16D (Finding 3 — soft-delete gate)
After integration test item, insert:
```
- [ ] Assessment queries in calendar events and ICS feeds include `deletedAt IS NULL` filters
```

### Edit 16E (Finding 8 — integration test command)
**Location:** Line 679  
**Current:** `Integration tests pass for date range, detail, calendar events, ICS feeds`  
**Replace:** `Integration tests pass: \`scripts/with-env-local.sh pnpm exec vitest run --config apps/web/vitest.integration.config.ts\``

### Edit 16F (Finding 16 — mobile meetings)
After line 682, insert:
```
- [ ] Mobile meetings page (`/mobile/meetings`) still functions after MeetingList deletion
```

---

## Group 17: Header — Revision Bump

**Location:** Line 6  
**Current:** `**Revision:** v2 — incorporates senior dev code review, codebase audit, and design system alignment.`  
**Replace:** `**Revision:** v3 — v2 + 16 audit remediation fixes (3 critical, 7 warning, 6 medium).`

---

## Execution Order (bottom-up to preserve line numbers)

1. Group 16 — Section 10 Ship Gate (lines 659-683)
2. Group 15 — Section 9 Testing (line 643)
3. Group 14 — Section 7 Design System (line 581)
4. Group 13 — Section 5 File Summary (lines 498-519)
5. Group 12 — Section E3 (line 491)
6. Group 11 — Section E2 (lines 453-486)
7. Group 10 — Section D1 (lines 404-409)
8. Group 9 — Section C5 (line 394)
9. Group 8 — Section C3 (lines 348-365)
10. Group 7 — Section B2 (lines 216-258)
11. Group 6 — Section A4 (lines 155-183)
12. Group 5 — Section A3 (line 153)
13. Group 4 — Section A2 (lines 111-144)
14. Group 3 — Section A1 (lines 102-109)
15. Group 2 — Section 3.1 (lines 69-93)
16. Group 1 — Section 2.1 (line 59)
17. Group 17 — Header (line 6)

## Post-Edit Verification

- [ ] Section 5 has `packages/shared/src/rbac-matrix.ts` row
- [ ] Section 5 meeting-detail-modal path says `components/meetings/`
- [ ] Section 5 file count says "5 modified"
- [ ] Section 10 has items for: journal, RBAC, soft-delete, endsAt, mobile, integration command
- [ ] All 16 findings addressed
- [ ] No orphaned `requirePermission` in D1, bare `listActorUnitIds()`, or `category: string` in A2
