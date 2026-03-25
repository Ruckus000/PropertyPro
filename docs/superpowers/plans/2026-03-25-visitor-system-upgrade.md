# Visitor System Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the visitor management system to competitive parity — guest types, QR passes, vehicle tracking, denied-entry lists, auto-checkout, notifications, and responsive mobile.

**Architecture:** Evolve the existing `visitor_log` table with 11 additive columns, add a new `denied_visitors` table, and extend the service/API/UI layers. No breaking changes — all new fields are optional or have defaults.

**Tech Stack:** Next.js 15 / React 19 / Drizzle ORM / Supabase / TanStack Query / Tailwind + shadcn/ui / `qrcode` npm package

**Spec:** `docs/superpowers/specs/2026-03-25-visitor-system-upgrade-design.md`

---

## File Structure

### New files
| File | Responsibility |
|---|---|
| `packages/db/src/schema/denied-visitors.ts` | Drizzle schema for `denied_visitors` table |
| `packages/db/migrations/0116_visitor_system_upgrade.sql` | Migration: new columns + new table + RLS + indexes |
| `apps/web/src/app/api/v1/visitors/[id]/revoke/route.ts` | POST handler for pass revocation |
| `apps/web/src/app/api/v1/visitors/denied/route.ts` | GET (list) + POST (create) denied entries |
| `apps/web/src/app/api/v1/visitors/denied/[id]/route.ts` | PATCH (update) + DELETE (soft-delete) denied entries |
| `apps/web/src/app/api/v1/visitors/denied/match/route.ts` | GET denied-entry match check for check-in |
| `apps/web/src/app/api/v1/internal/visitor-auto-checkout/route.ts` | Hourly cron for auto-checkout |
| `apps/web/src/hooks/use-denied-visitors.ts` | TanStack Query hooks for denied-entry CRUD |
| `apps/web/src/components/visitors/VisitorQRCode.tsx` | QR code display component (dynamic import) |
| `apps/web/src/components/visitors/DeniedVisitorsTab.tsx` | Denied list DataTable tab |
| `apps/web/src/components/visitors/DeniedVisitorForm.tsx` | Add/edit denied entry modal form |
| `apps/web/src/components/visitors/DeniedMatchWarning.tsx` | Confirmation dialog for denied-match at check-in |
| `apps/web/__tests__/visitors/status-derivation.test.ts` | Unit tests for all 7 status derivation paths |
| `apps/web/__tests__/visitors/denied-match.test.ts` | Unit tests for denied-entry matching |
| `apps/web/__tests__/integration/visitor-upgrade.integration.test.ts` | Integration tests for full upgrade |

### Modified files
| File | What changes |
|---|---|
| `packages/db/src/schema/visitor-log.ts` | Add 11 new columns |
| `packages/db/src/schema/communities.ts` | Add `allowResidentVisitorRevoke` to `CommunitySettings` type |
| `packages/db/src/schema/index.ts` | Export `denied-visitors` schema + new types |
| `packages/db/migrations/meta/_journal.json` | Register migration idx 116 |
| `apps/web/src/lib/services/package-visitor-service.ts` | Add revoke, denied CRUD, match, auto-checkout, cascade services |
| `apps/web/src/hooks/use-visitors.ts` | Add guestType/status filters, update `VisitorListItem` type |
| `apps/web/src/lib/logistics/common.ts` | No changes needed (existing permission helpers cover visitors) |
| `apps/web/src/components/visitors/visitor-columns.tsx` | New columns, enhanced status badges, revoke action |
| `apps/web/src/components/visitors/VisitorStaffView.tsx` | Page tabs, guest type filter, denied-match check-in flow |
| `apps/web/src/components/visitors/VisitorResidentView.tsx` | View tabs, QR display, revoke button, share |
| `apps/web/src/components/visitors/VisitorRegistrationForm.tsx` | Guest type selector, conditional fields, vehicle accordion, duration dropdown |
| `apps/web/src/app/(authenticated)/dashboard/visitors/page.tsx` | Pass community settings for revoke permission |
| `apps/web/src/app/api/v1/visitors/route.ts` | Add guestType/status query params to GET; update POST validation |
| `apps/web/src/app/api/v1/visitors/my/route.ts` | Add `?filter` param |
| `apps/web/src/app/api/v1/visitors/[id]/checkin/route.ts` | No route change needed — revoked/expired rejection is handled in the service layer (Task 2 Step 7) |
| `apps/web/src/app/api/v1/residents/route.ts` | Add cascade revocation in DELETE handler |
| `apps/web/src/app/api/v1/internal/compliance-alerts/route.ts` | Add visitor expiry notification check |
| `apps/web/vercel.json` | Add auto-checkout cron entry |
| `.env.example` | Add `VISITOR_AUTO_CHECKOUT_CRON_SECRET` |
| `package.json` (root or apps/web) | Add `qrcode` dependency |

---

## Task 1: Schema & Migration

**Files:**
- Modify: `packages/db/src/schema/visitor-log.ts`
- Create: `packages/db/src/schema/denied-visitors.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/schema/communities.ts`
- Create: `packages/db/migrations/0116_visitor_system_upgrade.sql`
- Modify: `packages/db/migrations/meta/_journal.json`

- [ ] **Step 1: Add new columns to `visitor-log.ts`**

Add 11 columns after `notes` and before `createdAt`:

```typescript
// packages/db/src/schema/visitor-log.ts
// Add these imports at the top:
import { boolean, integer } from 'drizzle-orm/pg-core';

// Add these columns after `notes` and before `createdAt`:
  guestType: text('guest_type').notNull().default('one_time'),
  validFrom: timestamp('valid_from', { withTimezone: true }),
  validUntil: timestamp('valid_until', { withTimezone: true }),
  recurrenceRule: text('recurrence_rule'),
  expectedDurationMinutes: integer('expected_duration_minutes'),
  vehicleMake: text('vehicle_make'),
  vehicleModel: text('vehicle_model'),
  vehicleColor: text('vehicle_color'),
  vehiclePlate: text('vehicle_plate'),
  revokedByUserId: uuid('revoked_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  // Convention: NULL revokedByUserId with non-NULL revokedAt = system-initiated revocation
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
```

- [ ] **Step 2: Create `denied-visitors.ts` schema**

```typescript
// packages/db/src/schema/denied-visitors.ts
import {
  bigint,
  bigserial,
  boolean,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { users } from './users';

export const deniedVisitors = pgTable('denied_visitors', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  fullName: text('full_name').notNull(),
  reason: text('reason').notNull(),
  deniedByUserId: uuid('denied_by_user_id')
    .references(() => users.id, { onDelete: 'set null' }),
  vehiclePlate: text('vehicle_plate'),
  isActive: boolean('is_active').notNull().default(true),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});
```

- [ ] **Step 3: Update schema index exports**

In `packages/db/src/schema/index.ts`, add:
```typescript
export * from './denied-visitors';
```

And add type exports following the existing pattern:
```typescript
import type { deniedVisitors } from './denied-visitors';
export type DeniedVisitor = typeof deniedVisitors.$inferSelect;
export type NewDeniedVisitor = typeof deniedVisitors.$inferInsert;
```

- [ ] **Step 4: Add `allowResidentVisitorRevoke` to `CommunitySettings` type**

In `packages/db/src/schema/communities.ts`, add to the `.$type<{...}>()` block on `communitySettings`:
```typescript
    allowResidentVisitorRevoke?: boolean;
```

- [ ] **Step 5: Write migration SQL**

Create `packages/db/migrations/0116_visitor_system_upgrade.sql`:

```sql
-- 0116_visitor_system_upgrade.sql
-- Visitor system upgrade: guest types, vehicle tracking, denied-entry list, auto-checkout

-- 1. Add new columns to visitor_log
ALTER TABLE visitor_log ADD COLUMN guest_type TEXT NOT NULL DEFAULT 'one_time';
ALTER TABLE visitor_log ADD COLUMN valid_from TIMESTAMP WITH TIME ZONE;
ALTER TABLE visitor_log ADD COLUMN valid_until TIMESTAMP WITH TIME ZONE;
ALTER TABLE visitor_log ADD COLUMN recurrence_rule TEXT;
ALTER TABLE visitor_log ADD COLUMN expected_duration_minutes INTEGER;
ALTER TABLE visitor_log ADD COLUMN vehicle_make TEXT;
ALTER TABLE visitor_log ADD COLUMN vehicle_model TEXT;
ALTER TABLE visitor_log ADD COLUMN vehicle_color TEXT;
ALTER TABLE visitor_log ADD COLUMN vehicle_plate TEXT;
ALTER TABLE visitor_log ADD COLUMN revoked_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE visitor_log ADD COLUMN revoked_at TIMESTAMP WITH TIME ZONE;

-- 2. CHECK constraints
ALTER TABLE visitor_log ADD CONSTRAINT chk_visitor_guest_type
  CHECK (guest_type IN ('one_time', 'recurring', 'permanent', 'vendor'));
ALTER TABLE visitor_log ADD CONSTRAINT chk_visitor_recurrence_rule
  CHECK (recurrence_rule IS NULL OR recurrence_rule IN ('weekdays', 'weekends', 'mon_wed_fri', 'tue_thu', 'custom'));
ALTER TABLE visitor_log ADD CONSTRAINT chk_visitor_duration
  CHECK (expected_duration_minutes IS NULL OR (expected_duration_minutes >= 15 AND expected_duration_minutes <= 1440));

-- 3. New indexes
CREATE INDEX idx_visitor_log_guest_type ON visitor_log (community_id, guest_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_visitor_log_auto_checkout ON visitor_log (checked_in_at, expected_duration_minutes)
  WHERE checked_out_at IS NULL AND deleted_at IS NULL AND expected_duration_minutes IS NOT NULL;

-- 4. Create denied_visitors table
CREATE TABLE IF NOT EXISTS denied_visitors (
  id BIGSERIAL PRIMARY KEY,
  community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  denied_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  vehicle_plate TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_denied_visitors_community ON denied_visitors (community_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_denied_visitors_active ON denied_visitors (community_id, is_active) WHERE deleted_at IS NULL;

-- 5. RLS for denied_visitors
ALTER TABLE denied_visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE denied_visitors FORCE ROW LEVEL SECURITY;

REVOKE ALL ON denied_visitors FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON denied_visitors TO service_role;
GRANT USAGE, SELECT ON SEQUENCE denied_visitors_id_seq TO service_role;

CREATE POLICY denied_visitors_select ON denied_visitors
  FOR SELECT USING (pp_rls_can_access_community(community_id));

CREATE POLICY denied_visitors_insert ON denied_visitors
  FOR INSERT WITH CHECK (
    pp_rls_can_access_community(community_id)
    AND (pp_rls_is_privileged() OR pp_rls_can_read_audit_log(community_id))
  );

CREATE POLICY denied_visitors_update ON denied_visitors
  FOR UPDATE USING (
    pp_rls_can_access_community(community_id)
    AND (pp_rls_is_privileged() OR pp_rls_can_read_audit_log(community_id))
  ) WITH CHECK (
    pp_rls_can_access_community(community_id)
    AND (pp_rls_is_privileged() OR pp_rls_can_read_audit_log(community_id))
  );

CREATE POLICY denied_visitors_delete ON denied_visitors
  FOR DELETE USING (
    pp_rls_can_access_community(community_id)
    AND (pp_rls_is_privileged() OR pp_rls_can_read_audit_log(community_id))
  );

-- 6. Write-scope trigger
CREATE TRIGGER enforce_denied_visitors_community_scope
  BEFORE INSERT OR UPDATE ON denied_visitors
  FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();
```

- [ ] **Step 6: Register migration in journal**

In `packages/db/migrations/meta/_journal.json`, add after the last entry:
```json
{
  "idx": 116,
  "version": "7",
  "when": 1774560000000,
  "tag": "0116_visitor_system_upgrade",
  "breakpoints": true
}
```

- [ ] **Step 7: Run typecheck to verify schema compiles**

Run: `pnpm typecheck`
Expected: Clean pass (all new columns are optional or have defaults)

- [ ] **Step 8: Run migration**

Run: `pnpm --filter @propertypro/db db:migrate`
Expected: Migration applies successfully

- [ ] **Step 9: Commit**

```bash
git add packages/db/ .env.example
git commit -m "feat(db): add visitor system upgrade schema and migration

Add 11 columns to visitor_log (guest types, vehicle tracking, revocation).
Create denied_visitors table with RLS and write-scope trigger.
Add allowResidentVisitorRevoke to CommunitySettings type.
Migration: 0116_visitor_system_upgrade"
```

---

## Task 2: Service Layer — Visitor Extensions

**Files:**
- Modify: `apps/web/src/lib/services/package-visitor-service.ts`

- [ ] **Step 1: Update `VisitorLogRow` interface**

Add new fields to the existing `VisitorLogRow` interface in `package-visitor-service.ts`:

```typescript
interface VisitorLogRow {
  [key: string]: unknown;
  id: number;
  communityId: number;
  visitorName: string;
  purpose: string;
  hostUnitId: number;
  hostUserId: string | null;
  expectedArrival: Date;
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
  passCode: string;
  staffUserId: string | null;
  notes: string | null;
  // New fields
  guestType: string;
  validFrom: Date | null;
  validUntil: Date | null;
  recurrenceRule: string | null;
  expectedDurationMinutes: number | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleColor: string | null;
  vehiclePlate: string | null;
  revokedByUserId: string | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Step 2: Update `CreateVisitorInput` interface**

```typescript
export interface CreateVisitorInput {
  visitorName: string;
  purpose: string;
  hostUnitId: number;
  expectedArrival?: string;
  notes?: string | null;
  guestType?: 'one_time' | 'recurring' | 'permanent' | 'vendor';
  validFrom?: string | null;
  validUntil?: string | null;
  recurrenceRule?: string | null;
  expectedDurationMinutes?: number | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  vehicleColor?: string | null;
  vehiclePlate?: string | null;
}
```

- [ ] **Step 3: Update `createVisitorForCommunity` to handle new fields**

Update the insert call in `createVisitorForCommunity` to include all new columns. For non-one-time guest types, default `expectedArrival` to `validFrom`:

```typescript
const guestType = input.guestType ?? 'one_time';
const validFrom = input.validFrom ? parseTimestamp(input.validFrom, 'validFrom') : null;
const validUntil = input.validUntil ? parseTimestamp(input.validUntil, 'validUntil') : null;

// expectedArrival defaults to validFrom for non-one-time types
const expectedArrival = input.expectedArrival
  ? parseTimestamp(input.expectedArrival, 'expectedArrival')
  : validFrom;

if (!expectedArrival) {
  throw new BadRequestError('expectedArrival or validFrom is required');
}
```

Then spread the new columns into the insert:
```typescript
guestType,
validFrom,
validUntil,
recurrenceRule: input.recurrenceRule ?? null,
expectedDurationMinutes: input.expectedDurationMinutes ?? null,
vehicleMake: input.vehicleMake ?? null,
vehicleModel: input.vehicleModel ?? null,
vehicleColor: input.vehicleColor ?? null,
vehiclePlate: input.vehiclePlate ?? null,
```

- [ ] **Step 4: Add `deriveVisitorStatus` function**

```typescript
export type VisitorStatus =
  | 'expected'
  | 'checked_in'
  | 'checked_out'
  | 'expired'
  | 'overstayed'
  | 'revoked'
  | 'revoked_on_site';

export function deriveVisitorStatus(visitor: VisitorLogRow): VisitorStatus {
  if (visitor.revokedAt && !visitor.checkedOutAt) return 'revoked_on_site';
  if (visitor.revokedAt) return 'revoked';
  if (visitor.checkedOutAt) return 'checked_out';
  if (visitor.checkedInAt && visitor.validUntil && visitor.validUntil < new Date()) return 'overstayed';
  if (visitor.checkedInAt) return 'checked_in';
  if (visitor.validUntil && visitor.validUntil < new Date()) return 'expired';
  return 'expected';
}
```

- [ ] **Step 5: Add `revokeVisitorForCommunity` service function**

```typescript
export async function revokeVisitorForCommunity(
  communityId: number,
  visitorId: number,
  actorUserId: string,
  reason: string | null,
  requestId: string | null,
): Promise<VisitorLogRow> {
  const scoped = createScopedClient(communityId);
  const [existing] = await scoped
    .select()
    .from(visitorLog)
    .where(and(eq(visitorLog.id, visitorId), isNull(visitorLog.deletedAt)));

  if (!existing) throw new NotFoundError('Visitor pass not found');

  if (existing.revokedAt) {
    await logAuditEvent({
      userId: actorUserId,
      communityId,
      action: 'update',
      resourceType: 'visitor_log',
      resourceId: String(visitorId),
      metadata: { requestId, idempotent: true, transition: 'revoke' },
    });
    return existing as VisitorLogRow;
  }

  const [updated] = await scoped
    .update(visitorLog)
    .set({
      revokedAt: new Date(),
      revokedByUserId: actorUserId,
      updatedAt: new Date(),
    })
    .where(eq(visitorLog.id, visitorId))
    .returning();

  await logAuditEvent({
    userId: actorUserId,
    communityId,
    action: 'update',
    resourceType: 'visitor_log',
    resourceId: String(visitorId),
    oldValues: { revokedAt: null, revokedByUserId: null },
    newValues: { revokedAt: updated.revokedAt, revokedByUserId: updated.revokedByUserId },
    metadata: { requestId, transition: 'revoke', reason },
  });

  return updated as VisitorLogRow;
}
```

- [ ] **Step 6: Add `revokeVisitorPassesForUser` (cascade function)**

```typescript
export async function revokeVisitorPassesForUser(
  communityId: number,
  userId: string,
): Promise<number> {
  const scoped = createScopedClient(communityId);
  const result = await scoped
    .update(visitorLog)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(visitorLog.hostUserId, userId),
        isNull(visitorLog.revokedAt),
        isNull(visitorLog.checkedOutAt),
        isNull(visitorLog.deletedAt),
        inArray(visitorLog.guestType, ['recurring', 'permanent']),
      ),
    )
    .returning();

  return result.length;
}
```

- [ ] **Step 7: Update `checkInVisitorForCommunity` — reject revoked/expired passes**

Add validation at the start of the function, after fetching the existing visitor:

```typescript
// Reject revoked passes
if (existing.revokedAt) {
  throw new BadRequestError('This visitor pass has been revoked');
}
// Reject expired passes
if (existing.validUntil && new Date(existing.validUntil) < new Date()) {
  throw new BadRequestError('This visitor pass has expired');
}
```

- [ ] **Step 8: Update `listVisitorsForCommunity` — add guestType and status filters**

Add to the options interface:
```typescript
interface ListVisitorOptions {
  hostUnitId?: number;
  onlyActive?: boolean;
  allowedUnitIds?: number[];
  hostUserId?: string;
  guestType?: string;
  status?: string;
}
```

Add to the WHERE clause builder based on `guestType` and `status` (see spec for status-to-timestamp translations).

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/services/package-visitor-service.ts
git commit -m "feat(service): add visitor upgrade service functions

Add deriveVisitorStatus, revokeVisitorForCommunity,
revokeVisitorPassesForUser. Update create/list/checkin for
guest types, vehicle tracking, and revoked/expired rejection."
```

---

## Task 3: Service Layer — Denied Visitors

**Files:**
- Modify: `apps/web/src/lib/services/package-visitor-service.ts`

- [ ] **Step 1: Add denied-visitor interfaces**

```typescript
export interface DeniedVisitorRow {
  [key: string]: unknown;
  id: number;
  communityId: number;
  fullName: string;
  reason: string;
  deniedByUserId: string;
  vehiclePlate: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeniedMatchResult {
  id: number;
  fullName: string;
  vehiclePlate: string | null;
  reason: string;
  isActive: boolean;
}

export interface CreateDeniedVisitorInput {
  fullName: string;
  reason: string;
  vehiclePlate?: string | null;
  notes?: string | null;
}

export interface UpdateDeniedVisitorInput {
  fullName?: string;
  reason?: string;
  vehiclePlate?: string | null;
  notes?: string | null;
  isActive?: boolean;
}
```

- [ ] **Step 2: Add `createDeniedVisitor` service**

```typescript
export async function createDeniedVisitor(
  communityId: number,
  actorUserId: string,
  input: CreateDeniedVisitorInput,
  requestId: string | null,
): Promise<DeniedVisitorRow> {
  const scoped = createScopedClient(communityId);
  const [created] = await scoped
    .insert(deniedVisitors)
    .values({
      communityId,
      fullName: input.fullName,
      reason: input.reason,
      deniedByUserId: actorUserId,
      vehiclePlate: input.vehiclePlate ?? null,
      notes: input.notes ?? null,
    })
    .returning();

  await logAuditEvent({
    userId: actorUserId,
    communityId,
    action: 'create',
    resourceType: 'denied_visitors',
    resourceId: String(created.id),
    newValues: created,
    metadata: { requestId },
  });

  return created as DeniedVisitorRow;
}
```

- [ ] **Step 3: Add `listDeniedVisitors` service**

```typescript
export async function listDeniedVisitors(
  communityId: number,
  onlyActive?: boolean,
): Promise<DeniedVisitorRow[]> {
  const scoped = createScopedClient(communityId);
  const conditions = [isNull(deniedVisitors.deletedAt)];
  if (onlyActive !== undefined) {
    conditions.push(eq(deniedVisitors.isActive, onlyActive));
  }
  return scoped
    .select()
    .from(deniedVisitors)
    .where(and(...conditions))
    .orderBy(desc(deniedVisitors.createdAt)) as Promise<DeniedVisitorRow[]>;
}
```

- [ ] **Step 3b: Add `updateDeniedVisitor` service**

```typescript
export async function updateDeniedVisitor(
  communityId: number,
  deniedId: number,
  actorUserId: string,
  input: UpdateDeniedVisitorInput,
  requestId: string | null,
): Promise<DeniedVisitorRow> {
  const scoped = createScopedClient(communityId);
  const [existing] = await scoped
    .select()
    .from(deniedVisitors)
    .where(and(eq(deniedVisitors.id, deniedId), isNull(deniedVisitors.deletedAt)));

  if (!existing) throw new NotFoundError('Denied visitor entry not found');

  const [updated] = await scoped
    .update(deniedVisitors)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(deniedVisitors.id, deniedId))
    .returning();

  await logAuditEvent({
    userId: actorUserId,
    communityId,
    action: 'update',
    resourceType: 'denied_visitors',
    resourceId: String(deniedId),
    oldValues: existing,
    newValues: updated,
    metadata: { requestId },
  });

  return updated as DeniedVisitorRow;
}
```

**Important:** Always set `updatedAt: new Date()` — per spec, `updated_at` maintenance is application-layer.

- [ ] **Step 3c: Add `softDeleteDeniedVisitor` service**

```typescript
export async function softDeleteDeniedVisitor(
  communityId: number,
  deniedId: number,
  actorUserId: string,
  requestId: string | null,
): Promise<void> {
  const scoped = createScopedClient(communityId);
  const [existing] = await scoped
    .select()
    .from(deniedVisitors)
    .where(and(eq(deniedVisitors.id, deniedId), isNull(deniedVisitors.deletedAt)));

  if (!existing) throw new NotFoundError('Denied visitor entry not found');

  await scoped
    .update(deniedVisitors)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(deniedVisitors.id, deniedId));

  await logAuditEvent({
    userId: actorUserId,
    communityId,
    action: 'delete',
    resourceType: 'denied_visitors',
    resourceId: String(deniedId),
    oldValues: existing,
    metadata: { requestId },
  });
}
```

- [ ] **Step 4: Add `matchDeniedVisitors` service**

```typescript
export async function matchDeniedVisitors(
  communityId: number,
  name: string | null,
  plate: string | null,
): Promise<DeniedMatchResult[]> {
  const scoped = createScopedClient(communityId);
  const conditions = [
    eq(deniedVisitors.communityId, communityId),
    eq(deniedVisitors.isActive, true),
    isNull(deniedVisitors.deletedAt),
  ];

  const rows = await scoped
    .select({
      id: deniedVisitors.id,
      fullName: deniedVisitors.fullName,
      vehiclePlate: deniedVisitors.vehiclePlate,
      reason: deniedVisitors.reason,
      isActive: deniedVisitors.isActive,
    })
    .from(deniedVisitors)
    .where(and(...conditions));

  // Filter in application layer for case-insensitive match
  const nameNorm = name?.toLowerCase().trim() ?? null;
  const plateNorm = plate?.toUpperCase().trim() ?? null;

  return rows.filter((row) => {
    if (nameNorm && row.fullName.toLowerCase().trim() === nameNorm) return true;
    if (plateNorm && row.vehiclePlate?.toUpperCase().trim() === plateNorm) return true;
    return false;
  });
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/services/package-visitor-service.ts
git commit -m "feat(service): add denied-visitor CRUD and match services"
```

---

## Task 4: API Routes — Visitor Modifications

**Files:**
- Modify: `apps/web/src/app/api/v1/visitors/route.ts`
- Modify: `apps/web/src/app/api/v1/visitors/my/route.ts`
- Modify: `apps/web/src/app/api/v1/visitors/[id]/checkin/route.ts`
- Create: `apps/web/src/app/api/v1/visitors/[id]/revoke/route.ts`

- [ ] **Step 1: Update POST `/api/v1/visitors` Zod schema**

Add new optional fields to the create schema. Use Zod's `.superRefine()` for conditional validation per guest type.

- [ ] **Step 2: Update GET `/api/v1/visitors` with new query params**

Add `guestType` and `status` param parsing. Pass to `listVisitorsForCommunity` options.

- [ ] **Step 3: Update GET `/api/v1/visitors/my` with `?filter` param**

Parse `filter` query param. Default behavior (no param) preserves existing `onlyActive: true`. Map `active`/`upcoming`/`past` to service options.

- [ ] **Step 4: Create POST `/api/v1/visitors/:id/revoke` route**

```typescript
// apps/web/src/app/api/v1/visitors/[id]/revoke/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ValidationError, ForbiddenError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromBody } from '@/lib/finance/request';
import { parsePositiveInt } from '@/lib/finance/common';
import {
  requireVisitorLoggingEnabled,
  requireVisitorsWritePermission,
  requireStaffOperator,
  isResidentRole,
} from '@/lib/logistics/common';
import { revokeVisitorForCommunity } from '@/lib/services/package-visitor-service';
import { communities, visitorLog, createScopedClient } from '@propertypro/db';
import { and, eq, isNull } from '@propertypro/db/filters';

const revokeSchema = z.object({
  communityId: z.number().int().positive(),
  reason: z.string().optional(),
});

export const POST = withErrorHandler(
  async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const params = await context?.params;
    const visitorId = parsePositiveInt(params?.id ?? '', 'visitor id');
    const actorUserId = await requireAuthenticatedUserId();
    const body: unknown = await req.json();
    const parsed = revokeSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError('Invalid revoke payload', {
        fields: formatZodErrors(parsed.error),
      });
    }

    const communityId = parseCommunityIdFromBody(req, parsed.data.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireVisitorLoggingEnabled(membership);
    requireVisitorsWritePermission(membership);

    // Staff must provide reason; residents may omit
    if (membership.isAdmin) {
      requireStaffOperator(membership);
      if (!parsed.data.reason) {
        throw new ValidationError('Reason is required for staff revocations');
      }
    } else if (isResidentRole(membership.role)) {
      // Check community setting for resident self-revoke
      const scoped = createScopedClient(communityId);
      const [community] = await scoped
        .select({ communitySettings: communities.communitySettings })
        .from(communities)
        .where(eq(communities.id, communityId));

      if (!community?.communitySettings?.allowResidentVisitorRevoke) {
        throw new ForbiddenError('Resident visitor pass revocation is not enabled for this community');
      }

      // Verify the resident owns this pass — fetch visitor to check hostUserId
      const visitorScoped = createScopedClient(communityId);
      const [visitor] = await visitorScoped
        .select({ hostUserId: visitorLog.hostUserId })
        .from(visitorLog)
        .where(and(eq(visitorLog.id, visitorId), isNull(visitorLog.deletedAt)));

      if (!visitor || visitor.hostUserId !== actorUserId) {
        throw new ForbiddenError('You can only revoke passes you registered');
      }
    } else {
      throw new ForbiddenError('Only staff or the registering resident can revoke a pass');
    }

    const requestId = req.headers.get('x-request-id');
    const data = await revokeVisitorForCommunity(
      communityId,
      visitorId,
      actorUserId,
      parsed.data.reason ?? null,
      requestId,
    );

    return NextResponse.json({ data });
  },
);
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: Clean pass

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/v1/visitors/
git commit -m "feat(api): update visitor routes for guest types, filters, revocation"
```

---

## Task 5: API Routes — Denied Visitors

**Files:**
- Create: `apps/web/src/app/api/v1/visitors/denied/route.ts`
- Create: `apps/web/src/app/api/v1/visitors/denied/[id]/route.ts`
- Create: `apps/web/src/app/api/v1/visitors/denied/match/route.ts`

- [ ] **Step 1: Create GET + POST `/api/v1/visitors/denied/route.ts`**

Follow the checkin route pattern. GET lists denied entries (staff-only, `requireStaffOperator`). POST creates new denied entry (staff-only, Zod validation).

- [ ] **Step 2: Create PATCH + DELETE `/api/v1/visitors/denied/[id]/route.ts`**

PATCH updates denied entry fields. DELETE soft-deletes (sets `deletedAt`). Both staff-only.

- [ ] **Step 3: Create GET `/api/v1/visitors/denied/match/route.ts`**

Staff-only. Parses `?communityId`, `?name`, `?plate` from query string. Calls `matchDeniedVisitors` service. Returns `{ data: DeniedMatchResult[] }` (limited fields only).

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: Clean pass

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/v1/visitors/denied/
git commit -m "feat(api): add denied-visitor CRUD and match endpoints"
```

---

## Task 6: Auto-Checkout Cron & Cascade

**Files:**
- Create: `apps/web/src/app/api/v1/internal/visitor-auto-checkout/route.ts`
- Modify: `apps/web/src/app/api/v1/residents/route.ts`
- Modify: `apps/web/vercel.json`
- Modify: `.env.example`

- [ ] **Step 1: Create auto-checkout cron route**

```typescript
// apps/web/src/app/api/v1/internal/visitor-auto-checkout/route.ts
/**
 * POST /api/v1/internal/visitor-auto-checkout
 *
 * Hourly cron: auto-checkout visitors whose expected duration has elapsed.
 * Authorization contract: cross-tenant access to update checked_out_at on
 * overdue visitor records. Write scope limited to checked_out_at column only.
 *
 * Schedule: 0 * * * * (vercel.json)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { and, isNull, isNotNull, sql } from '@propertypro/db/filters';
import { visitorLog } from '@propertypro/db';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireCronSecret } from '@/lib/api/cron-auth';

export const POST = withErrorHandler(async (req: NextRequest) => {
  requireCronSecret(req, process.env.VISITOR_AUTO_CHECKOUT_CRON_SECRET);

  const db = createUnscopedClient();
  const errors: string[] = [];

  try {
    const overdue = await db
      .update(visitorLog)
      .set({ checkedOutAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          isNotNull(visitorLog.checkedInAt),
          isNull(visitorLog.checkedOutAt),
          isNull(visitorLog.deletedAt),
          isNotNull(visitorLog.expectedDurationMinutes),
          sql`${visitorLog.checkedInAt} + (${visitorLog.expectedDurationMinutes} * INTERVAL '1 minute') <= NOW()`,
        ),
      )
      .returning({ id: visitorLog.id });

    return NextResponse.json({
      data: { autoCheckedOut: overdue.length, errors },
    });
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    return NextResponse.json({
      data: { autoCheckedOut: 0, errors },
    });
  }
});
```

- [ ] **Step 2: Add cascade revocation to residents DELETE handler**

In `apps/web/src/app/api/v1/residents/route.ts`, after the existing `scoped.hardDelete(userRoles, ...)` call, add:

```typescript
// Cascade: revoke active recurring/permanent visitor passes registered by this user.
// Coupling note: this is the only resident removal code path in the codebase.
// If additional removal paths are added, they must also cascade visitor revocations.
const revokedCount = await revokeVisitorPassesForUser(communityId, userId);
if (revokedCount > 0) {
  console.info(`Cascade-revoked ${revokedCount} visitor passes for removed user ${userId}`);
}
```

Import `revokeVisitorPassesForUser` from `@/lib/services/package-visitor-service`.

- [ ] **Step 3: Add cron to vercel.json**

Add to the `crons` array:
```json
{ "path": "/api/v1/internal/visitor-auto-checkout", "schedule": "0 * * * *" }
```

- [ ] **Step 4: Add env var to .env.example**

```
VISITOR_AUTO_CHECKOUT_CRON_SECRET=
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/v1/internal/visitor-auto-checkout/ apps/web/src/app/api/v1/residents/route.ts apps/web/vercel.json .env.example
git commit -m "feat: add visitor auto-checkout cron and resident removal cascade"
```

---

## Task 7: Notifications — Check-in & Expiry

**Files:**
- Modify: `apps/web/src/lib/services/package-visitor-service.ts`
- Modify: `apps/web/src/app/api/v1/internal/compliance-alerts/route.ts`

- [ ] **Step 1: Add notification on visitor check-in**

In `checkInVisitorForCommunity`, after the successful update and audit log, queue a notification to the host resident:

```typescript
// Notify host resident of check-in
if (existing.hostUserId) {
  await queueNotification(communityId, {
    sourceType: 'visitor_log',
    sourceId: String(visitorId),
    eventType: 'visitor_checked_in',
    eventTitle: `${existing.visitorName} has checked in`,
    eventSummary: `Your visitor ${existing.visitorName} was checked in at ${new Date().toLocaleTimeString()}.`,
    actionUrl: `/dashboard/visitors?communityId=${communityId}`,
    recipientFilter: { type: 'specific_user', userId: existing.hostUserId },
  });
}
```

- [ ] **Step 2: Add notification on visitor revocation**

In `revokeVisitorForCommunity`, after audit log, queue a notification to the host resident.

- [ ] **Step 3: Add visitor expiry check to compliance-alerts cron**

In the compliance-alerts route or service, add a check for recurring/permanent passes expiring in 7 days. Query `visitor_log WHERE valid_until BETWEEN NOW() AND NOW() + INTERVAL '7 days' AND revoked_at IS NULL AND deleted_at IS NULL`. Send immediate email to host residents.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/services/ apps/web/src/app/api/v1/internal/compliance-alerts/
git commit -m "feat: add visitor check-in, revocation, and expiry notifications"
```

---

## Task 8: React Hooks

**Files:**
- Modify: `apps/web/src/hooks/use-visitors.ts`
- Create: `apps/web/src/hooks/use-denied-visitors.ts`

- [ ] **Step 1: Update `VisitorListItem` type in `use-visitors.ts`**

Add all new fields: `guestType`, `validFrom`, `validUntil`, `recurrenceRule`, `expectedDurationMinutes`, `vehicleMake`, `vehicleModel`, `vehicleColor`, `vehiclePlate`, `revokedByUserId`, `revokedAt`.

- [ ] **Step 2: Add `useRevokeVisitor` mutation**

```typescript
export function useRevokeVisitor(communityId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ visitorId, reason }: { visitorId: number; reason?: string }) => {
      const res = await fetch(`/api/v1/visitors/${visitorId}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, reason }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: VISITOR_KEYS.all });
    },
  });
}
```

- [ ] **Step 3: Add `guestType` and `status` filter support to `useVisitors`**

Update `VisitorFilters`:
```typescript
export interface VisitorFilters {
  hostUnitId?: number;
  active?: boolean;
  guestType?: string;
  status?: string;
}
```

Update query param building to include new filters in the URL.

- [ ] **Step 4: Add `filter` param support to `useMyVisitors`**

Accept optional `filter?: 'active' | 'upcoming' | 'past'` param. Pass as `?filter=X` query param.

- [ ] **Step 5: Create `use-denied-visitors.ts`**

Follow the same TanStack Query patterns. Create:
- `DENIED_VISITOR_KEYS` query key factory
- `useDeniedVisitors(communityId)` — list query
- `useCreateDeniedVisitor(communityId)` — create mutation
- `useUpdateDeniedVisitor(communityId)` — update mutation
- `useDeleteDeniedVisitor(communityId)` — soft-delete mutation
- `useDeniedMatch(communityId, name, plate)` — match query (enabled only when name or plate provided)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/hooks/
git commit -m "feat(hooks): add visitor upgrade and denied-visitor TanStack Query hooks"
```

---

## Task 9: Unit Tests — Status Derivation & Denied Match

**Files:**
- Create: `apps/web/__tests__/visitors/status-derivation.test.ts`
- Create: `apps/web/__tests__/visitors/denied-match.test.ts`

- [ ] **Step 1: Write status derivation tests**

Test all 7 paths: `expected`, `checked_in`, `checked_out`, `expired`, `overstayed`, `revoked`, `revoked_on_site`. Import `deriveVisitorStatus` from the service.

```typescript
import { describe, expect, it } from 'vitest';
import { deriveVisitorStatus } from '../../src/lib/services/package-visitor-service';

describe('deriveVisitorStatus', () => {
  const base = {
    revokedAt: null,
    revokedByUserId: null,
    checkedInAt: null,
    checkedOutAt: null,
    validUntil: null,
  };

  it('returns expected for a visitor with no timestamps', () => {
    expect(deriveVisitorStatus({ ...base } as any)).toBe('expected');
  });

  it('returns checked_in when checkedInAt is set', () => {
    expect(deriveVisitorStatus({ ...base, checkedInAt: new Date() } as any)).toBe('checked_in');
  });

  it('returns checked_out when checkedOutAt is set', () => {
    expect(deriveVisitorStatus({ ...base, checkedInAt: new Date(), checkedOutAt: new Date() } as any)).toBe('checked_out');
  });

  it('returns expired when validUntil is in the past and not checked in', () => {
    expect(deriveVisitorStatus({ ...base, validUntil: new Date('2020-01-01') } as any)).toBe('expired');
  });

  it('returns overstayed when checked in but validUntil passed', () => {
    expect(deriveVisitorStatus({ ...base, checkedInAt: new Date(), validUntil: new Date('2020-01-01') } as any)).toBe('overstayed');
  });

  it('returns revoked_on_site when revoked but not checked out', () => {
    expect(deriveVisitorStatus({ ...base, checkedInAt: new Date(), revokedAt: new Date() } as any)).toBe('revoked_on_site');
  });

  it('returns revoked when revoked and checked out', () => {
    expect(deriveVisitorStatus({ ...base, checkedInAt: new Date(), checkedOutAt: new Date(), revokedAt: new Date() } as any)).toBe('revoked');
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `pnpm test -- --run apps/web/__tests__/visitors/status-derivation.test.ts`
Expected: All 7 tests pass

- [ ] **Step 3: Write denied-match unit tests**

Test exact name match (case-insensitive), plate match, no match, multiple matches, inactive entries filtered out. This tests the `matchDeniedVisitors` filter logic.

- [ ] **Step 4: Run tests**

Run: `pnpm test -- --run apps/web/__tests__/visitors/denied-match.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/web/__tests__/visitors/
git commit -m "test: add status derivation and denied-match unit tests"
```

---

## Task 10: Frontend — QR Code Component

**Files:**
- Create: `apps/web/src/components/visitors/VisitorQRCode.tsx`

- [ ] **Step 1: Install qrcode package**

Run: `pnpm --filter @propertypro/web add qrcode @types/qrcode`

- [ ] **Step 2: Create VisitorQRCode component**

```typescript
'use client';

import { useEffect, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { QrCode } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VisitorQRCodeProps {
  passCode: string;
  size?: number;
  className?: string;
}

export function VisitorQRCode({ passCode, size = 200, className }: VisitorQRCodeProps) {
  const [svgString, setSvgString] = useState<string | null>(null);

  useEffect(() => {
    // Dynamic import to avoid bundling Node.js code
    import('qrcode').then((QRCode) => {
      QRCode.toString(passCode, { type: 'svg', width: size, margin: 1 }, (err, svg) => {
        if (!err) setSvgString(svg);
      });
    });
  }, [passCode, size]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className={cn('h-8 w-8 p-0', className)}>
          <QrCode className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4">
        {svgString ? (
          <div dangerouslySetInnerHTML={{ __html: svgString }} />
        ) : (
          <div className="h-[200px] w-[200px] animate-pulse rounded bg-muted" />
        )}
        <p className="mt-2 text-center font-mono text-sm text-muted-foreground">{passCode}</p>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 3: Run perf check**

Run: `pnpm perf:check`
Expected: Bundle size within budget (qrcode is dynamically imported)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/visitors/VisitorQRCode.tsx apps/web/package.json pnpm-lock.yaml
git commit -m "feat(ui): add QR code visitor pass component with dynamic import"
```

---

## Task 11: Frontend — Enhanced Visitor Columns & Status Badges

**Files:**
- Modify: `apps/web/src/components/visitors/visitor-columns.tsx`

- [ ] **Step 1: Update `getVisitorStatus` to use `deriveVisitorStatus`**

Replace the inline status derivation with the shared function. Add `overstayed` and `revoked_on_site` badge configs.

- [ ] **Step 2: Add new columns**

Add Guest Type badge column, Duration column, Vehicle compact column. Update Status badge set with all 7 statuses. Add Revoke action button.

- [ ] **Step 3: Add QR code icon to Pass Code column**

Import `VisitorQRCode` component. Render next to the pass code text.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/visitors/visitor-columns.tsx
git commit -m "feat(ui): enhance visitor columns with guest types, vehicle, QR, revoke"
```

---

## Task 12: Frontend — Staff View Upgrade

**Files:**
- Modify: `apps/web/src/components/visitors/VisitorStaffView.tsx`
- Create: `apps/web/src/components/visitors/DeniedVisitorsTab.tsx`
- Create: `apps/web/src/components/visitors/DeniedVisitorForm.tsx`
- Create: `apps/web/src/components/visitors/DeniedMatchWarning.tsx`

- [ ] **Step 1: Add page-level tabs to VisitorStaffView**

Add `[Visitors]` / `[Denied List]` tabs at the page level. Visitors tab contains existing content. Denied List tab renders `DeniedVisitorsTab`.

- [ ] **Step 2: Add guest type dropdown filter**

Add a Select dropdown alongside the existing filter tabs. Filter visitor list by `guestType`.

- [ ] **Step 3: Create DeniedVisitorsTab component**

DataTable with columns: Full Name, Reason, Vehicle Plate, Added By, Date Added, Status (Active/Inactive), Actions. "Add to Denied List" button opens `DeniedVisitorForm` modal.

- [ ] **Step 4: Create DeniedVisitorForm modal**

Form fields: Full Name (required), Reason (required), Vehicle Plate (optional), Notes (optional). Uses `useCreateDeniedVisitor` / `useUpdateDeniedVisitor` mutations.

- [ ] **Step 5: Create DeniedMatchWarning dialog**

Confirmation dialog shown before check-in when `useDeniedMatch` returns results. Shows matched entries with reasons. "Cancel" / "Check In Anyway" buttons.

- [ ] **Step 6: Integrate denied-match into check-in flow**

When staff clicks [Check In], call denied-match query first. If matches, show `DeniedMatchWarning`. On confirm, proceed with check-in mutation.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/visitors/
git commit -m "feat(ui): upgrade staff view with denied list, guest type filter, match warning"
```

---

## Task 13: Frontend — Resident View Upgrade

**Files:**
- Modify: `apps/web/src/components/visitors/VisitorResidentView.tsx`
- Modify: `apps/web/src/app/(authenticated)/dashboard/visitors/page.tsx`

- [ ] **Step 1: Add view tabs to VisitorResidentView**

Add `[Active]` / `[Upcoming]` / `[Past]` tabs. Each tab calls `useMyVisitors` with the corresponding `?filter` param.

- [ ] **Step 2: Enhance visitor cards**

Add guest type badge, vehicle info line, QR code (expanded view), Share button (Web Share API / clipboard).

- [ ] **Step 3: Add Revoke button for recurring/permanent passes**

Conditionally render based on `allowResidentVisitorRevoke` community setting. Only show on passes where `hostUserId === current user`.

- [ ] **Step 4: Pass community settings from page component**

In `dashboard/visitors/page.tsx`, fetch community settings and pass `allowResidentVisitorRevoke` as a prop to `VisitorResidentView`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/visitors/VisitorResidentView.tsx apps/web/src/app/\(authenticated\)/dashboard/visitors/page.tsx
git commit -m "feat(ui): upgrade resident view with tabs, QR codes, share, self-revoke"
```

---

## Task 14: Frontend — Registration Form Upgrade

**Files:**
- Modify: `apps/web/src/components/visitors/VisitorRegistrationForm.tsx`

- [ ] **Step 1: Add guest type segmented control**

Four options: One-Time (default), Recurring, Vendor, Permanent. State drives conditional field visibility.

- [ ] **Step 2: Add conditional fields per guest type**

Show/hide fields based on selected guest type (per spec table). Add duration dropdown, valid from/until date pickers, recurrence rule dropdown.

- [ ] **Step 3: Add vehicle information accordion**

Collapsible section with Make, Model, Color, Plate fields. Closed by default.

- [ ] **Step 4: Update form submission**

Include all new fields in the `useCreateVisitor` mutation payload.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/visitors/VisitorRegistrationForm.tsx
git commit -m "feat(ui): upgrade registration form with guest types, duration, vehicle"
```

---

## Task 15: Integration Tests

**Files:**
- Create: `apps/web/__tests__/integration/visitor-upgrade.integration.test.ts`

- [ ] **Step 1: Write guest type creation tests**

Test creating one_time, recurring, permanent, and vendor visitors. Verify new fields are stored and returned correctly.

- [ ] **Step 2: Write revocation tests**

Test staff revocation (reason required), resident self-revocation (with setting enabled/disabled), idempotent revocation. Test check-in rejection of revoked pass.

- [ ] **Step 3: Write denied-entry CRUD tests**

Test create, list, update, deactivate, soft-delete. Test match endpoint returns only active entries with limited fields.

- [ ] **Step 4: Write auto-checkout test**

Create a visitor with short duration, simulate check-in, verify the cron query identifies them for auto-checkout.

- [ ] **Step 5: Write cascade revocation test**

Create a resident with recurring passes, remove their role via DELETE, verify passes are auto-revoked with NULL `revokedByUserId`.

- [ ] **Step 6: Write expired/revoked check-in rejection test**

Attempt to check in a visitor with expired `valid_until`. Expect 400. Attempt to check in a revoked visitor. Expect 400.

- [ ] **Step 6b: Write overstayed status integration test (EC5)**

Create a recurring visitor with `valid_until` set to a past date. Check them in. Verify the API returns the visitor and `deriveVisitorStatus` returns `overstayed`. Verify [Check Out] action is available.

- [ ] **Step 6c: Write GET /api/v1/visitors/my backward compatibility regression test**

Call `GET /api/v1/visitors/my?communityId=X` with NO `?filter` param. Verify it returns ONLY visitors with `checked_out_at IS NULL` — matching the existing behavior exactly. Then create a checked-out visitor and confirm it does NOT appear in the default response. This is a critical regression test — the spec warns about this backward compat requirement.

- [ ] **Step 7: Run all integration tests**

Run: `scripts/with-env-local.sh pnpm exec vitest run --config apps/web/vitest.integration.config.ts`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add apps/web/__tests__/integration/visitor-upgrade.integration.test.ts
git commit -m "test: add visitor upgrade integration tests"
```

---

## Task 16: Responsive Design & Final Verification

**Files:**
- Various component files from Tasks 11-14

- [ ] **Step 1: Verify responsive layout on mobile viewport**

Use preview tools to check staff view and resident view at mobile width (375px). Verify DataTable scrolls horizontally, cards stack vertically, forms are usable.

- [ ] **Step 2: Run full CI suite**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Expected: All pass. The DB access guard (`pnpm guard:db-access`) must pass — all new imports use `@propertypro/db` and `@propertypro/db/filters`.

- [ ] **Step 3: Run perf check**

Run: `pnpm perf:check`
Expected: Bundle size within budget

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "chore: responsive polish and CI verification for visitor upgrade"
```

---

## Dependency Graph

```
Task 1 (Schema & Migration)
  ├── Task 2 (Service: Visitor Extensions)
  │     ├── Task 4 (API: Visitor Routes)
  │     │     ├── Task 8 (Hooks)
  │     │     │     ├── Task 11 (UI: Columns)
  │     │     │     ├── Task 12 (UI: Staff View)
  │     │     │     ├── Task 13 (UI: Resident View)
  │     │     │     └── Task 14 (UI: Registration Form)
  │     │     └── Task 15 (Integration Tests)
  │     └── Task 6 (Cron & Cascade)
  ├── Task 3 (Service: Denied Visitors)
  │     └── Task 5 (API: Denied Routes)
  ├── Task 7 (Notifications)
  ├── Task 9 (Unit Tests)
  └── Task 10 (QR Component)

Task 16 (Responsive & Verification) — depends on all above
```

**Parallelizable groups:**
- After Task 1: Tasks 2+3 can run in parallel
- After Tasks 2+3: Tasks 4+5+6+7+9+10 can run in parallel
- After Tasks 4+5: Task 8 can start
- After Task 8: Tasks 11+12+13+14 can run in parallel
- After all: Tasks 15+16 run sequentially
