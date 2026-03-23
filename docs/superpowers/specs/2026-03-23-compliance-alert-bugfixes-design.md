# Compliance Alert Service Bugfixes

**Date:** 2026-03-23
**Status:** Draft
**Scope:** 3 verified bugs + 1 doc fix in the compliance alert subsystem

## Problem Statement

An adversarial audit of the compliance system identified 3 bugs and 1 documentation gap:

1. **Bug 1 — Alert service ignores `isApplicable` flag.** Items marked "Not Applicable" by admins still trigger critical overdue alerts. Root cause: the alert service reimplements overdue detection instead of using `calculateComplianceStatus`.

2. **Bug 2 — Alert service misses rolling-window overdue items.** The alert loop only checks the `deadline` field. Rolling-window items (meeting minutes, bids, video recordings — 5/16 condo, 3/10 HOA) have `deadline: null` and use `rollingWindow.months` + `documentPostedAt`. These items are never flagged even when overdue. Same root cause as Bug 1.

3. **Bug 3 — `checkAndAlertOverdueItems` is dead code.** The function exists, is tested, but no cron route or API endpoint calls it. The compliance alerting feature does not run in production.

4. **Gap 1 — Stale CLAUDE.md reference.** `.claude/rules/florida-compliance.md` references `apps/web/src/lib/services/compliance-service.ts` which does not exist. Actual file is `apps/web/src/lib/utils/compliance-calculator.ts`.

Additionally, during design review, a **notification spam problem** was identified: the alert service sends one `severity: 'critical'` notification per overdue item per invocation with zero deduplication in the notification service. Running daily would produce N items x M admins alerts per day — unsustainable.

## Approach

**Single root-cause fix for Bugs 1 & 2:** Replace the manual overdue detection loop in `compliance-alert-service.ts` with `calculateComplianceStatus` from `compliance-calculator.ts`. This is the same function the GET API handler uses. If `status === 'overdue'`, it's overdue. No reimplementation, no divergence.

**Spam prevention:** Aggregate overdue items into a single digest-style notification per community per cron run, instead of one notification per item.

**Cron wiring for Bug 3:** Follow the exact pattern established by `assessment-automation-service.ts` — service owns cross-community iteration, route is a thin `requireCronSecret` + call wrapper.

## File Manifest

| File | Action | Purpose |
|------|--------|---------|
| `apps/web/src/lib/services/compliance-alert-service.ts` | Edit | Fix Bugs 1+2, add spam-safe digest, add `processComplianceAlerts()` |
| `apps/web/src/app/api/v1/internal/compliance-alerts/route.ts` | New | Cron endpoint |
| `apps/web/vercel.json` | Edit | Add cron schedule entry |
| `scripts/verify-scoped-db-access.ts` | Edit | Allowlist `compliance-alert-service.ts` for unscoped import |
| `.claude/rules/florida-compliance.md` | Edit | Fix stale file reference |
| `apps/web/__tests__/notifications/compliance-alert-service.test.ts` | Edit | Add missing test cases |
| `apps/web/__tests__/cron/compliance-alerts-route.test.ts` | New | Cron route auth + happy-path tests |

**Total: 4 edits, 2 new files, 1 doc fix.**

## Detailed Changes

### 1. compliance-alert-service.ts

#### 1a. Update `checkAndAlertOverdueItems` signature to accept injectable `now`

Current signature:
```typescript
export async function checkAndAlertOverdueItems(
  communityId: number,
  actorUserId?: string,
): Promise<ComplianceAlertResult>
```

New signature (adds `now` parameter for testability, required by `processComplianceAlerts`):
```typescript
export async function checkAndAlertOverdueItems(
  communityId: number,
  actorUserId?: string,
  now: Date = new Date(),
): Promise<ComplianceAlertResult>
```

Remove the internal `const now = new Date();` (line 36) since it's now a parameter.

#### 1b. Replace overdue detection with `calculateComplianceStatus`

Current broken loop (lines 44-63):
```typescript
for (const row of rows) {
  const deadline = row['deadline'] ? new Date(row['deadline'] as string) : null;
  const documentId = row['documentId'] as number | null;
  // BUG: ignores isApplicable, misses rolling windows
  if (deadline && deadline < now && !documentId) {
```

New loop:
```typescript
import { calculateComplianceStatus } from '@/lib/utils/compliance-calculator';

for (const row of rows) {
  const status = calculateComplianceStatus({
    isApplicable: row['isApplicable'] as boolean | undefined,
    documentId: (row['documentId'] as number | null) ?? null,
    documentPostedAt: row['documentPostedAt']
      ? new Date(row['documentPostedAt'] as string)
      : null,
    deadline: row['deadline'] ? new Date(row['deadline'] as string) : null,
    rollingWindowMonths:
      typeof (row['rollingWindow'] as Record<string, unknown>)?.months === 'number'
        ? (row['rollingWindow'] as Record<string, unknown>).months as number
        : null,
    now,
  });
  if (status === 'overdue') { /* accumulate */ }
}
```

This extraction pattern mirrors the GET handler in `apps/web/src/app/api/v1/compliance/route.ts:73-93`.

The overdue items accumulator stores formatted strings for the deadline field (matching the existing `dueDate?: string` type on `ComplianceAlertEvent`):
```typescript
interface OverdueItem {
  title: string;
  description: string;
  deadline: string;          // pre-formatted string, e.g. "March 15, 2026"
  statuteReference: string;
}
```

#### 1c. Aggregate into single digest notification per community

Instead of calling `sendNotification` in a per-item loop, accumulate overdue items into a list, then send ONE notification after the loop:

```typescript
if (overdueItems.length === 0) {
  return { communityId, overdueCount: 0, notifiedCount: 0 };
}

const event: ComplianceAlertEvent = {
  type: 'compliance_alert',
  alertTitle: `${overdueItems.length} compliance item${overdueItems.length > 1 ? 's' : ''} overdue`,
  alertDescription: overdueItems.map(i => `${i.title} (${i.statuteReference})`).join('; '),
  dueDate: overdueItems[0].deadline,
  severity: 'critical',
  statuteReference: overdueItems.map(i => i.statuteReference).join(', '),
  sourceType: 'compliance',
  sourceId: String(communityId),
};

const notifiedCount = await sendNotification(communityId, event, 'community_admins', actorUserId);
```

One notification per community per cron run. Not one per item.

#### 1d. Add `processComplianceAlerts()` entry point

New exported function owning cross-community iteration. Pattern matches `processOverdueTransitions()` from `assessment-automation-service.ts`:

```typescript
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { communities } from '@propertypro/db';
import { isNull } from '@propertypro/db/filters';

export interface ComplianceAlertSummary {
  communitiesProcessed: number;
  totalOverdue: number;
  totalNotified: number;
  errors: number;
}

export async function processComplianceAlerts(
  now: Date = new Date(),
): Promise<ComplianceAlertSummary> {
  const db = createUnscopedClient();

  const activeCommunities = await db
    .select({ id: communities.id, communityType: communities.communityType })
    .from(communities)
    .where(isNull(communities.deletedAt));

  const complianceCommunities = activeCommunities.filter(
    (c) => c.communityType === 'condo_718' || c.communityType === 'hoa_720',
  );

  const summary: ComplianceAlertSummary = {
    communitiesProcessed: 0,
    totalOverdue: 0,
    totalNotified: 0,
    errors: 0,
  };

  for (const community of complianceCommunities) {
    try {
      const result = await checkAndAlertOverdueItems(community.id, undefined, now);
      summary.communitiesProcessed++;
      summary.totalOverdue += result.overdueCount;
      summary.totalNotified += result.notifiedCount;
    } catch (err) {
      summary.errors++;
      console.error(`[compliance-alerts] Failed for community ${community.id}:`, err);
    }
  }

  return summary;
}
```

Key details:
- `createUnscopedClient` for cross-community community listing (requires allowlist entry)
- Filter by `communityType` in application code (not a DB column for `hasCompliance`)
- Per-community try/catch — one failure doesn't kill the run
- Error counter in summary for monitoring
- Accepts injectable `now` for testability

### 2. Cron Route

**New file:** `apps/web/src/app/api/v1/internal/compliance-alerts/route.ts`

Thin wrapper matching existing cron route pattern:

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireCronSecret } from '@/lib/api/cron-auth';
import { processComplianceAlerts } from '@/lib/services/compliance-alert-service';

export const POST = withErrorHandler(async (req: NextRequest) => {
  requireCronSecret(req, process.env.COMPLIANCE_CRON_SECRET);
  const summary = await processComplianceAlerts();
  return NextResponse.json({ data: summary });
});
```

**Schedule:** Daily at 07:30 UTC — after assessment-overdue (06:00) and late-fee-processor (07:00), before assessment-due-reminders (08:00).

**vercel.json entry:**
```json
{
  "path": "/api/v1/internal/compliance-alerts",
  "schedule": "30 7 * * *"
}
```

**Env var:** `COMPLIANCE_CRON_SECRET` — must be set in Vercel project settings and `.env.local`.

### 3. DB Access Guard Allowlist

**File:** `scripts/verify-scoped-db-access.ts`

Add `compliance-alert-service.ts` to the allowlist with authorization contract comment, same pattern as existing entries for `assessment-automation-service.ts`.

### 4. CLAUDE.md Fix

**File:** `.claude/rules/florida-compliance.md`

Replace:
```
The compliance scoring system in `apps/web/src/lib/services/compliance-service.ts` tracks:
```
With:
```
The compliance scoring system in `apps/web/src/lib/utils/compliance-calculator.ts` tracks:
```

### 5. Tests

#### Updated: `compliance-alert-service.test.ts`

**Mock structure rebuild required.** The existing test mocks `sendEmail` (the raw mailer from `@propertypro/email`) because the old implementation called `sendNotification` which internally resolved recipients and called `sendEmail`. After the refactor, the alert service still calls `sendNotification`, but the test mock layer must change:

- Replace `sendEmailMock` with `sendNotificationMock` by mocking `@/lib/services/notification-service` directly (vi.mock the module, not its internal dependency)
- Remove the `@propertypro/email` mock since the alert service no longer transits through it
- Update `setupMock` to only need `complianceChecklistItems` rows (notification internals are mocked away)

**Contradictory test replacement.** The existing test "sends one alert per overdue item" (line 148) asserts `sendEmailMock.toHaveBeenCalledTimes(2)` for 2 overdue items. This directly contradicts the new digest behavior. **Delete this test** and replace with its inverse:

| Test | Asserts |
|------|---------|
| **REPLACE** "sends one alert per overdue item" | **DELETE** — contradicts new digest behavior |

**Existing tests to update.** These existing tests remain valid but need mock structure updates:
- "detects overdue items" — assert `sendNotificationMock` called once (was `sendEmailMock`)
- "does not flag items with linked documents" — assert `sendNotificationMock` not called
- "does not flag items with future deadlines" — no notification mock assertion needed
- "does not flag items with no deadline" — no notification mock assertion needed
- "returns zero counts when no checklist items exist" — no change needed

**New test cases for `checkAndAlertOverdueItems`:**

| Test | Asserts |
|------|---------|
| N/A items excluded from overdue count | Item with `isApplicable: false` and past deadline → `overdueCount: 0` |
| Rolling-window stale document counted as overdue | Item with `documentId`, `documentPostedAt` 13 months ago, `rollingWindow: {months: 12}` → `overdueCount: 1` |
| Rolling-window fresh document NOT counted | Item with `documentId`, `documentPostedAt` 3 months ago, `rollingWindow: {months: 12}` → `overdueCount: 0` |
| Single digest notification per community | 3 overdue items → `sendNotificationMock` called exactly once (not 3 times) |
| Digest event includes sourceId and sourceType | `sendNotificationMock` called with event containing `sourceType: 'compliance'` and `sourceId: String(communityId)` |

**New test cases for `processComplianceAlerts`:**

| Test | Asserts |
|------|---------|
| Iterates only condo/HOA communities | Given 2 condos + 1 apartment → `communitiesProcessed: 2` |
| Continues processing if one community throws | Community A throws, Community B succeeds → `errors: 1, communitiesProcessed: 1` |
| Aggregates totals across communities | Community A: 3 overdue, Community B: 2 overdue → `totalOverdue: 5` |

#### New: `compliance-alerts-route.test.ts`

| Test | Asserts |
|------|---------|
| Returns 401 without valid cron secret | Missing/wrong Bearer token → 401 |
| Calls processComplianceAlerts and returns summary | Valid token → 200, response contains summary shape |
| Returns 500 when processComplianceAlerts throws | Service throws → 500 with error response |

## Non-Goals

- **No schema changes.** No new columns, no migrations.
- **No notification deduplication infrastructure.** The digest approach solves spam without needing a `lastAlertedAt` column or dedup table.
- **No meeting notice compliance in the dashboard.** The transparency page already covers this for the public. Dashboard integration is a separate feature.
- **No changes to the compliance calculator, templates, or API route.** Those are working correctly.

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Cron secret not set in Vercel | Medium | Document in PR description; will 401 harmlessly if missing |
| Notification template doesn't handle multi-item digest format | Low | The `alertDescription` field is already a free-text string; existing template renders it |
| Unscoped query on communities table is slow | Very Low | Table has <100 rows in any realistic deployment |
