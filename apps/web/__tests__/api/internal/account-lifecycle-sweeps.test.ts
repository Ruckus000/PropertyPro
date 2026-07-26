/**
 * Account-lifecycle cron — the site-editor retention sweeps (steps 4 and 5).
 *
 * This route previously had no test at all, so the `cleanupSoftDeletedSiteBlocks`
 * wiring was unverified too; both sweeps are covered here.
 *
 * The property that matters is ISOLATION between phases. Each sweep is wrapped
 * in its own try/catch specifically so a retention failure cannot cost the
 * caller the soft-delete and purge work that already succeeded earlier in the
 * same request — a cron that throws on the last step and gets retried would
 * otherwise redo destructive work. That is what most of these assertions are
 * about, and it is invisible from the happy path alone.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { AppError } from '@/lib/api/errors/AppError';

const {
  requireCronSecretMock,
  cleanupSoftDeletedSiteBlocksMock,
  pruneSitePublishSnapshotsMock,
} = vi.hoisted(() => ({
  requireCronSecretMock: vi.fn(),
  cleanupSoftDeletedSiteBlocksMock: vi.fn(),
  pruneSitePublishSnapshotsMock: vi.fn(),
}));

vi.mock('@/lib/api/cron-auth', () => ({ requireCronSecret: requireCronSecretMock }));

// Mock the service module COMPLETELY. A partial factory throws at module load
// for whichever export the route reaches first, which reads as an unrelated
// failure rather than a short mock.
vi.mock('@/lib/services/site-blocks-service', () => ({
  cleanupSoftDeletedSiteBlocks: cleanupSoftDeletedSiteBlocksMock,
  pruneSitePublishSnapshots: pruneSitePublishSnapshotsMock,
}));

// The lifecycle phases 1-3 are not under test here; stub them to no-ops so the
// route reaches the sweeps without a database.
vi.mock('@/lib/services/account-lifecycle-service', () => ({
  computeAccessPlanStatus: vi.fn(() => ({ status: 'active', daysRemaining: 30 })),
  executeCommunitySoftDelete: vi.fn(async () => []),
  executeUserSoftDelete: vi.fn(async () => []),
  findCoolingExpiredDeletionRequests: vi.fn(async () => []),
  findPurgeReadyDeletionRequests: vi.fn(async () => []),
  getCommunityNameForLifecycleEmail: vi.fn(async () => 'Test Community'),
  listActiveAccessPlansForLifecycleCron: vi.fn(async () => []),
  lookupLifecycleAdminRecipients: vi.fn(async () => []),
  markAccessPlanNotificationSent: vi.fn(async () => undefined),
  purgeCommunityData: vi.fn(async () => undefined),
  purgeUserPII: vi.fn(async () => undefined),
}));

vi.mock('@propertypro/email', () => ({
  sendEmail: vi.fn(async () => undefined),
  FreeAccessExpiringEmail: () => null,
  FreeAccessExpiredEmail: () => null,
}));

import { POST } from '@/app/api/v1/internal/account-lifecycle/route';

function cronRequest(): NextRequest {
  return new NextRequest('http://localhost/api/v1/internal/account-lifecycle', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  });
}

interface LifecycleSummary {
  siteBlocksCleaned: number;
  sitePublishSnapshotsPruned: number;
  errors: string[];
}

async function runCron(): Promise<{ status: number; summary: LifecycleSummary }> {
  const res = await POST(cronRequest());
  const body = (await res.json()) as { summary: LifecycleSummary };
  return { status: res.status, summary: body.summary };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireCronSecretMock.mockReturnValue(undefined);
  cleanupSoftDeletedSiteBlocksMock.mockResolvedValue({ deleted: 0 });
  pruneSitePublishSnapshotsMock.mockResolvedValue({ pruned: 0 });
});

describe('account-lifecycle cron — site-editor retention sweeps', () => {
  it('runs the snapshot retention sweep and reports what it pruned', async () => {
    // The regression this exists to prevent: the function shipped exported but
    // with no caller, so retention silently never ran and every history entry
    // stayed restorable forever.
    pruneSitePublishSnapshotsMock.mockResolvedValueOnce({ pruned: 7 });

    const { status, summary } = await runCron();

    expect(status).toBe(200);
    expect(pruneSitePublishSnapshotsMock).toHaveBeenCalledTimes(1);
    expect(summary.sitePublishSnapshotsPruned).toBe(7);
    expect(summary.errors).toEqual([]);
  });

  it('uses the service default retention window rather than passing its own', async () => {
    // The keep-count belongs to the service (SITE_PUBLISH_SNAPSHOT_KEEP), so
    // the cron must not hard-code a second copy that could drift from it.
    await runCron();
    expect(pruneSitePublishSnapshotsMock).toHaveBeenCalledWith();
  });

  it('still prunes snapshots when the site_blocks sweep fails', async () => {
    cleanupSoftDeletedSiteBlocksMock.mockRejectedValueOnce(new Error('blocks sweep exploded'));
    pruneSitePublishSnapshotsMock.mockResolvedValueOnce({ pruned: 3 });

    const { status, summary } = await runCron();

    expect(status).toBe(200);
    expect(pruneSitePublishSnapshotsMock).toHaveBeenCalledTimes(1);
    expect(summary.sitePublishSnapshotsPruned).toBe(3);
    expect(summary.errors).toEqual([expect.stringContaining('cleanup site_blocks')]);
  });

  it('records a prune failure without failing the whole cron run', async () => {
    // A retention miss must not make the cron look failed and get retried —
    // the destructive soft-delete and purge phases already ran this request.
    cleanupSoftDeletedSiteBlocksMock.mockResolvedValueOnce({ deleted: 5 });
    pruneSitePublishSnapshotsMock.mockRejectedValueOnce(new Error('prune exploded'));

    const { status, summary } = await runCron();

    expect(status).toBe(200);
    expect(summary.siteBlocksCleaned).toBe(5);
    expect(summary.sitePublishSnapshotsPruned).toBe(0);
    expect(summary.errors).toEqual([expect.stringContaining('prune site_publish_snapshots')]);
  });

  it('reports both failures independently when both sweeps fail', async () => {
    cleanupSoftDeletedSiteBlocksMock.mockRejectedValueOnce(new Error('a'));
    pruneSitePublishSnapshotsMock.mockRejectedValueOnce(new Error('b'));

    const { status, summary } = await runCron();

    expect(status).toBe(200);
    expect(summary.errors).toHaveLength(2);
    expect(summary.errors[0]).toContain('cleanup site_blocks');
    expect(summary.errors[1]).toContain('prune site_publish_snapshots');
  });

  it('does not run either sweep when the cron secret is rejected', async () => {
    // `withErrorHandler` converts the throw into an error RESPONSE rather than
    // letting it reject, so this asserts on the status. The load-bearing part
    // is that neither sweep ran: an unauthenticated caller must not be able to
    // drive retention.
    requireCronSecretMock.mockImplementationOnce(() => {
      throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    });

    const res = await POST(cronRequest());

    expect(res.status).toBe(401);
    expect(cleanupSoftDeletedSiteBlocksMock).not.toHaveBeenCalled();
    expect(pruneSitePublishSnapshotsMock).not.toHaveBeenCalled();
  });
});
