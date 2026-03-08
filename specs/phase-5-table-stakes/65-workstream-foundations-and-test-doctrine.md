# Workstream 65: Foundations and Test Doctrine

**Complexity:** Medium
**Prerequisite for:** All other Phase 5 workstreams (66-72)
**Must merge before any downstream work begins.**

---

## 1. Objective And Business Outcome

Establish the shared infrastructure, contracts, and quality gates that all Phase 5 workstreams depend on. Without WS 65, downstream workstreams will drift in test patterns, migration conventions, and shared interfaces.

**Business outcome:** Zero quality regressions during Phase 5 parallel development. Every new feature ships with real-DB integration evidence, not mocked confidence.

---

## 2. In Scope

1. **Test Infrastructure Providers** — Replace per-test `vi.mock` patterns with shared test infrastructure
2. **No-Mock Guard Script** — CI-enforced lint guard with per-file allowlist for legacy tests
3. **Legacy Test Migration** — Migrate 13 existing integration tests to no-mock using test providers
4. **Migration Coordination Model** — Reserved ranges, ordering verification, schema owner protocol
5. **Shared Contracts** — Ledger interface, RBAC resource extensions, feature flag extensions
6. **Playwright E2E Setup** — Framework installation, base fixtures, smoke tests
7. **Admin Vitest Config Fix** — Separate unit from integration test configs
8. **CI Workflow Updates** — New required jobs, remove conditional gates
9. **Audit Evidence Verifier** — Script to validate evidence doc structure

---

## 3. Out Of Scope

- Implementing any Phase 5 feature (finance, violations, polls, etc.)
- Ledger lifecycle logic (WS 66 owns that)
- Fine posting logic (WS 67 owns that)
- Stripe test mode key provisioning (WS 66 owns that)
- Google Calendar sandbox setup (WS 70 owns that)
- Chaos engineering drills (deferred to post-launch)
- ADR-001 approval (prerequisite, not deliverable)

---

## 4. Dependencies

| Dependency | Status | Blocker? |
|---|---|---|
| ADR-001 RBAC model approval | Proposed | **Yes** — must be approved before WS 65 starts |
| Phase 4 / Gate 4 complete | Done (2026-02-26) | No |
| Current integration test infrastructure | Exists (23 tests, test kit) | No |
| Current CI workflows | Exists (9 workflows) | No |

---

## 5. Data Model And Migrations

### Migration Range: 0036-0039

### 0036: Ledger Entries Table

```sql
CREATE TABLE ledger_entries (
  id BIGSERIAL PRIMARY KEY,
  community_id BIGINT NOT NULL REFERENCES communities(id),
  entry_type TEXT NOT NULL,  -- assessment, payment, refund, fine, fee, adjustment
  amount_cents BIGINT NOT NULL,
  description TEXT NOT NULL,
  source_type TEXT NOT NULL,  -- assessment, payment, violation, manual
  source_id TEXT,             -- FK to source record (polymorphic)
  unit_id BIGINT REFERENCES units(id),
  user_id UUID REFERENCES users(id),
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id UUID REFERENCES users(id),
  deleted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;

-- RLS policies follow community_id scoping pattern
CREATE POLICY "ledger_entries_tenant_isolation"
  ON ledger_entries
  USING (community_id = current_setting('app.current_community_id')::bigint);

CREATE INDEX idx_ledger_entries_community ON ledger_entries(community_id);
CREATE INDEX idx_ledger_entries_unit ON ledger_entries(unit_id);
CREATE INDEX idx_ledger_entries_source ON ledger_entries(source_type, source_id);
CREATE INDEX idx_ledger_entries_effective_date ON ledger_entries(community_id, effective_date);
```

### Drizzle Schema

```typescript
// packages/db/src/schema/ledger-entries.ts
export const ledgerEntries = pgTable('ledger_entries', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' }).notNull().references(() => communities.id),
  entryType: text('entry_type').notNull(), // LedgerEntryType enum
  amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
  description: text('description').notNull(),
  sourceType: text('source_type').notNull(),
  sourceId: text('source_id'),
  unitId: bigint('unit_id', { mode: 'number' }).references(() => units.id),
  userId: uuid('user_id').references(() => users.id),
  effectiveDate: date('effective_date').notNull().defaultNow(),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdByUserId: uuid('created_by_user_id').references(() => users.id),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

### Shared Types

```typescript
// packages/shared/src/ledger.ts
export const LEDGER_ENTRY_TYPES = [
  'assessment', 'payment', 'refund', 'fine', 'fee', 'adjustment',
] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

export const LEDGER_SOURCE_TYPES = [
  'assessment', 'payment', 'violation', 'manual',
] as const;
export type LedgerSourceType = (typeof LEDGER_SOURCE_TYPES)[number];

/** Typed metadata schemas per source type */
export interface LedgerMetadata {
  /** Assessment metadata */
  assessmentId?: number;
  lineItemId?: number;
  /** Payment metadata */
  stripePaymentIntentId?: string;
  stripeChargeId?: string;
  /** Violation/fine metadata */
  violationId?: number;
  fineId?: number;
  /** Refund metadata */
  refundReason?: string;
  originalEntryId?: number;
  /** General */
  notes?: string;
}
```

---

## 6. API Contracts

### Ledger Write Interface

```typescript
// packages/db/src/queries/ledger.ts (or apps/web/src/lib/services/ledger-service.ts)
export async function postLedgerEntry(
  scopedClient: ScopedClient,
  entry: {
    entryType: LedgerEntryType;
    amountCents: number;
    description: string;
    sourceType: LedgerSourceType;
    sourceId?: string;
    unitId?: number;
    userId?: string;
    effectiveDate?: Date;
    metadata?: LedgerMetadata;
    createdByUserId: string;
  },
): Promise<{ id: number }>

// Validates entry type against enum
// Logs audit event with request ID
// Returns inserted row ID
```

No HTTP API endpoint in WS 65. WS 66/67 expose ledger reads through their own routes.

---

## 7. Authorization + RLS Policy Family Mapping

### New RBAC Resources (add to `packages/shared/src/rbac-matrix.ts`)

```typescript
// Extend RbacResource type
export type RbacResource =
  | /* existing */ 'documents' | 'meetings' | 'announcements' | 'residents'
  | 'settings' | 'audit' | 'compliance' | 'maintenance' | 'contracts'
  // Phase 5 additions:
  | 'finances' | 'violations' | 'arc_submissions' | 'polls'
  | 'work_orders' | 'amenities' | 'packages' | 'visitors'
  | 'calendar_sync' | 'accounting';
```

Default permissions for new resources are `false` for all roles until individual workstreams define their policy rows.

### New Feature Flags (add to `packages/shared/src/features/community-features.ts`)

```typescript
// Extend CommunityFeatures interface
export interface CommunityFeatures {
  // ... existing flags
  hasFinance: boolean;
  hasViolations: boolean;
  hasARC: boolean;
  hasPolls: boolean;
  hasCommunityBoard: boolean;
  hasWorkOrders: boolean;
  hasAmenities: boolean;
  hasPackageLogging: boolean;
  hasVisitorLogging: boolean;
  hasCalendarSync: boolean;
  hasAccountingConnectors: boolean;
}
```

All new flags default to `false` for all community types. Individual workstreams set `true` as appropriate.

---

## 9. Failure Modes And Edge Cases

### Migration Coordination
- **Duplicate migration idx:** CI check (`verify-migration-ordering.ts`) rejects
- **Out-of-order journal timestamps:** CI check rejects
- **Range overflow:** Workstream exceeds reserved range → schema owner renumbers

### Test Provider Edge Cases
- **Multiple actors in one test:** `setActor()` must be called before each request; test auth provider reads `currentActorUserId` at call time, not at registration time
- **Concurrent test runs:** `runSuffix` UUID isolation prevents data collisions
- **Append-only table teardown:** Test kit's best-effort cleanup already handles `compliance_audit_log`; extend pattern for `ledger_entries` if needed (ledger entries may need to be append-only for compliance)

---

## 10. Testing Plan

### 10.1 Test Infrastructure Deliverables

#### Test Auth Provider
**File:** `apps/web/__tests__/integration/providers/test-auth-provider.ts`

**Approach:** Module that, when imported, patches `requireAuthenticatedUserId` to read from `TestKitState.currentActorUserId` instead of Supabase cookies.

```typescript
// Conceptual design
import { TestKitState } from '../helpers/multi-tenant-test-kit';

let currentState: TestKitState | null = null;

export function registerTestAuthState(state: TestKitState): void {
  currentState = state;
}

export function getTestAuthUserId(): string {
  if (!currentState?.currentActorUserId) {
    throw new Error('Test actor not set — call setActor() before making requests');
  }
  return currentState.currentActorUserId;
}
```

**Registration:** Via vitest setup file for integration config only. The setup file patches `@/lib/api/auth` module to use the test provider. This is a **one-time, centralized** mock — not per-test `vi.mock`.

#### Event Capture Sinks
**File:** `apps/web/__tests__/integration/providers/test-capture-sinks.ts`

For notifications:
```typescript
export interface CapturedNotification {
  communityId: number;
  event: NotificationEvent;
  recipientFilter: RecipientFilter;
  actorUserId?: string;
}

const notificationSink: CapturedNotification[] = [];

export function getCapturedNotifications(): readonly CapturedNotification[] {
  return notificationSink;
}

export function clearCapturedNotifications(): void {
  notificationSink.length = 0;
}
```

For email: **Already solved.** The `@propertypro/email` package has built-in test mode when `RESEND_API_KEY` is not set. Emails collect in `testInbox` with `clearTestInbox()`. Integration tests should simply not set `RESEND_API_KEY`, and assert against `testInbox`.

For storage:
```typescript
export interface CapturedStorageOp {
  operation: 'upload' | 'download' | 'delete';
  bucket: string;
  path: string;
  options?: Record<string, unknown>;
}

const storageSink: CapturedStorageOp[] = [];
// Similar capture + clear pattern
```

For PDF extraction:
```typescript
export interface CapturedPdfExtraction {
  communityId: number;
  documentId: number;
  path: string;
  mimeType: string;
}

const pdfSink: CapturedPdfExtraction[] = [];
// Fire-and-forget capture — no background processing
```

#### Integration Setup File
**File:** `apps/web/__tests__/integration/setup-integration.ts`

```typescript
// Registered ONLY by vitest.integration.config.ts
// Patches auth, notifications, storage, and PDF extraction modules
// Email uses built-in test mode (no RESEND_API_KEY in test env)
```

Update `apps/web/vitest.integration.config.ts`:
```typescript
test: {
  environment: 'node',
  include: ['apps/web/__tests__/**/*integration.test.ts'],
  setupFiles: ['apps/web/__tests__/integration/setup-integration.ts'],
  hookTimeout: 30_000,
  testTimeout: 30_000,
},
```

### 10.2 Legacy Test Migration

Migrate all 13 existing integration test files from per-test `vi.mock` to shared test providers:

| File | Mocks to Remove | Provider Replacement |
|---|---|---|
| `multi-tenant-routes.integration.test.ts` | auth, email, admin client, DB partial | test-auth, email test mode, capture sinks |
| `multi-tenant-isolation.integration.test.ts` | auth, middleware | test-auth |
| `multi-tenant-access-policy.integration.test.ts` | auth | test-auth |
| `rls-validation.integration.test.ts` | auth | test-auth |
| `document-upload-flow.integration.test.ts` | auth, DB partial, notifications, PDF | test-auth, capture sinks |
| `compliance-lifecycle.integration.test.ts` | auth, notifications, PDF | test-auth, capture sinks |
| `announcements-crud.integration.test.ts` | auth, announcement delivery, notifications | test-auth, capture sinks |
| `meeting-deadlines.integration.test.ts` | auth, notifications, PDF | test-auth, capture sinks |
| `onboarding-flow.integration.test.ts` | auth, email | test-auth, email test mode |
| `onboarding-flow-condo.integration.test.ts` | auth | test-auth |
| `feature-flag-enforcement.integration.test.ts` | auth | test-auth |
| `document-access.integration.test.ts` | (check) | test-auth if needed |
| `document-search.integration.test.ts` | (check) | test-auth if needed |

Also handle: `apps/web/__tests__/billing/subscription-guard-integration.test.ts` — this one mocks `@propertypro/db/unsafe` and `@propertypro/db/supabase/admin` extensively. May need to remain as `*.route-unit.test.ts` or receive a deeper refactor.

### 10.3 Seed/Fixture Strategy
- Reuse existing `MULTI_TENANT_COMMUNITIES` and `MULTI_TENANT_USERS` fixtures
- Add ledger-specific fixtures: sample ledger entries per community
- `runSuffix` UUID isolation prevents test collisions

### 10.4 Teardown Rules
- Standard cascade delete via `teardownTestKit()`
- `ledger_entries` table: if append-only enforcement is needed, follow `compliance_audit_log` pattern (best-effort cleanup with FK-tolerant error handling)
- If not append-only, standard soft-delete scoping applies

### 10.5 Tenant Isolation Matrix
- Ledger entries for communityA must not be visible to communityB's scoped client
- New RBAC resources must respect community-type constraints (e.g., `violations` not applicable to `apartment` type)

### 10.6 Concurrency Cases
- Not applicable for WS 65 (infrastructure workstream)

### 10.7 Environment Requirements
- `DATABASE_URL` — Required for all integration tests
- `RESEND_API_KEY` — Must NOT be set (enables email test mode)
- No external service keys needed for WS 65

---

## 12. Definition Of Done + Evidence Required

### Checklist

- [ ] **Test auth provider** — `test-auth-provider.ts` created, registered in integration setup file
- [ ] **Capture sinks** — notification, storage, and PDF sinks created
- [ ] **Email test mode** — Verified that integration tests use built-in `testInbox` when `RESEND_API_KEY` is unset
- [ ] **No-mock guard** — `scripts/verify-no-mocks-in-integration.ts` created with correct glob scope matching all vitest integration configs
- [ ] **Legacy allowlist empty** — All 13 existing integration tests migrated to use test providers; no allowlist entries remain
- [ ] **Admin vitest config** — `apps/admin/vitest.integration.config.ts` created; `apps/admin/vitest.config.ts` updated to exclude `*.integration.test.ts`
- [ ] **Migration ordering check** — `scripts/verify-migration-ordering.ts` created and passing
- [ ] **Ledger table** — Migration 0036 applied, Drizzle schema added, `postLedgerEntry()` implemented with audit logging
- [ ] **RBAC resources** — 8 new resources added to `rbac-matrix.ts` with `satisfies` exhaustiveness
- [ ] **Feature flags** — 9 new flags added to `CommunityFeatures` with exhaustiveness check, all defaulting to `false`
- [ ] **Playwright** — Installed, configured, base fixtures created, 1-2 smoke tests passing
- [ ] **CI workflows** — New required jobs added (`no-mock-guard`, `migration-ordering`); `integration-tests.yml` conditional removed
- [ ] **Audit evidence verifier** — `scripts/verify-audit-evidence.ts` created
- [ ] **All existing tests still pass** — No regressions in unit, integration, or build
- [ ] **Migration range doc** — Reserved ranges documented and CI-enforced

### Evidence Required

`docs/audits/phase5-65-YYYY-MM-DD.md` following Gate evidence protocol with:
- Full CI run transcript (all jobs green)
- No-mock guard output showing zero violations
- Migration ordering check output
- Playwright smoke test output
- Integration test results showing all 13 migrated tests pass without `vi.mock`
