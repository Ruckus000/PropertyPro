# Test Coverage Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all Tier 1 test coverage gaps (cron routes, assessment automation, stripe service) and at least half of Tier 2 (onboarding, emergency routes, hooks) identified in the test coverage verification audit.

**Architecture:** Cherry-pick 92 existing tests from `origin/claude/analyze-test-coverage-dkW2T`, then write new tests for cron route handlers, stripe-service, onboarding-service, and emergency broadcast routes. All tests are unit tests using vitest with mocked dependencies — no live database needed.

**Tech Stack:** Vitest, React Testing Library, `vi.mock()`/`vi.hoisted()` for mocking, `NextRequest` for route handler tests, `renderHook` for hook tests.

**Spec:** `docs/superpowers/specs/2026-03-22-test-coverage-remediation-design.md`

---

## Task 1: Branch Setup & Cherry-Pick [SEQUENTIAL — must complete before all other tasks]

**Files:**
- Modified: `.github/workflows/ci.yml` (CI coverage additions)
- Modified: `apps/web/vitest.config.ts` (coverage config)
- Created: 9 new test files + 2 load test files + 1 doc (from cherry-pick)

- [ ] **Step 1: Create feature branch from main**

```bash
git checkout main && git pull origin main
git checkout -b test/coverage-remediation
```

- [ ] **Step 2: Cherry-pick the 3 commits**

Commit 1 is doc-only (test coverage analysis). Commits 2 and 3 are the test files.

```bash
git cherry-pick 5091764
git cherry-pick 9a32f15
git cherry-pick 636882e
```

If any cherry-pick has conflicts:
- For `.github/workflows/ci.yml` or `vitest.config.ts`: resolve by keeping both our additions and theirs
- For test files (new files): conflicts unlikely since these are new files
- If irreconcilable: `git cherry-pick --abort` and note which commit failed — we'll rewrite those files manually

- [ ] **Step 3: Run the test suite to validate**

```bash
pnpm test
```

Expected: All existing 3,968+ tests pass, plus cherry-picked tests pass. Fix any failures.

- [ ] **Step 4: Run typecheck and lint**

```bash
pnpm typecheck && pnpm lint
```

Fix any issues introduced by cherry-pick.

- [ ] **Step 5: Verify hook tests from cherry-pick are present**

The cherry-pick brings in hook failure-path tests (Tier 2 §3c):
- `apps/web/src/hooks/__tests__/useDocumentUpload.test.ts` (340 lines, 7 tests)
- `apps/web/src/hooks/__tests__/useComplianceMutations.test.tsx` (418 lines, 10 tests)
- `apps/web/src/hooks/__tests__/use-finance.test.tsx` (295 lines, 8 tests)

Verify these files exist after cherry-pick. If any are missing (due to conflict), note which ones and we'll recreate them in a follow-up task.

- [ ] **Step 6: Commit any fixes**

```bash
git add -A && git commit -m "fix: resolve cherry-pick drift against current main"
```

Skip this step if no fixes were needed.

---

## Task 2: Cron Route Tests — Late Fee Processor [PARALLEL GROUP A]

**Files:**
- Create: `apps/web/__tests__/cron/late-fee-processor-route.test.ts`

**Reference pattern:** `apps/web/__tests__/notifications/digest-cron-route.test.ts`

**Route source:** `apps/web/src/app/api/v1/internal/late-fee-processor/route.ts` — thin wrapper that calls `requireCronSecret(req, process.env.ASSESSMENT_CRON_SECRET)` then `processLateFees()` and returns `{ data: summary }`.

- [ ] **Step 1: Create the test file**

```typescript
// apps/web/__tests__/cron/late-fee-processor-route.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { processLateFeesMock } = vi.hoisted(() => ({
  processLateFeesMock: vi.fn(),
}));

vi.mock('@/lib/services/assessment-automation-service', () => ({
  processLateFees: processLateFeesMock,
}));

import { POST } from '../../src/app/api/v1/internal/late-fee-processor/route';

describe('late-fee-processor cron route', () => {
  const url = 'http://localhost:3000/api/v1/internal/late-fee-processor';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ASSESSMENT_CRON_SECRET = 'test-secret';
    processLateFeesMock.mockResolvedValue({
      communitiesProcessed: 3,
      lineItemsCharged: 5,
      totalFeeCents: 25000,
    });
  });

  it('returns 401 for missing bearer token', async () => {
    const req = new NextRequest(url, { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(processLateFeesMock).not.toHaveBeenCalled();
  });

  it('returns 401 for wrong bearer token', async () => {
    const req = new NextRequest(url, {
      method: 'POST',
      headers: { authorization: 'Bearer wrong-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(processLateFeesMock).not.toHaveBeenCalled();
  });

  it('returns 401 when env var is undefined', async () => {
    delete process.env.ASSESSMENT_CRON_SECRET;
    const req = new NextRequest(url, {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('calls processLateFees and returns summary for valid token', async () => {
    const req = new NextRequest(url, {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data).toEqual(
      expect.objectContaining({
        communitiesProcessed: 3,
        lineItemsCharged: 5,
        totalFeeCents: 25000,
      }),
    );
    expect(processLateFeesMock).toHaveBeenCalledOnce();
  });

  it('propagates service errors through withErrorHandler', async () => {
    processLateFeesMock.mockRejectedValueOnce(new Error('DB connection failed'));
    const req = new NextRequest(url, {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  it('idempotency: calling twice invokes service twice (no route-level guard)', async () => {
    const makeReq = () =>
      new NextRequest(url, {
        method: 'POST',
        headers: { authorization: 'Bearer test-secret' },
      });
    await POST(makeReq());
    await POST(makeReq());
    expect(processLateFeesMock).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
pnpm exec vitest run apps/web/__tests__/cron/late-fee-processor-route.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/__tests__/cron/late-fee-processor-route.test.ts
git commit -m "test: add late-fee-processor cron route tests (auth, passthrough, error)"
```

---

## Task 3: Cron Route Tests — Generate Assessments [PARALLEL GROUP A]

**Files:**
- Create: `apps/web/__tests__/cron/generate-assessments-route.test.ts`

**Route source:** `apps/web/src/app/api/v1/internal/generate-assessments/route.ts` — calls `requireCronSecret(req, process.env.ASSESSMENT_CRON_SECRET)` then `processRecurringAssessments()`.

- [ ] **Step 1: Create the test file**

```typescript
// apps/web/__tests__/cron/generate-assessments-route.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { processRecurringAssessmentsMock } = vi.hoisted(() => ({
  processRecurringAssessmentsMock: vi.fn(),
}));

vi.mock('@/lib/services/assessment-automation-service', () => ({
  processRecurringAssessments: processRecurringAssessmentsMock,
}));

import { POST } from '../../src/app/api/v1/internal/generate-assessments/route';

describe('generate-assessments cron route', () => {
  const url = 'http://localhost:3000/api/v1/internal/generate-assessments';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ASSESSMENT_CRON_SECRET = 'test-secret';
    processRecurringAssessmentsMock.mockResolvedValue({
      communitiesProcessed: 2,
      assessmentsGenerated: 10,
      lineItemsCreated: 40,
    });
  });

  it('returns 401 for missing bearer token', async () => {
    const req = new NextRequest(url, { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(processRecurringAssessmentsMock).not.toHaveBeenCalled();
  });

  it('returns 401 for wrong bearer token', async () => {
    const req = new NextRequest(url, {
      method: 'POST',
      headers: { authorization: 'Bearer wrong-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('calls processRecurringAssessments and returns summary for valid token', async () => {
    const req = new NextRequest(url, {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data).toEqual(
      expect.objectContaining({
        communitiesProcessed: 2,
        assessmentsGenerated: 10,
        lineItemsCreated: 40,
      }),
    );
    expect(processRecurringAssessmentsMock).toHaveBeenCalledOnce();
  });

  it('propagates service errors through withErrorHandler', async () => {
    processRecurringAssessmentsMock.mockRejectedValueOnce(new Error('DB timeout'));
    const req = new NextRequest(url, {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 2: Run and verify**

```bash
pnpm exec vitest run apps/web/__tests__/cron/generate-assessments-route.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/__tests__/cron/generate-assessments-route.test.ts
git commit -m "test: add generate-assessments cron route tests"
```

---

## Task 4: Cron Route Tests — Assessment Overdue [PARALLEL GROUP A]

**Files:**
- Create: `apps/web/__tests__/cron/assessment-overdue-route.test.ts`

**Route source:** `apps/web/src/app/api/v1/internal/assessment-overdue/route.ts` — calls `processOverdueTransitions()` with `ASSESSMENT_CRON_SECRET`.

- [ ] **Step 1: Create the test file**

```typescript
// apps/web/__tests__/cron/assessment-overdue-route.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { processOverdueTransitionsMock } = vi.hoisted(() => ({
  processOverdueTransitionsMock: vi.fn(),
}));

vi.mock('@/lib/services/assessment-automation-service', () => ({
  processOverdueTransitions: processOverdueTransitionsMock,
}));

import { POST } from '../../src/app/api/v1/internal/assessment-overdue/route';

describe('assessment-overdue cron route', () => {
  const url = 'http://localhost:3000/api/v1/internal/assessment-overdue';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ASSESSMENT_CRON_SECRET = 'test-secret';
    processOverdueTransitionsMock.mockResolvedValue({
      communitiesProcessed: 4,
      lineItemsTransitioned: 8,
    });
  });

  it('returns 401 for missing bearer token', async () => {
    const req = new NextRequest(url, { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(processOverdueTransitionsMock).not.toHaveBeenCalled();
  });

  it('returns 401 for wrong bearer token', async () => {
    const req = new NextRequest(url, {
      method: 'POST',
      headers: { authorization: 'Bearer wrong-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('calls processOverdueTransitions and returns summary for valid token', async () => {
    const req = new NextRequest(url, {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data).toEqual(
      expect.objectContaining({
        communitiesProcessed: 4,
        lineItemsTransitioned: 8,
      }),
    );
    expect(processOverdueTransitionsMock).toHaveBeenCalledOnce();
  });

  it('handles zero overdue items gracefully', async () => {
    processOverdueTransitionsMock.mockResolvedValueOnce({
      communitiesProcessed: 4,
      lineItemsTransitioned: 0,
    });
    const req = new NextRequest(url, {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data).toEqual(
      expect.objectContaining({ lineItemsTransitioned: 0 }),
    );
  });

  it('propagates service errors through withErrorHandler', async () => {
    processOverdueTransitionsMock.mockRejectedValueOnce(new Error('DB error'));
    const req = new NextRequest(url, {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 2: Run and verify**

```bash
pnpm exec vitest run apps/web/__tests__/cron/assessment-overdue-route.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/__tests__/cron/assessment-overdue-route.test.ts
git commit -m "test: add assessment-overdue cron route tests"
```

---

## Task 5: Cron Route Tests — Assessment Due Reminders [PARALLEL GROUP A]

**Files:**
- Create: `apps/web/__tests__/cron/assessment-due-reminders-route.test.ts`

**Route source:** `apps/web/src/app/api/v1/internal/assessment-due-reminders/route.ts` — calls `processAssessmentDueReminders()` with `ASSESSMENT_CRON_SECRET`.

- [ ] **Step 1: Create the test file**

```typescript
// apps/web/__tests__/cron/assessment-due-reminders-route.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { processAssessmentDueRemindersMock } = vi.hoisted(() => ({
  processAssessmentDueRemindersMock: vi.fn(),
}));

vi.mock('@/lib/services/assessment-automation-service', () => ({
  processAssessmentDueReminders: processAssessmentDueRemindersMock,
}));

import { POST } from '../../src/app/api/v1/internal/assessment-due-reminders/route';

describe('assessment-due-reminders cron route', () => {
  const url = 'http://localhost:3000/api/v1/internal/assessment-due-reminders';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ASSESSMENT_CRON_SECRET = 'test-secret';
    processAssessmentDueRemindersMock.mockResolvedValue({
      communitiesProcessed: 3,
      remindersSent: 12,
    });
  });

  it('returns 401 for missing bearer token', async () => {
    const req = new NextRequest(url, { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(processAssessmentDueRemindersMock).not.toHaveBeenCalled();
  });

  it('returns 401 for wrong bearer token', async () => {
    const req = new NextRequest(url, {
      method: 'POST',
      headers: { authorization: 'Bearer wrong-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('calls processAssessmentDueReminders and returns summary for valid token', async () => {
    const req = new NextRequest(url, {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data).toEqual(
      expect.objectContaining({
        communitiesProcessed: 3,
        remindersSent: 12,
      }),
    );
    expect(processAssessmentDueRemindersMock).toHaveBeenCalledOnce();
  });

  it('handles no reminders needed gracefully', async () => {
    processAssessmentDueRemindersMock.mockResolvedValueOnce({
      communitiesProcessed: 3,
      remindersSent: 0,
    });
    const req = new NextRequest(url, {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('propagates service errors through withErrorHandler', async () => {
    processAssessmentDueRemindersMock.mockRejectedValueOnce(new Error('Email service down'));
    const req = new NextRequest(url, {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 2: Run and verify**

```bash
pnpm exec vitest run apps/web/__tests__/cron/assessment-due-reminders-route.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/__tests__/cron/assessment-due-reminders-route.test.ts
git commit -m "test: add assessment-due-reminders cron route tests"
```

---

## Task 6: Cron Route Tests — Payment Reminders [PARALLEL GROUP A]

**Files:**
- Create: `apps/web/__tests__/cron/payment-reminders-route.test.ts`

**Route source:** `apps/web/src/app/api/v1/internal/payment-reminders/route.ts` — calls `processPaymentReminders()` with `PAYMENT_REMINDERS_CRON_SECRET` (different env var from assessment routes).

- [ ] **Step 1: Create the test file**

```typescript
// apps/web/__tests__/cron/payment-reminders-route.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { processPaymentRemindersMock } = vi.hoisted(() => ({
  processPaymentRemindersMock: vi.fn(),
}));

vi.mock('@/lib/services/payment-alert-scheduler', () => ({
  processPaymentReminders: processPaymentRemindersMock,
}));

import { POST } from '../../src/app/api/v1/internal/payment-reminders/route';

describe('payment-reminders cron route', () => {
  const url = 'http://localhost:3000/api/v1/internal/payment-reminders';

  beforeEach(() => {
    vi.clearAllMocks();
    // NOTE: Different env var from assessment cron routes
    process.env.PAYMENT_REMINDERS_CRON_SECRET = 'test-secret';
    processPaymentRemindersMock.mockResolvedValue({
      communitiesScanned: 5,
      emailsSent: 20,
      errors: 0,
    });
  });

  it('returns 401 for missing bearer token', async () => {
    const req = new NextRequest(url, { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(processPaymentRemindersMock).not.toHaveBeenCalled();
  });

  it('returns 401 for wrong bearer token', async () => {
    const req = new NextRequest(url, {
      method: 'POST',
      headers: { authorization: 'Bearer wrong-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 when ASSESSMENT_CRON_SECRET is set but PAYMENT_REMINDERS_CRON_SECRET is not', async () => {
    delete process.env.PAYMENT_REMINDERS_CRON_SECRET;
    process.env.ASSESSMENT_CRON_SECRET = 'test-secret';
    const req = new NextRequest(url, {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('calls processPaymentReminders and returns summary for valid token', async () => {
    const req = new NextRequest(url, {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data).toEqual(
      expect.objectContaining({
        communitiesScanned: 5,
        emailsSent: 20,
      }),
    );
    expect(processPaymentRemindersMock).toHaveBeenCalledOnce();
  });

  it('propagates service errors through withErrorHandler', async () => {
    processPaymentRemindersMock.mockRejectedValueOnce(new Error('Stripe API down'));
    const req = new NextRequest(url, {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 2: Run and verify**

```bash
pnpm exec vitest run apps/web/__tests__/cron/payment-reminders-route.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/__tests__/cron/payment-reminders-route.test.ts
git commit -m "test: add payment-reminders cron route tests (uses PAYMENT_REMINDERS_CRON_SECRET)"
```

---

## Task 7: Cron Route Tests — Expire Demos [PARALLEL GROUP A]

**Files:**
- Create: `apps/web/__tests__/cron/expire-demos-route.test.ts`

**Route source:** `apps/web/src/app/api/v1/internal/expire-demos/route.ts` — this route has INLINE DB logic (not delegated to a service). It uses `createUnscopedClient`, `createAdminClient`, and queries `communities`, `demoInstances`, `accessRequests` directly. Uses `DEMO_EXPIRY_CRON_SECRET`.

- [ ] **Step 1: Create the test file**

```typescript
// apps/web/__tests__/cron/expire-demos-route.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockSelect, mockUpdate, mockSet, mockWhere, mockReturning,
  mockFrom, mockInnerJoin, mockUpdateUserById,
  createUnscopedClientMock, createAdminClientMock,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockUpdate: vi.fn(),
  mockSet: vi.fn(),
  mockWhere: vi.fn(),
  mockReturning: vi.fn(),
  mockFrom: vi.fn(),
  mockInnerJoin: vi.fn(),
  mockUpdateUserById: vi.fn(),
  createUnscopedClientMock: vi.fn(),
  createAdminClientMock: vi.fn(),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: createUnscopedClientMock,
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock('@propertypro/db', () => ({
  demoInstances: { id: 'demoInstances.id', seededCommunityId: 'demoInstances.seededCommunityId', deletedAt: 'demoInstances.deletedAt', demoResidentUserId: 'demoInstances.demoResidentUserId', demoBoardUserId: 'demoInstances.demoBoardUserId' },
  communities: { id: 'communities.id', isDemo: 'communities.isDemo', demoExpiresAt: 'communities.demoExpiresAt', deletedAt: 'communities.deletedAt' },
  accessRequests: { id: 'accessRequests.id', status: 'accessRequests.status', createdAt: 'accessRequests.createdAt', deletedAt: 'accessRequests.deletedAt' },
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  isNull: vi.fn((arg: unknown) => ({ type: 'isNull', arg })),
  lt: vi.fn((...args: unknown[]) => ({ type: 'lt', args })),
  inArray: vi.fn((...args: unknown[]) => ({ type: 'inArray', args })),
  sql: (strings: TemplateStringsArray) => strings[0],
}));

import { POST } from '../../src/app/api/v1/internal/expire-demos/route';

describe('expire-demos cron route', () => {
  const url = 'http://localhost:3000/api/v1/internal/expire-demos';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DEMO_EXPIRY_CRON_SECRET = 'test-secret';

    // Setup DB mock chain
    mockWhere.mockResolvedValue([]);
    mockReturning.mockResolvedValue([]);
    mockSet.mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });
    mockInnerJoin.mockReturnValue({ where: mockWhere });
    mockFrom.mockReturnValue({ innerJoin: mockInnerJoin });
    mockSelect.mockReturnValue({ from: mockFrom });

    createUnscopedClientMock.mockReturnValue({
      select: mockSelect,
      update: mockUpdate,
    });

    createAdminClientMock.mockReturnValue({
      auth: { admin: { updateUserById: mockUpdateUserById } },
    });
  });

  it('returns 401 for missing bearer token', async () => {
    const req = new NextRequest(url, { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 for wrong bearer token', async () => {
    const req = new NextRequest(url, {
      method: 'POST',
      headers: { authorization: 'Bearer wrong-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns success with zero expired when no demos are expired', async () => {
    mockWhere.mockResolvedValueOnce([]); // no expired communities
    // For the access request update, return empty
    mockReturning.mockResolvedValueOnce([]);
    mockWhere.mockReturnValueOnce({ returning: mockReturning });
    mockSet.mockReturnValueOnce({ where: mockWhere });

    const req = new NextRequest(url, {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { expired: number; expiredRequests: number } };
    expect(json.data.expired).toBe(0);
  });

  it('soft-deletes expired communities and bans demo users', async () => {
    // Return one expired community
    mockWhere.mockResolvedValueOnce([
      {
        communityId: 1,
        demoInstanceId: 10,
        demoResidentUserId: 'user-resident-1',
        demoBoardUserId: 'user-board-1',
      },
    ]);
    // Community soft-delete
    mockWhere.mockResolvedValueOnce(undefined);
    // Demo instance soft-delete
    mockWhere.mockResolvedValueOnce(undefined);
    // Ban calls succeed
    mockUpdateUserById.mockResolvedValue({});
    // Access request expiry
    mockReturning.mockResolvedValueOnce([{ id: 5 }]);
    mockWhere.mockReturnValueOnce({ returning: mockReturning });
    mockSet.mockReturnValueOnce({ where: mockWhere });

    const req = new NextRequest(url, {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { expired: number; expiredRequests: number } };
    expect(json.data.expired).toBe(1);
    expect(json.data.expiredRequests).toBe(1);
    expect(mockUpdateUserById).toHaveBeenCalledTimes(2);
  });

  it('continues processing if banning a user fails (non-fatal)', async () => {
    mockWhere.mockResolvedValueOnce([
      {
        communityId: 1,
        demoInstanceId: 10,
        demoResidentUserId: 'user-1',
        demoBoardUserId: null,
      },
    ]);
    mockWhere.mockResolvedValueOnce(undefined);
    mockWhere.mockResolvedValueOnce(undefined);
    mockUpdateUserById.mockRejectedValueOnce(new Error('user already deleted'));
    mockReturning.mockResolvedValueOnce([]);
    mockWhere.mockReturnValueOnce({ returning: mockReturning });
    mockSet.mockReturnValueOnce({ where: mockWhere });

    const req = new NextRequest(url, {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { expired: number } };
    expect(json.data.expired).toBe(1);
  });
});
```

- [ ] **Step 2: Run and verify**

```bash
pnpm exec vitest run apps/web/__tests__/cron/expire-demos-route.test.ts
```

Expected: 5 tests pass. If mock chain issues arise, adjust the mock setup to match actual Drizzle query chain shape.

- [ ] **Step 3: Commit**

```bash
git add apps/web/__tests__/cron/expire-demos-route.test.ts
git commit -m "test: add expire-demos cron route tests (auth, soft-delete, ban resilience)"
```

---

## Task 8: Assessment Automation — processRecurringAssessments Tests [PARALLEL GROUP B]

**Files:**
- Modify: `apps/web/__tests__/finance/assessment-automation.test.ts`

**Context:** The existing test file already covers `processOverdueTransitions`, `processLateFees`, and `processAssessmentDueReminders`. The function `processRecurringAssessments` has ZERO coverage. Read the existing file first to understand its mock setup, then add a new `describe` block.

**Service source:** `apps/web/src/lib/services/assessment-automation-service.ts` — `processRecurringAssessments()` iterates all communities via `createUnscopedClient`, finds active recurring assessments, then for each uses `createScopedClient(communityId)` to generate line items for the current period.

- [ ] **Step 1: Read the existing test file**

```bash
cat apps/web/__tests__/finance/assessment-automation.test.ts
```

Understand the mock setup (`vi.hoisted`, `vi.mock` patterns, `buildMockDb` helper if present). Also read the `processRecurringAssessments` function body:

```bash
grep -A 100 'export async function processRecurringAssessments' apps/web/src/lib/services/assessment-automation-service.ts
```

- [ ] **Step 2: Add a describe block for processRecurringAssessments**

Add this at the end of the existing test file, reusing its mock infrastructure. The function:
1. Calls `createUnscopedClient()` to scan all communities for active recurring assessments
2. For each, calls `createScopedClient(communityId)` to generate line items for the current period
3. Returns `RecurringAssessmentSummary` with fields: `communitiesScanned`, `assessmentsProcessed`, `totalInserted`, `totalSkipped`, `errors`

The agent MUST read the existing test file (`apps/web/__tests__/finance/assessment-automation.test.ts`) and the service function (`apps/web/src/lib/services/assessment-automation-service.ts`, search for `processRecurringAssessments`) to understand the exact DB query chains and adapt the existing mock helpers.

Key test cases to implement:

```typescript
describe('processRecurringAssessments', () => {
  it('returns zero totals when no active recurring assessments exist', async () => {
    // Mock unscopedClient query chain to return empty array
    // Call processRecurringAssessments()
    const result = await processRecurringAssessments();
    expect(result.communitiesScanned).toBeGreaterThanOrEqual(0);
    expect(result.totalInserted).toBe(0);
    expect(result.totalSkipped).toBe(0);
  });

  it('generates line items for each unit in a community with active assessment', async () => {
    // Mock unscopedClient to return 1 community with 1 active monthly assessment
    // Mock scopedClient to return 3 units for that community
    // Mock insert chain to succeed
    const result = await processRecurringAssessments();
    expect(result.totalInserted).toBe(3); // one line item per unit
    expect(result.assessmentsProcessed).toBe(1);
  });

  it('skips assessments that already have line items for current period (idempotency)', async () => {
    // Mock unscopedClient to return 1 assessment
    // Mock scopedClient line_items query to return existing items for current month
    const result = await processRecurringAssessments();
    expect(result.totalSkipped).toBeGreaterThan(0);
    expect(result.totalInserted).toBe(0);
  });

  it('handles errors in one community without stopping others', async () => {
    // Mock 2 communities: first throws, second succeeds
    const result = await processRecurringAssessments();
    expect(result.errors).toBeGreaterThan(0);
    expect(result.communitiesScanned).toBe(2);
  });
});
```

The agent must fill in the actual mock setup by reading the existing file's `buildMockDb` helper or equivalent and the `processRecurringAssessments` function body.

- [ ] **Step 3: Run the full assessment automation test suite**

```bash
pnpm exec vitest run apps/web/__tests__/finance/assessment-automation.test.ts
```

Expected: All existing tests still pass + new tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/__tests__/finance/assessment-automation.test.ts
git commit -m "test: add processRecurringAssessments coverage (monthly billing generation)"
```

---

## Task 9: Stripe Service Tests [PARALLEL GROUP B]

**Files:**
- Create: `apps/web/__tests__/billing/stripe-service.test.ts`

**Service source:** `apps/web/src/lib/services/stripe-service.ts` — exports `getStripeClient()`, `createEmbeddedCheckoutSession()`, `retrieveCheckoutSession()`, `retrieveSubscription()`, `retrieveInvoice()`, `createBillingPortalSession()`. Uses Stripe SDK via `new Stripe(secretKey)`.

- [ ] **Step 1: Create the test file**

```typescript
// apps/web/__tests__/billing/stripe-service.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCheckoutCreate, mockCheckoutRetrieve, mockSubRetrieve,
  mockInvoiceRetrieve, mockPortalCreate,
  mockDbUpdate, mockDbSet, mockDbWhere,
} = vi.hoisted(() => ({
  mockCheckoutCreate: vi.fn(),
  mockCheckoutRetrieve: vi.fn(),
  mockSubRetrieve: vi.fn(),
  mockInvoiceRetrieve: vi.fn(),
  mockPortalCreate: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbSet: vi.fn(),
  mockDbWhere: vi.fn(),
}));

vi.mock('stripe', () => ({
  default: vi.fn(() => ({
    checkout: { sessions: { create: mockCheckoutCreate, retrieve: mockCheckoutRetrieve } },
    subscriptions: { retrieve: mockSubRetrieve },
    invoices: { retrieve: mockInvoiceRetrieve },
    billingPortal: { sessions: { create: mockPortalCreate } },
  })),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: vi.fn(() => ({
    update: mockDbUpdate,
  })),
}));

vi.mock('@propertypro/db', () => ({
  pendingSignups: { signupRequestId: 'pendingSignups.signupRequestId' },
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
}));

describe('stripe-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
    process.env.STRIPE_PRICE_COMPLIANCE_BASIC = 'price_test_basic';
    // DB mock chain: update().set().where()
    mockDbWhere.mockResolvedValue(undefined);
    mockDbSet.mockReturnValue({ where: mockDbWhere });
    mockDbUpdate.mockReturnValue({ set: mockDbSet });
  });

  describe('createEmbeddedCheckoutSession', () => {
    it('creates a checkout session and returns clientSecret', async () => {
      mockCheckoutCreate.mockResolvedValueOnce({
        client_secret: 'cs_test_secret',
        id: 'cs_123',
      });

      const { createEmbeddedCheckoutSession } = await import(
        '../../src/lib/services/stripe-service'
      );
      const result = await createEmbeddedCheckoutSession(
        'signup-req-1',          // signupRequestId
        'condo_718',             // communityType
        'compliance_basic',      // planId
        'sunset-condos',         // candidateSlug
        'test@example.com',      // customerEmail
        'http://localhost:3000',  // returnBaseUrl
      );

      expect(result).toEqual({ clientSecret: 'cs_test_secret', sessionId: 'cs_123' });
      expect(mockCheckoutCreate).toHaveBeenCalledOnce();
      // Verify DB update for pending_signups status
      expect(mockDbUpdate).toHaveBeenCalled();
    });

    it('throws when Stripe API returns error', async () => {
      mockCheckoutCreate.mockRejectedValueOnce(new Error('Invalid price'));

      const { createEmbeddedCheckoutSession } = await import(
        '../../src/lib/services/stripe-service'
      );
      await expect(
        createEmbeddedCheckoutSession(
          'signup-req-1', 'condo_718', 'compliance_basic',
          'sunset-condos', 'test@example.com', 'http://localhost:3000',
        ),
      ).rejects.toThrow('Invalid price');
    });

    it('throws when client_secret is missing from Stripe response', async () => {
      mockCheckoutCreate.mockResolvedValueOnce({ id: 'cs_123', client_secret: null });

      const { createEmbeddedCheckoutSession } = await import(
        '../../src/lib/services/stripe-service'
      );
      await expect(
        createEmbeddedCheckoutSession(
          'signup-req-1', 'condo_718', 'compliance_basic',
          'sunset-condos', 'test@example.com', 'http://localhost:3000',
        ),
      ).rejects.toThrow('client_secret');
    });

    it('throws when price env var is not configured for plan', async () => {
      delete process.env.STRIPE_PRICE_COMPLIANCE_BASIC;

      const { createEmbeddedCheckoutSession } = await import(
        '../../src/lib/services/stripe-service'
      );
      await expect(
        createEmbeddedCheckoutSession(
          'signup-req-1', 'condo_718', 'compliance_basic',
          'sunset-condos', 'test@example.com', 'http://localhost:3000',
        ),
      ).rejects.toThrow('not configured');
    });
  });

  describe('retrieveCheckoutSession', () => {
    it('retrieves session by ID with expansions', async () => {
      mockCheckoutRetrieve.mockResolvedValueOnce({
        id: 'cs_123', status: 'complete', customer: 'cus_123',
      });

      const { retrieveCheckoutSession } = await import('../../src/lib/services/stripe-service');
      const session = await retrieveCheckoutSession('cs_123');
      expect(session.id).toBe('cs_123');
      expect(mockCheckoutRetrieve).toHaveBeenCalledWith('cs_123', {
        expand: ['line_items', 'subscription'],
      });
    });
  });

  describe('retrieveSubscription', () => {
    it('retrieves subscription by ID with latest_invoice expanded', async () => {
      mockSubRetrieve.mockResolvedValueOnce({
        id: 'sub_123', status: 'active',
      });

      const { retrieveSubscription } = await import('../../src/lib/services/stripe-service');
      const sub = await retrieveSubscription('sub_123');
      expect(sub.id).toBe('sub_123');
      expect(mockSubRetrieve).toHaveBeenCalledWith('sub_123', {
        expand: ['latest_invoice'],
      });
    });
  });

  describe('retrieveInvoice', () => {
    it('retrieves invoice by ID', async () => {
      mockInvoiceRetrieve.mockResolvedValueOnce({ id: 'in_123', amount_due: 5000 });

      const { retrieveInvoice } = await import('../../src/lib/services/stripe-service');
      const invoice = await retrieveInvoice('in_123');
      expect(invoice.id).toBe('in_123');
    });
  });

  describe('createBillingPortalSession', () => {
    it('creates a portal session with positional args', async () => {
      mockPortalCreate.mockResolvedValueOnce({
        url: 'https://billing.stripe.com/session/test',
      });

      const { createBillingPortalSession } = await import('../../src/lib/services/stripe-service');
      const session = await createBillingPortalSession(
        'cus_123',
        'http://localhost:3000/settings/billing',
      );
      expect(session.url).toContain('stripe.com');
      expect(mockPortalCreate).toHaveBeenCalledWith({
        customer: 'cus_123',
        return_url: 'http://localhost:3000/settings/billing',
      });
    });
  });

  describe('getStripeClient', () => {
    it('throws when STRIPE_SECRET_KEY is not set', async () => {
      delete process.env.STRIPE_SECRET_KEY;
      const mod = await import('../../src/lib/services/stripe-service');
      expect(() => mod.getStripeClient()).toThrow('STRIPE_SECRET_KEY');
    });
  });
});
```

**Note to agent:** The module uses a lazy singleton. `vi.resetModules()` in `beforeEach` ensures each test gets a fresh import. If the singleton persists across tests, wrap each test's import in a dynamic `await import()` call (already done above).

- [ ] **Step 2: Run and verify**

```bash
pnpm exec vitest run apps/web/__tests__/billing/stripe-service.test.ts
```

Expected: 7 tests pass. If import/mock issues arise, check whether the module uses a singleton pattern and adjust `vi.resetModules()` usage.

- [ ] **Step 3: Commit**

```bash
git add apps/web/__tests__/billing/stripe-service.test.ts
git commit -m "test: add stripe-service unit tests (checkout, portal, retrieval, errors)"
```

---

## Task 10: Onboarding Service Tests [PARALLEL GROUP B]

**Files:**
- Create: `apps/web/__tests__/services/onboarding-service.test.ts`

**Service source:** `apps/web/src/lib/services/onboarding-service.ts` — exports `createOnboardingInvitation()` and `createOnboardingResident()`. Uses `createScopedClient`, `createAdminClient`, email service. Private helpers `resolveDisplayTitle` and `addDays` are tested indirectly.

- [ ] **Step 1: Read the service source**

```bash
cat apps/web/src/lib/services/onboarding-service.ts
```

Understand the function signatures, DB interactions, email calls, and audit logging.

- [ ] **Step 2: Create the test file**

The exact mock setup depends on what the service imports. The general structure:

```typescript
// apps/web/__tests__/services/onboarding-service.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist mocks
const { createScopedClientMock, createAdminClientMock, sendEmailMock, logAuditEventMock } =
  vi.hoisted(() => ({
    createScopedClientMock: vi.fn(),
    createAdminClientMock: vi.fn(),
    sendEmailMock: vi.fn(),
    logAuditEventMock: vi.fn(),
  }));

// Mock modules — adjust import paths to match actual service imports
vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  // Include schema tables as needed
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
}));

// Mock email — check actual import path in the service
vi.mock('@propertypro/email', () => ({
  sendEmail: sendEmailMock,
}));

import {
  createOnboardingInvitation,
  createOnboardingResident,
} from '../../src/lib/services/onboarding-service';

describe('onboarding-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendEmailMock.mockResolvedValue({ id: 'email-123' });
    logAuditEventMock.mockResolvedValue(undefined);
  });

  describe('createOnboardingInvitation', () => {
    it('creates invitation, sends email, and returns token', async () => {
      // Setup DB mocks for inserting invitation row
      // Setup email mock
      // Call createOnboardingInvitation({ communityId, email, role, ... })
      // Assert: DB insert called, email sent, audit logged, token returned
    });

    it('handles duplicate email gracefully', async () => {
      // Mock DB to return existing invitation for same email
      // Assert: returns existing or throws appropriate error
    });
  });

  describe('createOnboardingResident', () => {
    it('creates user and assigns role in community', async () => {
      // Setup admin client mock for user creation
      // Setup scoped client mock for role assignment
      // Call createOnboardingResident(...)
      // Assert: user created, role assigned, audit logged
    });

    it('validates required fields', async () => {
      // Call with missing required fields
      // Assert: throws validation error
    });

    it('resolveDisplayTitle is exercised through resident creation', async () => {
      // Call with specific name combinations that exercise resolveDisplayTitle paths
      // Assert: correct display title in DB insert
    });

    it('addDays is exercised through invitation expiry', async () => {
      // Call createOnboardingInvitation and verify the expiry date is correct
      // (e.g., 7 days from now)
    });
  });
});
```

**Note to agent:** Read the actual service source first. The mock setup, function parameters, and assertion shapes must match the real implementation. The pseudocode above shows the structure; fill in actual values from the source.

- [ ] **Step 3: Run and verify**

```bash
pnpm exec vitest run apps/web/__tests__/services/onboarding-service.test.ts
```

Expected: 6+ tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/__tests__/services/onboarding-service.test.ts
git commit -m "test: add onboarding-service tests (invitation, resident creation, edge cases)"
```

---

## Task 11: Emergency Broadcast Route Tests [PARALLEL GROUP B]

**Files:**
- Create: `apps/web/__tests__/emergency/emergency-broadcast-routes.test.ts`

**Route sources:**
- `apps/web/src/app/api/v1/emergency-broadcasts/route.ts` — GET (list) + POST (create draft)
- `apps/web/src/app/api/v1/emergency-broadcasts/[id]/send/route.ts` — POST (execute broadcast)
- `apps/web/src/app/api/v1/emergency-broadcasts/[id]/cancel/route.ts` — POST (cancel within undo window)

**Important:** These routes use `requirePermission`, `withErrorHandler`, and call the emergency-broadcast-service. The service is already tested (`emergency-broadcast-service.test.ts`), so route tests focus on auth, validation, and HTTP layer.

- [ ] **Step 1: Read the route source files**

```bash
cat apps/web/src/app/api/v1/emergency-broadcasts/route.ts
cat apps/web/src/app/api/v1/emergency-broadcasts/\[id\]/send/route.ts
cat apps/web/src/app/api/v1/emergency-broadcasts/\[id\]/cancel/route.ts
```

Understand: what gets imported, how auth works (middleware vs inline), what service functions are called.

- [ ] **Step 2: Create the test file**

```typescript
// apps/web/__tests__/emergency/emergency-broadcast-routes.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  listBroadcastsMock,
  createBroadcastMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requirePermissionMock,
  resolveEffectiveCommunityIdMock,
} = vi.hoisted(() => ({
  listBroadcastsMock: vi.fn(),
  createBroadcastMock: vi.fn(),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
}));

vi.mock('@/lib/services/emergency-broadcast-service', () => ({
  listBroadcasts: listBroadcastsMock,
  createBroadcast: createBroadcastMock,
}));

// Auth mocks — actual import paths from the route source
vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: resolveEffectiveCommunityIdMock,
}));

import { GET, POST } from '../../src/app/api/v1/emergency-broadcasts/route';

describe('emergency-broadcast routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue({
      userId: 'user-1',
      communityId: 1,
      role: 'cam',
    });
    requirePermissionMock.mockReturnValue(undefined); // no throw = permitted
    resolveEffectiveCommunityIdMock.mockReturnValue(1);
  });

  describe('GET /emergency-broadcasts', () => {
    it('returns paginated list of broadcasts', async () => {
      listBroadcastsMock.mockResolvedValueOnce({
        broadcasts: [{ id: 1, title: 'Test Alert', severity: 'emergency' }],
        total: 1,
      });

      const req = new NextRequest(
        'http://localhost:3000/api/v1/emergency-broadcasts?communityId=1&limit=10&offset=0',
      );
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toHaveLength(1);
      expect(json.total).toBe(1);
    });

    it('returns validation error when communityId is missing', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/emergency-broadcasts',
      );
      const res = await GET(req);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });

  describe('POST /emergency-broadcasts', () => {
    it('creates a draft broadcast with valid input', async () => {
      createBroadcastMock.mockResolvedValueOnce({
        id: 1,
        title: 'Weather Alert',
        status: 'draft',
      });

      const req = new NextRequest('http://localhost:3000/api/v1/emergency-broadcasts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          communityId: 1,
          title: 'Weather Alert',
          body: 'Severe weather warning for the area.',
          severity: 'emergency',
          targetAudience: 'all',
          channels: ['sms', 'email'],
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(201);
      expect(createBroadcastMock).toHaveBeenCalledOnce();
    });

    it('returns 422 for missing required fields', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/emergency-broadcasts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId: 1, title: '' }),
      });
      const res = await POST(req);
      expect(res.status).toBe(422);
    });

    it('returns 422 for invalid severity value', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/emergency-broadcasts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          communityId: 1,
          title: 'Test',
          body: 'Test body',
          severity: 'invalid_severity',
          targetAudience: 'all',
          channels: ['email'],
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(422);
    });
  });
});
```

**Note to agent:** Read the actual route files for send (`[id]/send/route.ts`) and cancel (`[id]/cancel/route.ts`) to add tests for those endpoints too. They follow the same auth pattern but with different service calls. Add them as additional `describe` blocks in this file or a separate file.

- [ ] **Step 3: Run and verify**

```bash
pnpm exec vitest run apps/web/__tests__/emergency/emergency-broadcast-routes.test.ts
```

Expected: 4+ tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/__tests__/emergency/emergency-broadcast-routes.test.ts
git commit -m "test: add emergency broadcast route tests (list, create, validation)"
```

---

## Task 12: Final Verification & PR [SEQUENTIAL — runs after all other tasks]

- [ ] **Step 1: Run the full test suite**

```bash
pnpm test
```

Expected: All tests pass (original 3,968 + cherry-picked ~92 + new ~50).

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

Expected: No type errors.

- [ ] **Step 3: Run lint + DB access guard**

```bash
pnpm lint
```

Expected: Clean. If new test files import from `@propertypro/db` directly (not via `createScopedClient`), check if the import pattern is in the allowlist at `scripts/verify-scoped-db-access.ts`. Test files typically are allowed.

- [ ] **Step 4: Run build**

```bash
pnpm build
```

Expected: Clean build.

- [ ] **Step 5: Verify Tier 2 coverage (at least 3 of 5)**

Confirm these Tier 2 items are covered:
1. Onboarding service tests (Task 10)
2. Emergency broadcast route tests (Task 11)
3. Hook failure-path tests (from cherry-pick in Task 1 — useDocumentUpload, useComplianceMutations, use-finance)

That's 3 of 5, meeting the spec's success criterion.

- [ ] **Step 6: Push branch and create PR**

```bash
git push -u origin test/coverage-remediation
```

Then create PR with:
- Title: "test: close Tier 1 test coverage gaps — cron routes, services, cherry-pick 92 tests"
- Description summarizing: cherry-picked tests, new cron route tests, new service tests, coverage improvements
- Reference the audit: `docs/audits/test-coverage-verification-2026-03-22.md`

---

## Parallel Execution Map

```
Task 1 (branch setup + cherry-pick)
  │
  ├─── PARALLEL GROUP A (cron routes) ──────────────────────────────┐
  │    Task 2: late-fee-processor-route.test.ts                     │
  │    Task 3: generate-assessments-route.test.ts                   │
  │    Task 4: assessment-overdue-route.test.ts                     │
  │    Task 5: assessment-due-reminders-route.test.ts               │
  │    Task 6: payment-reminders-route.test.ts                      │
  │    Task 7: expire-demos-route.test.ts                           │
  │                                                                 │
  ├─── PARALLEL GROUP B (services + routes) ────────────────────────┤
  │    Task 8: assessment-automation processRecurringAssessments     │
  │    Task 9: stripe-service.test.ts                               │
  │    Task 10: onboarding-service.test.ts                          │
  │    Task 11: emergency-broadcast-routes.test.ts                  │
  │                                                                 │
  └─── All complete ───────────────────────────────────────────────►│
                                                                    │
  Task 12 (verification + PR) ◄────────────────────────────────────┘
```

Groups A and B can run simultaneously — all 10 tasks are independent. They create different files and modify different test suites.
