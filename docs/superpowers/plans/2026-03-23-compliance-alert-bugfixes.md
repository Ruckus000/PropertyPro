# Compliance Alert Bugfixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 3 bugs in the compliance alert service (isApplicable ignored, rolling-window items missed, dead code) + prevent notification spam + fix stale doc reference.

**Architecture:** Reuse `calculateComplianceStatus` as single source of truth for overdue detection. Aggregate alerts into one digest per community. Wire up via cron route following `assessment-automation-service` pattern.

**Tech Stack:** TypeScript, Next.js API routes, Vitest, Vercel Cron, `@propertypro/db` scoped/unscoped clients.

**Spec:** `docs/superpowers/specs/2026-03-23-compliance-alert-bugfixes-design.md`

---

### Task 1: Rewrite `checkAndAlertOverdueItems` — fix Bugs 1, 2 + spam prevention

**Files:**
- Modify: `apps/web/src/lib/services/compliance-alert-service.ts`

- [ ] **Step 1: Replace the full file with the corrected implementation**

Replace the entire contents of `apps/web/src/lib/services/compliance-alert-service.ts` with:

```typescript
/**
 * Compliance alert service — P2-41.
 *
 * Scans compliance checklist items for overdue entries and sends
 * a single digest-style compliance-alert notification to community admins.
 *
 * Designed to be called by the daily compliance-alerts cron job.
 */
import {
  communities,
  complianceChecklistItems,
  createScopedClient,
} from '@propertypro/db';
import { isNull } from '@propertypro/db/filters';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { sendNotification } from '@/lib/services/notification-service';
import type { ComplianceAlertEvent } from '@/lib/services/notification-service';
import { calculateComplianceStatus } from '@/lib/utils/compliance-calculator';

export interface ComplianceAlertResult {
  communityId: number;
  overdueCount: number;
  notifiedCount: number;
}

interface OverdueItem {
  title: string;
  description: string;
  deadline: string;
  statuteReference: string;
}

/**
 * Check a community's compliance checklist for overdue items and send
 * a single digest alert to community admins.
 *
 * Returns the number of overdue items found and how many admin recipients
 * were notified.
 */
export async function checkAndAlertOverdueItems(
  communityId: number,
  actorUserId?: string,
  now: Date = new Date(),
): Promise<ComplianceAlertResult> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.query(complianceChecklistItems);

  const overdueItems: OverdueItem[] = [];

  for (const row of rows) {
    const deadline = row['deadline'] ? new Date(row['deadline'] as string) : null;
    const documentPostedAt = row['documentPostedAt']
      ? new Date(row['documentPostedAt'] as string)
      : null;
    const rollingWindowRecord = row['rollingWindow'] as Record<string, unknown> | null;
    const rollingWindowMonths =
      typeof rollingWindowRecord?.months === 'number'
        ? rollingWindowRecord.months
        : null;

    const status = calculateComplianceStatus({
      isApplicable: row['isApplicable'] as boolean | undefined,
      documentId: (row['documentId'] as number | null) ?? null,
      documentPostedAt,
      deadline,
      rollingWindowMonths,
      now,
    });

    if (status === 'overdue') {
      overdueItems.push({
        title: typeof row['title'] === 'string' ? row['title'] : 'Compliance Item',
        description: typeof row['description'] === 'string' ? row['description'] : '',
        deadline: deadline
          ? deadline.toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })
          : 'No deadline',
        statuteReference:
          typeof row['statuteReference'] === 'string'
            ? row['statuteReference']
            : 'Florida Statute §718.111(12)(g)',
      });
    }
  }

  if (overdueItems.length === 0) {
    return { communityId, overdueCount: 0, notifiedCount: 0 };
  }

  // Send ONE digest notification per community (not one per item)
  const event: ComplianceAlertEvent = {
    type: 'compliance_alert',
    alertTitle: `${overdueItems.length} compliance item${overdueItems.length > 1 ? 's' : ''} overdue`,
    alertDescription: overdueItems.map((i) => `${i.title} (${i.statuteReference})`).join('; '),
    dueDate: overdueItems[0].deadline,
    severity: 'critical',
    statuteReference: overdueItems.map((i) => i.statuteReference).join(', '),
    sourceType: 'compliance',
    sourceId: String(communityId),
  };

  const notifiedCount = await sendNotification(communityId, event, 'community_admins', actorUserId);

  return {
    communityId,
    overdueCount: overdueItems.length,
    notifiedCount,
  };
}

// ---------------------------------------------------------------------------
// Cross-community cron entry point
// ---------------------------------------------------------------------------

export interface ComplianceAlertSummary {
  communitiesProcessed: number;
  totalOverdue: number;
  /** Sum of admin recipients reached across all communities (not notification count). */
  totalNotified: number;
  errors: number;
}

/**
 * Iterate all compliance-enabled communities and check for overdue items.
 * Called by the daily cron at /api/v1/internal/compliance-alerts.
 *
 * Uses createUnscopedClient() to list communities, then createScopedClient()
 * per community via checkAndAlertOverdueItems.
 */
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

- [ ] **Step 2: Verify the file compiles**

Run: `pnpm typecheck`
Expected: No errors in `compliance-alert-service.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/services/compliance-alert-service.ts
git commit -m "fix: rewrite compliance alert service to use calculateComplianceStatus

Fixes 3 bugs:
- Alert service now respects isApplicable flag (no false alerts for N/A items)
- Alert service now detects rolling-window overdue items (meeting minutes, bids, etc.)
- Aggregates into single digest notification per community (prevents spam)

Adds processComplianceAlerts() entry point for cron integration."
```

---

### Task 2: Rewrite alert service tests

**Files:**
- Modify: `apps/web/__tests__/notifications/compliance-alert-service.test.ts`

- [ ] **Step 1: Replace the full test file with updated mocks and new test cases**

Replace the entire contents of `apps/web/__tests__/notifications/compliance-alert-service.test.ts` with:

```typescript
/**
 * Unit tests for the compliance alert service.
 *
 * Tests:
 * - Overdue detection via calculateComplianceStatus (not manual deadline check)
 * - N/A items excluded from overdue count
 * - Rolling-window items with stale/fresh documents
 * - Single digest notification per community (not one per item)
 * - processComplianceAlerts cross-community iteration
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createScopedClientMock,
  sendNotificationMock,
  createUnscopedClientMock,
  tables,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  sendNotificationMock: vi.fn(),
  createUnscopedClientMock: vi.fn(),
  tables: {
    communities: Symbol('communities'),
    complianceChecklistItems: Symbol('compliance_checklist_items'),
  },
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  communities: tables.communities,
  complianceChecklistItems: tables.complianceChecklistItems,
}));

vi.mock('@propertypro/db/filters', () => ({
  isNull: vi.fn(() => 'isNull_placeholder'),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: createUnscopedClientMock,
}));

vi.mock('@/lib/services/notification-service', () => ({
  sendNotification: sendNotificationMock,
}));

import {
  checkAndAlertOverdueItems,
  processComplianceAlerts,
} from '../../src/lib/services/compliance-alert-service';

const COMMUNITY_ID = 5;
const NOW = new Date('2026-03-15T12:00:00.000Z');
const pastDate = new Date('2026-02-01T00:00:00.000Z').toISOString();
const futureDate = new Date('2026-04-15T00:00:00.000Z').toISOString();

function setupChecklistMock(rows: Array<Record<string, unknown>>) {
  createScopedClientMock.mockReturnValue({
    query: vi.fn(async () => rows),
  });
}

describe('checkAndAlertOverdueItems', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendNotificationMock.mockResolvedValue(1);
  });

  it('detects overdue items (deadline in past, no document linked)', async () => {
    setupChecklistMock([
      {
        title: 'Annual Budget',
        description: 'Must post annual budget',
        deadline: pastDate,
        documentId: null,
        documentPostedAt: null,
        rollingWindow: null,
        isApplicable: true,
        statuteReference: '§718.112(2)(f)',
      },
    ]);

    const result = await checkAndAlertOverdueItems(COMMUNITY_ID, 'system', NOW);
    expect(result.overdueCount).toBe(1);
    expect(result.notifiedCount).toBe(1);
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
  });

  it('does not flag items with linked documents', async () => {
    setupChecklistMock([
      {
        title: 'Annual Budget',
        description: 'Must post annual budget',
        deadline: pastDate,
        documentId: 42,
        documentPostedAt: new Date('2026-02-10T00:00:00.000Z').toISOString(),
        rollingWindow: null,
        isApplicable: true,
        statuteReference: '§718.112(2)(f)',
      },
    ]);

    const result = await checkAndAlertOverdueItems(COMMUNITY_ID, 'system', NOW);
    expect(result.overdueCount).toBe(0);
    expect(result.notifiedCount).toBe(0);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it('does not flag items with future deadlines', async () => {
    setupChecklistMock([
      {
        title: 'Annual Budget',
        description: 'Must post annual budget',
        deadline: futureDate,
        documentId: null,
        documentPostedAt: null,
        rollingWindow: null,
        isApplicable: true,
        statuteReference: '§718.112(2)(f)',
      },
    ]);

    const result = await checkAndAlertOverdueItems(COMMUNITY_ID, 'system', NOW);
    expect(result.overdueCount).toBe(0);
    expect(result.notifiedCount).toBe(0);
  });

  it('does not flag items with no deadline and no rolling window', async () => {
    setupChecklistMock([
      {
        title: 'Optional Document',
        description: 'No deadline set',
        deadline: null,
        documentId: null,
        documentPostedAt: null,
        rollingWindow: null,
        isApplicable: true,
        statuteReference: '§718.111(12)(a)',
      },
    ]);

    const result = await checkAndAlertOverdueItems(COMMUNITY_ID, 'system', NOW);
    expect(result.overdueCount).toBe(0);
    expect(result.notifiedCount).toBe(0);
  });

  it('returns zero counts when no checklist items exist', async () => {
    setupChecklistMock([]);

    const result = await checkAndAlertOverdueItems(COMMUNITY_ID, 'system', NOW);
    expect(result.overdueCount).toBe(0);
    expect(result.notifiedCount).toBe(0);
  });

  // Bug 1 fix: N/A items must be excluded
  it('excludes items marked not applicable from overdue count', async () => {
    setupChecklistMock([
      {
        title: 'SIRS Report',
        description: 'Structural integrity reserve study',
        deadline: pastDate,
        documentId: null,
        documentPostedAt: null,
        rollingWindow: null,
        isApplicable: false,
        statuteReference: '§718.112(2)(g)',
      },
    ]);

    const result = await checkAndAlertOverdueItems(COMMUNITY_ID, 'system', NOW);
    expect(result.overdueCount).toBe(0);
    expect(result.notifiedCount).toBe(0);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  // Bug 2 fix: Rolling-window items with stale documents
  it('counts rolling-window item with stale document as overdue', async () => {
    setupChecklistMock([
      {
        title: 'Meeting Minutes',
        description: 'Rolling 12-month minutes',
        deadline: null,
        documentId: 100,
        documentPostedAt: new Date('2025-01-01T00:00:00.000Z').toISOString(), // 14+ months ago
        rollingWindow: { months: 12 },
        isApplicable: true,
        statuteReference: '§718.111(12)(g)(2)(e)',
      },
    ]);

    const result = await checkAndAlertOverdueItems(COMMUNITY_ID, 'system', NOW);
    expect(result.overdueCount).toBe(1);
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
  });

  // Bug 2 fix: Rolling-window items with fresh documents
  it('does not count rolling-window item with fresh document as overdue', async () => {
    setupChecklistMock([
      {
        title: 'Meeting Minutes',
        description: 'Rolling 12-month minutes',
        deadline: null,
        documentId: 100,
        documentPostedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(), // 2.5 months ago
        rollingWindow: { months: 12 },
        isApplicable: true,
        statuteReference: '§718.111(12)(g)(2)(e)',
      },
    ]);

    const result = await checkAndAlertOverdueItems(COMMUNITY_ID, 'system', NOW);
    expect(result.overdueCount).toBe(0);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  // Spam fix: Single digest per community
  it('sends single digest notification for multiple overdue items', async () => {
    setupChecklistMock([
      {
        title: 'Annual Budget',
        description: 'Budget posting',
        deadline: pastDate,
        documentId: null,
        documentPostedAt: null,
        rollingWindow: null,
        isApplicable: true,
        statuteReference: '§718.112(2)(f)',
      },
      {
        title: 'Financial Report',
        description: 'Annual report',
        deadline: pastDate,
        documentId: null,
        documentPostedAt: null,
        rollingWindow: null,
        isApplicable: true,
        statuteReference: '§718.111(13)',
      },
      {
        title: 'Insurance Policies',
        description: 'Current policies',
        deadline: pastDate,
        documentId: null,
        documentPostedAt: null,
        rollingWindow: null,
        isApplicable: true,
        statuteReference: '§718.111(11)',
      },
    ]);

    const result = await checkAndAlertOverdueItems(COMMUNITY_ID, 'system', NOW);
    expect(result.overdueCount).toBe(3);
    // Single digest — NOT 3 separate calls
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
  });

  // Digest event includes sourceId and sourceType for proper routing
  it('digest event includes sourceId and sourceType', async () => {
    setupChecklistMock([
      {
        title: 'Annual Budget',
        description: 'Budget posting',
        deadline: pastDate,
        documentId: null,
        documentPostedAt: null,
        rollingWindow: null,
        isApplicable: true,
        statuteReference: '§718.112(2)(f)',
      },
    ]);

    await checkAndAlertOverdueItems(COMMUNITY_ID, 'system', NOW);
    expect(sendNotificationMock).toHaveBeenCalledWith(
      COMMUNITY_ID,
      expect.objectContaining({
        type: 'compliance_alert',
        sourceType: 'compliance',
        sourceId: String(COMMUNITY_ID),
      }),
      'community_admins',
      'system',
    );
  });
});

describe('processComplianceAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendNotificationMock.mockResolvedValue(1);
  });

  function setupUnscopedMock(
    communityRows: Array<{ id: number; communityType: string }>,
  ) {
    createUnscopedClientMock.mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(communityRows),
        }),
      }),
    });
  }

  it('iterates only condo/HOA communities, skips apartments', async () => {
    setupUnscopedMock([
      { id: 1, communityType: 'condo_718' },
      { id: 2, communityType: 'hoa_720' },
      { id: 3, communityType: 'apartment' },
    ]);

    // Each compliance community returns 0 overdue items
    createScopedClientMock.mockReturnValue({
      query: vi.fn(async () => []),
    });

    const summary = await processComplianceAlerts(NOW);
    expect(summary.communitiesProcessed).toBe(2);
    expect(summary.errors).toBe(0);
    // Scoped client should be created for communities 1 and 2 only
    expect(createScopedClientMock).toHaveBeenCalledWith(1);
    expect(createScopedClientMock).toHaveBeenCalledWith(2);
    expect(createScopedClientMock).not.toHaveBeenCalledWith(3);
  });

  it('continues processing if one community throws', async () => {
    setupUnscopedMock([
      { id: 1, communityType: 'condo_718' },
      { id: 2, communityType: 'condo_718' },
    ]);

    let callCount = 0;
    createScopedClientMock.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          query: vi.fn(async () => { throw new Error('DB connection failed'); }),
        };
      }
      return {
        query: vi.fn(async () => []),
      };
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const summary = await processComplianceAlerts(NOW);
    expect(summary.communitiesProcessed).toBe(1);
    expect(summary.errors).toBe(1);
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });

  it('aggregates totals across communities', async () => {
    setupUnscopedMock([
      { id: 1, communityType: 'condo_718' },
      { id: 2, communityType: 'hoa_720' },
    ]);

    let callCount = 0;
    createScopedClientMock.mockImplementation(() => {
      callCount++;
      return {
        query: vi.fn(async () => {
          if (callCount === 1) {
            // Community 1: 3 overdue items
            return [
              { title: 'Budget', description: '', deadline: pastDate, documentId: null, documentPostedAt: null, rollingWindow: null, isApplicable: true, statuteReference: '§718.112(2)(f)' },
              { title: 'Report', description: '', deadline: pastDate, documentId: null, documentPostedAt: null, rollingWindow: null, isApplicable: true, statuteReference: '§718.111(13)' },
              { title: 'Insurance', description: '', deadline: pastDate, documentId: null, documentPostedAt: null, rollingWindow: null, isApplicable: true, statuteReference: '§718.111(11)' },
            ];
          }
          // Community 2: 2 overdue items
          return [
            { title: 'Covenants', description: '', deadline: pastDate, documentId: null, documentPostedAt: null, rollingWindow: null, isApplicable: true, statuteReference: '§720.303(4)' },
            { title: 'HOA Budget', description: '', deadline: pastDate, documentId: null, documentPostedAt: null, rollingWindow: null, isApplicable: true, statuteReference: '§720.303(6)' },
          ];
        }),
      };
    });

    const summary = await processComplianceAlerts(NOW);
    expect(summary.communitiesProcessed).toBe(2);
    expect(summary.totalOverdue).toBe(5);
    expect(summary.errors).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `pnpm test -- apps/web/__tests__/notifications/compliance-alert-service.test.ts`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/__tests__/notifications/compliance-alert-service.test.ts
git commit -m "test: rewrite compliance alert service tests for bugfix verification

- Rebuild mock structure (sendNotificationMock replaces sendEmailMock)
- Add N/A exclusion test (Bug 1)
- Add rolling-window stale/fresh document tests (Bug 2)
- Add single digest notification test (spam prevention)
- Add sourceId/sourceType verification test
- Add processComplianceAlerts tests (iteration, error isolation, aggregation)
- Delete contradictory 'sends one alert per overdue item' test"
```

---

### Task 3: Create cron route + tests

**Files:**
- Create: `apps/web/src/app/api/v1/internal/compliance-alerts/route.ts`
- Create: `apps/web/__tests__/cron/compliance-alerts-route.test.ts`

- [ ] **Step 1: Create the cron route**

Create `apps/web/src/app/api/v1/internal/compliance-alerts/route.ts`:

```typescript
/**
 * Daily cron: Check compliance checklist items for overdue entries
 * and send digest alerts to community admins.
 *
 * Runs at 07:30 UTC daily. Iterates all condo/HOA communities,
 * detects overdue items, and sends one digest notification per community.
 *
 * Schedule: 30 7 * * * (vercel.json)
 */
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

- [ ] **Step 2: Create the cron route tests**

Create `apps/web/__tests__/cron/compliance-alerts-route.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { processComplianceAlertsMock } = vi.hoisted(() => ({
  processComplianceAlertsMock: vi.fn(),
}));

vi.mock('@/lib/services/compliance-alert-service', () => ({
  processComplianceAlerts: processComplianceAlertsMock,
}));

import { POST } from '../../src/app/api/v1/internal/compliance-alerts/route';

describe('compliance-alerts cron route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.COMPLIANCE_CRON_SECRET = 'test-secret';
    processComplianceAlertsMock.mockResolvedValue({
      communitiesProcessed: 3,
      totalOverdue: 5,
      totalNotified: 9,
      errors: 0,
    });
  });

  it('returns 401 for missing bearer token', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/internal/compliance-alerts', {
      method: 'POST',
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 for wrong bearer token', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/internal/compliance-alerts', {
      method: 'POST',
      headers: { authorization: 'Bearer wrong-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('runs processor and returns structured summary for valid token', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/internal/compliance-alerts', {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data).toEqual(
      expect.objectContaining({
        communitiesProcessed: 3,
        totalOverdue: 5,
        totalNotified: 9,
        errors: 0,
      }),
    );
  });

  it('returns 500 when service throws', async () => {
    processComplianceAlertsMock.mockRejectedValue(new Error('DB connection failed'));
    const req = new NextRequest('http://localhost:3000/api/v1/internal/compliance-alerts', {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `pnpm test -- apps/web/__tests__/cron/compliance-alerts-route.test.ts`
Expected: All 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/v1/internal/compliance-alerts/route.ts apps/web/__tests__/cron/compliance-alerts-route.test.ts
git commit -m "feat: add compliance-alerts cron route

Daily cron at 07:30 UTC iterates condo/HOA communities and sends
digest alerts for overdue compliance items. Follows existing cron
pattern (requireCronSecret + thin service wrapper)."
```

---

### Task 4: Wire up vercel.json + DB access guard allowlist

**Files:**
- Modify: `apps/web/vercel.json`
- Modify: `scripts/verify-scoped-db-access.ts`

- [ ] **Step 1: Add cron entry to vercel.json**

In `apps/web/vercel.json`, add this entry at the end of the `crons` array (before the closing `]`):

```json
    {
      "path": "/api/v1/internal/compliance-alerts",
      "schedule": "30 7 * * *"
    }
```

- [ ] **Step 2: Add allowlist entry to verify-scoped-db-access.ts**

In `scripts/verify-scoped-db-access.ts`, add this entry to the `WEB_UNSAFE_IMPORT_ALLOWLIST` set, after the assessment-automation-service entry (after line 44):

```typescript
  // Compliance alert cron — cross-community overdue scanning
  resolve(repoRoot, 'apps/web/src/lib/services/compliance-alert-service.ts'),
```

- [ ] **Step 3: Add COMPLIANCE_CRON_SECRET to .env.example**

In `.env.example`, add after the existing `ASSESSMENT_CRON_SECRET` entry:

```
COMPLIANCE_CRON_SECRET=change-me
```

- [ ] **Step 4: Run the DB access guard**

Run: `pnpm guard:db-access`
Expected: PASS (no violations).

- [ ] **Step 5: Commit**

```bash
git add apps/web/vercel.json scripts/verify-scoped-db-access.ts .env.example
git commit -m "chore: wire compliance-alerts cron schedule + DB access allowlist

- Add 07:30 UTC daily cron for compliance alerts in vercel.json
- Allowlist compliance-alert-service.ts for unscoped DB import (community iteration)"
```

---

### Task 5: Fix stale CLAUDE.md reference

**Files:**
- Modify: `.claude/rules/florida-compliance.md`

- [ ] **Step 1: Fix the file reference**

In `.claude/rules/florida-compliance.md`, find and replace:

```
The compliance scoring system in `apps/web/src/lib/services/compliance-service.ts` tracks:
```

With:

```
The compliance scoring system in `apps/web/src/lib/utils/compliance-calculator.ts` tracks:
```

- [ ] **Step 2: Commit**

```bash
git add .claude/rules/florida-compliance.md
git commit -m "docs: fix stale compliance-service.ts reference in rules

The file was never created. Actual implementation lives in
compliance-calculator.ts (status logic) and compliance-alert-service.ts
(notifications)."
```

---

### Task 6: Run full test suite and verify

- [ ] **Step 1: Run all compliance-related tests**

Run: `pnpm test -- apps/web/__tests__/notifications/compliance-alert-service.test.ts apps/web/__tests__/cron/compliance-alerts-route.test.ts apps/web/__tests__/compliance/`
Expected: All tests pass.

- [ ] **Step 2: Run lint + typecheck + DB guard**

Run: `pnpm lint && pnpm typecheck && pnpm guard:db-access`
Expected: All pass with no errors.

- [ ] **Step 3: Run the full unit test suite**

Run: `pnpm test`
Expected: No regressions.
