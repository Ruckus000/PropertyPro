# Visitor System Upgrade — Competitive Parity

**Date:** 2026-03-25
**Status:** Design approved
**Approach:** Evolve existing `visitor_log` table (additive columns, no breaking changes)

## Context & Motivation

PropertyPro's visitor system is a functional v1 — basic CRUD with check-in/check-out, tenant isolation, RBAC, audit logging, and passcode generation. It's essentially a digital logbook.

Platforms like BuildingLink, Condo Control, Envera, and ButterflyMX offer significantly richer visitor management: guest types, QR code passes, recurring/permanent visitors, vehicle tracking, denied-entry lists, notifications, and mobile-friendly experiences.

This upgrade brings PropertyPro to **competitive parity** without hardware integrations (LPR, kiosks, intercoms).

### What's NOT in scope

SMS/email pass delivery, photo capture, ID scanning, LPR integration, kiosk mode, parking management, self-service check-in, visitor analytics/reporting dashboards.

## Architecture Decision

**Approach 1 (chosen): Evolve the existing table** — extend `visitor_log` with new columns, add a `denied_visitors` table. Keeps existing service layer, tests, RBAC, and audit logging intact.

**Rejected alternatives:**
- **Multi-table normalization** (visitor_passes, visitor_profiles, visitor_vehicles) — premature for a web-only platform. The added join complexity isn't justified until hardware integrations are on the roadmap.
- **Event-sourced visitor log** — redundant with existing `compliance_audit_log`. Breaks every pattern in the codebase.

## Data Model

### Extended `visitor_log` — new columns

| Column | Type | Nullable | Default | Purpose |
|---|---|---|---|---|
| `guest_type` | TEXT | NOT NULL | `'one_time'` | `one_time`, `recurring`, `permanent`, `vendor` |
| `valid_from` | TIMESTAMPTZ | NULL | — | Start of validity window |
| `valid_until` | TIMESTAMPTZ | NULL | — | End of validity window. NULL = no expiry (permanent) |
| `recurrence_rule` | TEXT | NULL | — | `weekdays`, `weekends`, `mon_wed_fri`, `tue_thu`, `custom` |
| `expected_duration_minutes` | INTEGER | NULL | — | Required for one_time/recurring. Max 1440 (24h). NULL for permanent. |
| `vehicle_make` | TEXT | NULL | — | e.g. "Toyota" (100 char max) |
| `vehicle_model` | TEXT | NULL | — | e.g. "Camry" (100 char max) |
| `vehicle_color` | TEXT | NULL | — | e.g. "Silver" (50 char max) |
| `vehicle_plate` | TEXT | NULL | — | License plate (20 char max) |
| `revoked_by_user_id` | UUID | NULL | FK(users) | Who manually revoked the pass |
| `revoked_at` | TIMESTAMPTZ | NULL | — | When revocation happened |

**CHECK constraints:**
```sql
CHECK (guest_type IN ('one_time', 'recurring', 'permanent', 'vendor'))
CHECK (recurrence_rule IS NULL OR recurrence_rule IN ('weekdays', 'weekends', 'mon_wed_fri', 'tue_thu', 'custom'))
CHECK (expected_duration_minutes IS NULL OR (expected_duration_minutes >= 15 AND expected_duration_minutes <= 1440))
```

**New indexes:**
```sql
CREATE INDEX idx_visitor_log_guest_type ON visitor_log (community_id, guest_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_visitor_log_auto_checkout ON visitor_log (checked_in_at, expected_duration_minutes) WHERE checked_out_at IS NULL AND deleted_at IS NULL AND expected_duration_minutes IS NOT NULL;
```

**Backward compatibility:** All new columns are nullable or have defaults. Existing rows get `guest_type = 'one_time'`, all other new columns NULL. No data migration needed beyond column addition.

### New `denied_visitors` table

| Column | Type | Nullable | Default | Purpose |
|---|---|---|---|---|
| `id` | BIGSERIAL | NOT NULL | PK | |
| `community_id` | BIGINT | NOT NULL | FK(communities) | Tenant isolation |
| `full_name` | TEXT | NOT NULL | — | Name of denied individual (240 char max) |
| `reason` | TEXT | NOT NULL | — | Why they're denied (500 char max) |
| `denied_by_user_id` | UUID | NOT NULL | FK(users) | Who added the entry |
| `vehicle_plate` | TEXT | NULL | — | Plate to match against (20 char max) |
| `is_active` | BOOLEAN | NOT NULL | `true` | Can be deactivated without deletion |
| `notes` | TEXT | NULL | — | Additional context (2000 char max) |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | |
| `deleted_at` | TIMESTAMPTZ | NULL | — | Soft delete |

**RLS:** Same pattern as `visitor_log` — community-scoped SELECT, privileged INSERT/UPDATE/DELETE. Write-scope trigger for `community_id` enforcement.

**`updated_at` maintenance:** Application-layer update — service functions set `updatedAt: new Date()` on every PATCH mutation, consistent with existing patterns (no DB trigger).

### Community setting

Add `allowResidentVisitorRevoke` to the `communitySettings` JSONB column on the `communities` table (same pattern as `announcementsWriteLevel`). Default `false`. When `true`, residents can revoke passes they created (`host_user_id = their ID`). This is a **per-community runtime setting**, not a compile-time feature flag — it cannot live in `community-features.ts` (which is a static matrix keyed by `CommunityType`).

**Implementation:** Update the `CommunitySettings` TypeScript type in `packages/db/src/schema/communities.ts` to include `allowResidentVisitorRevoke?: boolean`. No migration needed — JSONB column already exists.

### Status derivation (no status column)

Status is computed from timestamps, consistent with the existing pattern:

```typescript
function deriveVisitorStatus(visitor: VisitorLogRow): VisitorStatus {
  if (visitor.revokedAt && !visitor.checkedOutAt) return 'revoked_on_site';
  if (visitor.revokedAt) return 'revoked';
  if (visitor.checkedOutAt) return 'checked_out';
  if (visitor.checkedInAt && visitor.validUntil && new Date(visitor.validUntil) < new Date()) return 'overstayed';
  if (visitor.checkedInAt) return 'checked_in';
  if (visitor.validUntil && new Date(visitor.validUntil) < new Date()) return 'expired';
  return 'expected';
}
```

**`overstayed` status:** A visitor who is checked in but whose `valid_until` has passed. Like `revoked_on_site`, this is an action-required state — staff should check them out. Displayed with `status-warning-bg` + AlertTriangle icon and high-visibility treatment.

### Design decisions (reviewed and hardened)

| Decision | Rationale |
|---|---|
| No `status` column | Avoids dual-source-of-truth with timestamps. Existing pattern works. `package_log` uses a status column because it has a `notified` state that can't be derived from timestamps — visitors don't. |
| No `qr_token` column | `pass_code` already exists and is unique. QR code is a presentation concern — encode `pass_code` client-side. |
| No `auto_checkout_at` column | Computable from `checked_in_at + expected_duration_minutes`. One less column to keep in sync. |
| No `is_expired` column | Derived from `valid_until < NOW()` in queries. No cron needed for expiration. |
| No `visitor_phone`/`visitor_email` | Scoped out (QR-only, no SMS/email delivery). Add when needed — additive migration. |
| No `recurrence_days` INTEGER[] | Codebase uses zero PostgreSQL array columns. `recurrence_rule` text enum covers 95% of schedules. |
| `recurrence_rule: 'custom'` has no structured data | Intentional — `custom` is a free-text indicator. When selected, the `notes` field is used to describe the custom schedule (e.g., "Every other Tuesday"). No day-of-week bitfield or scheduling engine. Staff reads the notes. |
| `expected_duration_minutes` nullable | Meaningless for permanent guests. Required for one_time/recurring via Zod validation, not DB constraint. |
| Denied list is community-scoped | Each community manages its own list. Simpler, respects tenant isolation. PM admin views across communities in PM dashboard. |

## API Surface

### Modified endpoints

#### POST /api/v1/visitors — create visitor pass

Updated request body (new fields are all optional — backward compatible):

```typescript
{
  communityId: number,
  visitorName: string,          // 1-240 chars
  purpose: string,              // 1-240 chars
  hostUnitId: number,
  expectedArrival?: string,     // ISO 8601. Required for one_time. For other types, server defaults to validFrom.
  notes?: string | null,        // 0-2000 chars
  // new fields
  guestType?: 'one_time' | 'recurring' | 'permanent' | 'vendor',
  validFrom?: string | null,
  validUntil?: string | null,
  recurrenceRule?: 'weekdays' | 'weekends' | 'mon_wed_fri' | 'tue_thu' | 'custom' | null,
  expectedDurationMinutes?: number | null,  // 15-1440
  vehicleMake?: string | null,   // 0-100 chars
  vehicleModel?: string | null,  // 0-100 chars
  vehicleColor?: string | null,  // 0-50 chars
  vehiclePlate?: string | null,  // 0-20 chars
}
```

**Zod conditional validation:**
- `one_time` (default): `expectedArrival` and `expectedDurationMinutes` required
- `recurring`: `validFrom`, `validUntil`, `recurrenceRule`, `expectedDurationMinutes` required. `expectedArrival` defaults to `validFrom` server-side if omitted.
- `permanent`: `validFrom` required, `validUntil` must be null, `expectedDurationMinutes` must be null. `expectedArrival` defaults to `validFrom`.
- `vendor`: `validFrom` and `validUntil` required, `expectedDurationMinutes` optional. `expectedArrival` defaults to `validFrom`.
- `validUntil > validFrom` when both present

**Note on `expectedArrival`:** The existing DB column is NOT NULL. For non-one-time guest types where the UI hides this field, the server sets `expectedArrival = validFrom` before insertion. No schema change needed — the column stays NOT NULL.

**Role logic unchanged:** Residents create for own units, staff for any unit.

#### GET /api/v1/visitors — list visitors

New query params (additive):

```
?communityId=X        (existing, required)
&hostUnitId=X         (existing, optional)
&active=true          (existing, optional)
&guestType=recurring  (NEW: filter by type)
&status=expected      (NEW: filter by derived status — translated to timestamp WHERE clauses server-side)
```

Status filter translation in service:
- `expected` → `checked_in_at IS NULL AND revoked_at IS NULL AND (valid_until IS NULL OR valid_until >= NOW())`
- `checked_in` → `checked_in_at IS NOT NULL AND checked_out_at IS NULL AND revoked_at IS NULL`
- `checked_out` → `checked_out_at IS NOT NULL`
- `expired` → `valid_until < NOW() AND checked_in_at IS NULL AND revoked_at IS NULL`
- `revoked` → `revoked_at IS NOT NULL AND checked_out_at IS NOT NULL`
- `revoked_on_site` → `revoked_at IS NOT NULL AND checked_out_at IS NULL`

Name/plate search stays **client-side** in the DataTable (no `?search=` param — no existing route uses substring search).

#### GET /api/v1/visitors/my — my visitors

Add `?filter=active|upcoming|past` param (default: no filter = current behavior for backward compat).

**Current behavior verified:** The existing `/my` endpoint calls `listMyVisitorsForCommunity` with `onlyActive: true`, which filters to `checked_out_at IS NULL`. The default (no `?filter` param) must preserve this exact behavior — returns active visitors only.

Filter values:
- (no param): `checked_out_at IS NULL` (existing behavior, unchanged)
- `active`: checked in, not checked out, not revoked
- `upcoming`: expected, not checked in, not expired/revoked
- `past`: checked out, expired, or revoked

#### PATCH /api/v1/visitors/:id/checkin — unchanged

Response: `{ data: VisitorLogRow }` — no `warnings` field (no precedent in codebase for warnings in responses).

#### PATCH /api/v1/visitors/:id/checkout — unchanged

### New endpoints

#### POST /api/v1/visitors/:id/revoke — revoke a pass

- **Auth:** Staff only by default. Residents can revoke own passes if community setting `allow_resident_visitor_revoke` is `true`.
- **Permission:** `visitors:write`
- **Body:** `{ communityId: number, reason?: string }` — Zod schema uses `reason: z.string().optional()`. Server-side guard: if actor is staff role and `reason` is absent, return `400 Bad Request` ("Reason is required for staff revocations"). Residents self-revoking may omit reason.
- **Effect:** Sets `revoked_at = NOW()`, `revoked_by_user_id = actor`
- **Idempotent:** Already revoked → return existing with `idempotent: true` in audit metadata
- **Audit:** `transition: 'revoke'`

#### GET /api/v1/visitors/denied/match — check against denied list

- **Auth:** Staff only (`requireStaffOperator`)
- **Permission:** `visitors:read`
- **Query:** `?communityId=X&name=X&plate=X`
- **Returns:** `{ data: DeniedMatchResult[] }` — only `id`, `fullName`, `vehiclePlate`, `reason`, `isActive` fields. Excludes `notes`, `deniedByUserId`, and other sensitive fields to limit information exposure.
- **Filter:** Only returns `is_active = true` entries. Inactive denied entries are not surfaced at check-in.
- **Purpose:** Frontend calls before check-in. Staff sees warning if matches found. No auto-revoke.

#### GET /api/v1/visitors/denied — list denied visitors

- **Auth:** Staff only
- **Permission:** `visitors:read`
- **Query:** `?communityId=X&active=true|false`
- **Response:** `{ data: DeniedVisitor[] }`

#### POST /api/v1/visitors/denied — add to denied list

- **Auth:** Staff only
- **Permission:** `visitors:write`
- **Body:** `{ communityId, fullName (1-240), reason (1-500), vehiclePlate? (0-20), notes? (0-2000) }`
- **Audit:** Logs creation

#### PATCH /api/v1/visitors/denied/:id — update denied entry

- **Auth:** Staff only
- **Permission:** `visitors:write`
- **Body:** Partial update of `fullName`, `reason`, `vehiclePlate`, `notes`, `isActive`
- **Audit:** Old/new values

#### DELETE /api/v1/visitors/denied/:id — soft-delete denied entry

- **Auth:** Staff only
- **Permission:** `visitors:write`

#### POST /api/v1/internal/visitor-auto-checkout — cron

- **Auth:** `requireCronSecret(req, process.env.VISITOR_AUTO_CHECKOUT_CRON_SECRET)`
- **Schedule:** Hourly (`0 * * * *`) via Vercel Cron
- **Logic:** Query visitors where `checked_in_at + (expected_duration_minutes * INTERVAL '1 minute') <= NOW()` and `checked_out_at IS NULL AND deleted_at IS NULL AND expected_duration_minutes IS NOT NULL`, batch-update `checked_out_at = NOW()`
- **Uses:** `createUnscopedClient()` via `@propertypro/db/unsafe`
- **Authorization contract:** "Auto-checkout cron requires cross-tenant access to update `checked_out_at` on overdue visitor records across all communities. This is a time-based cleanup operation with no tenant-specific business logic. Write scope is limited to `visitor_log.checked_out_at` column only."
- **Response:** `{ autoCheckedOut: number, errors: string[] }`
- **No audit log** — cron summary is sufficient. Auto-checkout timestamps on exact hour boundaries are self-evident.

### RBAC — no changes

Existing `visitors:read` and `visitors:write` permissions cover all endpoints. Denied-visitor endpoints use the same permission keys. Staff-only enforcement via `requireStaffOperator` where appropriate.

## Frontend & UX

### Staff View (`VisitorStaffView.tsx`)

**Page-level tabs:**
```
[Visitors]  [Denied List]
```

**Visitor tab:**
- Filter tabs unchanged: Today / Expected / Checked In / All
- New guest type dropdown filter alongside tabs
- Updated DataTable columns: Name, Guest Type (badge), Purpose, Host Unit, Expected Arrival, Duration, Vehicle (compact), Status (enhanced badge set), Pass Code, Actions

**Status badges:**

| Status | Label | Color | Icon |
|---|---|---|---|
| `expected` | Expected | `surface-muted` | Clock |
| `checked_in` | Checked In | `status-success-bg` | CheckCircle |
| `checked_out` | Checked Out | `interactive-muted` | LogOut |
| `expired` | Expired | `status-warning-bg` | AlertTriangle |
| `overstayed` | OVERSTAYED | `status-warning-bg` (pulsing border) | AlertTriangle |
| `revoked` | Revoked | `status-danger-bg` | XCircle |
| `revoked_on_site` | REVOKED — ON SITE | `status-danger-bg` (pulsing border) | ShieldAlert |

**Actions per status:**
- `expected` → [Check In] [Revoke]
- `checked_in` → [Check Out] [Revoke]
- `overstayed` → [Check Out] [Revoke]
- `revoked_on_site` → [Check Out]
- All others → no actions

**Denied-entry match at check-in:** When staff clicks [Check In], frontend calls `GET /api/v1/visitors/denied/match`. If matches found, confirmation dialog shown before proceeding. No matches → immediate check-in.

**Denied List tab:** DataTable with columns: Full Name, Reason, Vehicle Plate, Added By, Date Added, Active/Inactive status, Actions (Edit / Deactivate). [Add to Denied List] button opens modal form.

### Resident View (`VisitorResidentView.tsx`)

**View tabs:**
```
[Active]  [Upcoming]  [Past]
```
- Active: checked in, not checked out
- Upcoming: expected, not checked in, not expired/revoked
- Past: checked out, expired, or revoked

**Card enhancements:**
- Guest type badge on each card
- Vehicle info (compact single line) if present
- QR code display — tap/click card to expand and show QR generated from `passCode`
- Share affordance — Web Share API on mobile, copy-to-clipboard on desktop
- [Revoke] button on recurring/permanent cards (if community setting allows)

### Registration Form (`VisitorRegistrationForm.tsx`)

**Guest type selector** (segmented control at top):
```
[One-Time]  [Recurring]  [Vendor]  [Permanent]
```

**Conditional fields by type:**

| Field | One-Time | Recurring | Vendor | Permanent |
|---|---|---|---|---|
| Visitor Name | required | required | required | required |
| Purpose | required | required | required | required |
| Host Unit | required | required | required | required |
| Expected Arrival | required | hidden | hidden | hidden |
| Duration | required (dropdown) | required (dropdown) | optional | hidden |
| Valid From | hidden | required | required | required |
| Valid Until | hidden | required | required | hidden |
| Recurrence Rule | hidden | required | hidden | hidden |
| Vehicle (collapsible) | optional | optional | optional | optional |
| Notes | optional | optional | optional | optional |

**Duration dropdown:** 1h, 2h, 4h, 8h, 12h, 24h, Custom (number input 15-1440 min).

**Vehicle section:** Collapsible accordion, closed by default. Fields: Make, Model, Color, Plate.

### QR Code

**Library:** `qrcode` npm package (MIT, generates SVG). Must be loaded via **dynamic import** (`next/dynamic` or `React.lazy`) to avoid including Node.js-specific code paths in the initial client bundle. Only the browser/SVG output module is needed. Bundle impact should be verified with `pnpm perf:check` after integration.

**Where it appears:**
- Staff view: QR icon in Pass Code column → popover with scannable QR
- Resident view: expanded card shows full QR with Share button

**No scan-to-checkin flow** — QR is a shareable pass for visual/manual verification.

### Responsive design

Existing views made responsive via Tailwind breakpoints. No new `/mobile/` routes.

## Notifications

Using existing `sendNotification()` dual-mode pattern (immediate email or digest queue).

| Event | Recipient | Notes |
|---|---|---|
| Visitor checked in | Host resident | Respects email frequency preference |
| Visitor pass revoked by staff | Host resident | Respects email frequency preference |
| Recurring/permanent pass expiring in 7 days | Host resident | Immediate email (piggybacked on existing compliance-alerts daily cron) |

**Not notified:** Visitor registered (resident already knows), checked out (routine), auto-checkout (cleanup), denied-list changes (staff dashboard only).

## Edge Cases

### EC1: Duration-based auto-checkout
`expected_duration_minutes` + hourly cron. Cron query: `checked_in_at + (expected_duration_minutes * INTERVAL '1 minute') <= NOW() AND checked_out_at IS NULL AND deleted_at IS NULL AND expected_duration_minutes IS NOT NULL`. No cached column.

### EC2: Revocation while visitor is on-site
`revoked_at` set, `checked_out_at` stays NULL. Status = `revoked_on_site`. Staff sees high-visibility badge. Manual checkout clears the alert.

### EC3: Resident moves out with active passes
On resident role removal (DELETE handler in `/api/v1/residents`), cascade: set `revoked_at = NOW()` on active recurring/permanent passes where `host_user_id = removed_user_id`. `revoked_by_user_id` stays NULL — **convention: NULL `revoked_by_user_id` with non-NULL `revoked_at` indicates system-initiated revocation** (documented in schema comment). Added inline in the DELETE handler with coupling comment noting this is the only resident removal code path.

### EC4: Denied visitor matches active pass
No auto-revoke. At check-in time, frontend calls `GET /api/v1/visitors/denied/match`. Staff sees warning dialog listing all active matches (multiple denied entries with the same name are shown individually with their reasons), then decides whether to proceed. Avoids false positives from name collisions.

### EC5: Checked-in visitor whose validity window expires
Status derivation returns `overstayed` (checked in + `valid_until` passed). Staff view shows warning-level badge. [Check Out] action available. Auto-checkout cron handles this naturally since `expected_duration_minutes`-based checkout fires independently of `valid_until`.

### EC6: Staff tries to check in a revoked or expired pass
Check-in service validates that the pass is in `expected` status before proceeding. If `revoked_at IS NOT NULL` or `valid_until < NOW()`, return `400 Bad Request` with message "This pass has been revoked/expired." Staff must register a new pass.

## Environment & Configuration

- New env var: `VISITOR_AUTO_CHECKOUT_CRON_SECRET` (consistent with `ACCOUNT_LIFECYCLE_CRON_SECRET` naming)
- New Vercel cron entry in `apps/web/vercel.json`: `{ "path": "/api/v1/internal/visitor-auto-checkout", "schedule": "0 * * * *" }`
- New npm dependency: `qrcode` (QR code SVG generation, client-side only, dynamically imported)
- Community setting: `allowResidentVisitorRevoke` in `communitySettings` JSONB (not `community-features.ts`)
- Expiry notifications: piggybacked on existing compliance-alerts cron (`/api/v1/internal/compliance-alerts`), no new cron route needed

## Files to Create/Modify

### New files
- `apps/web/src/app/api/v1/visitors/[id]/revoke/route.ts`
- `apps/web/src/app/api/v1/visitors/denied/route.ts` (GET, POST)
- `apps/web/src/app/api/v1/visitors/denied/[id]/route.ts` (PATCH, DELETE)
- `apps/web/src/app/api/v1/visitors/denied/match/route.ts` (GET)
- `apps/web/src/app/api/v1/internal/visitor-auto-checkout/route.ts`
- `packages/db/src/schema/denied-visitors.ts`
- `packages/db/migrations/0116_visitor_system_upgrade.sql`
- `apps/web/src/components/visitors/DeniedVisitorsTab.tsx`
- `apps/web/src/components/visitors/DeniedVisitorForm.tsx`
- `apps/web/src/components/visitors/VisitorQRCode.tsx`
- `apps/web/src/components/visitors/DeniedMatchWarning.tsx`
- `apps/web/src/hooks/use-denied-visitors.ts`

### Modified files
- `packages/db/src/schema/visitor-log.ts` — add new columns
- `packages/db/src/schema/index.ts` — export denied-visitors
- `apps/web/src/lib/services/package-visitor-service.ts` — new service functions (revoke, denied CRUD, match check, auto-checkout, cascade)
- `apps/web/src/hooks/use-visitors.ts` — add guestType/status filters, update types
- `apps/web/src/components/visitors/VisitorStaffView.tsx` — page tabs, guest type filter, enhanced columns, denied-match check-in flow
- `apps/web/src/components/visitors/VisitorResidentView.tsx` — view tabs, QR display, revoke button, share
- `apps/web/src/components/visitors/VisitorRegistrationForm.tsx` — guest type selector, conditional fields, vehicle accordion, duration dropdown
- `apps/web/src/components/visitors/visitor-columns.tsx` — new columns, enhanced status badges, revoke action
- `apps/web/src/app/(authenticated)/dashboard/visitors/page.tsx` — pass community settings for revoke permission
- `apps/web/src/app/api/v1/visitors/route.ts` — add guestType/status query params
- `apps/web/src/app/api/v1/visitors/my/route.ts` — add filter param
- `apps/web/src/app/api/v1/residents/route.ts` — add cascade revocation in DELETE handler
- `apps/web/src/lib/logistics/common.ts` — add denied-visitors permission helpers
- `apps/web/vercel.json` — add auto-checkout cron
- `packages/db/src/schema/communities.ts` — add `allowResidentVisitorRevoke` to `CommunitySettings` type
- `apps/web/src/app/api/v1/internal/compliance-alerts/route.ts` — add visitor expiry notification check
- `packages/db/migrations/meta/_journal.json` — register new migration

### Test files
- `apps/web/__tests__/integration/visitor-upgrade.integration.test.ts` — guest types, revocation, denied list, auto-checkout, cascade on resident removal, check-in of revoked/expired pass rejection
- `apps/web/__tests__/visitors/status-derivation.test.ts` — all 7 status derivation paths including `overstayed`
- `apps/web/__tests__/visitors/denied-match.test.ts` — name/plate matching logic, multiple matches, inactive filtering
