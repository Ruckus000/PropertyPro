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
  findCoolingExpiredDeletionRequestsMock,
  executeUserSoftDeleteMock,
  findPurgeReadyDeletionRequestsMock,
  purgeUserPIIMock,
  sendEmailMock,
} = vi.hoisted(() => ({
  requireCronSecretMock: vi.fn(),
  cleanupSoftDeletedSiteBlocksMock: vi.fn(),
  pruneSitePublishSnapshotsMock: vi.fn(),
  findCoolingExpiredDeletionRequestsMock: vi.fn(),
  executeUserSoftDeleteMock: vi.fn(),
  findPurgeReadyDeletionRequestsMock: vi.fn(),
  purgeUserPIIMock: vi.fn(),
  sendEmailMock: vi.fn(),
}));

vi.mock('@/lib/api/cron-auth', () => ({ requireCronSecret: requireCronSecretMock }));

// Mock the service module COMPLETELY. A partial factory throws at module load
// for whichever export the route reaches first, which reads as an unrelated
// failure rather than a short mock.
vi.mock('@/lib/services/site-blocks-service', () => ({
  cleanupSoftDeletedSiteBlocks: cleanupSoftDeletedSiteBlocksMock,
  pruneSitePublishSnapshots: pruneSitePublishSnapshotsMock,
}));

// The lifecycle phases 1-3 are stubbed to no-ops (set per test in beforeEach)
// so the route reaches the sweeps without a database. The deletion-email
// helper is NOT mocked: it runs for real against the mocked `sendEmail`.
vi.mock('@/lib/services/account-lifecycle-service', () => ({
  computeAccessPlanStatus: vi.fn(() => ({ status: 'active', daysRemaining: 30 })),
  executeCommunitySoftDelete: vi.fn(async () => []),
  executeUserSoftDelete: executeUserSoftDeleteMock,
  findCoolingExpiredDeletionRequests: findCoolingExpiredDeletionRequestsMock,
  findPurgeReadyDeletionRequests: findPurgeReadyDeletionRequestsMock,
  getCommunityNameForLifecycleEmail: vi.fn(async () => 'Test Community'),
  listActiveAccessPlansForLifecycleCron: vi.fn(async () => []),
  lookupLifecycleAdminRecipients: vi.fn(async () => []),
  markAccessPlanNotificationSent: vi.fn(async () => undefined),
  purgeCommunityData: vi.fn(async () => undefined),
  purgeUserPII: purgeUserPIIMock,
}));

// Only the initiated/cancelled emails read it; the executed email must not.
vi.mock('@/lib/services/user-profile-service', () => ({
  getUserProfileSnapshot: vi.fn(async () => {
    throw new Error('the executed email must use the captured address, not re-read users');
  }),
}));

vi.mock('@propertypro/email', () => ({
  sendEmail: sendEmailMock,
  FreeAccessExpiringEmail: () => null,
  FreeAccessExpiredEmail: () => null,
  AccountDeletionExecutedEmail: () => null,
  AccountDeletionInitiatedEmail: () => null,
  AccountRecoveredEmail: () => null,
}));

import { POST } from '@/app/api/v1/internal/account-lifecycle/route';

function cronRequest(): NextRequest {
  return new NextRequest('http://localhost/api/v1/internal/account-lifecycle', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  });
}

interface LifecycleSummary {
  softDeleted: { users: number; communities: number };
  skipped: { users: number; communities: number };
  purged: { users: number; communities: number };
  deletionEmails: { sent: number; notSent: number };
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
  findCoolingExpiredDeletionRequestsMock.mockResolvedValue([]);
  executeUserSoftDeleteMock.mockResolvedValue([]);
  findPurgeReadyDeletionRequestsMock.mockResolvedValue([]);
  purgeUserPIIMock.mockResolvedValue(undefined);
  sendEmailMock.mockResolvedValue({ id: 'test_1' });
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

// ---------------------------------------------------------------------------
// Phase 1 — the "account deleted" email (D13)
// ---------------------------------------------------------------------------

/** A row as `executeUserSoftDelete` returns it: the request plus the captured recipient. */
function softDeleted(
  id: number,
  recipient: { email: string; fullName: string | null } | null,
): Record<string, unknown> {
  return {
    id,
    userId: `user-${id}`,
    requestType: 'user',
    status: 'soft_deleted',
    // Noon UTC so the Florida-time date is unambiguous.
    scheduledPurgeAt: new Date('2027-05-21T12:00:00.000Z'),
    recipient,
  };
}

function coolingExpired(...ids: number[]) {
  findCoolingExpiredDeletionRequestsMock.mockResolvedValue(
    ids.map((id) => ({ id, requestType: 'user' })),
  );
}

describe('account-lifecycle cron — deletion emails at soft delete', () => {
  it('emails the address captured by the soft delete, dated with its scheduled purge', async () => {
    coolingExpired(5);
    executeUserSoftDeleteMock.mockResolvedValue([
      softDeleted(5, { email: 'marisol@example.com', fullName: 'Marisol Reyes' }),
    ]);

    const { status, summary } = await runCron();

    expect(status).toBe(200);
    expect(executeUserSoftDeleteMock).toHaveBeenCalledWith([5]);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const sent = sendEmailMock.mock.calls[0]![0] as {
      to: string;
      category: string;
      idempotencyKey: string;
      react: { props: Record<string, unknown> };
    };
    expect(sent.to).toBe('marisol@example.com');
    expect(sent.category).toBe('transactional');
    // One key per deletion request: a re-run cron cannot mail twice.
    expect(sent.idempotencyKey).toBe('account-deletion/executed/5');
    expect(sent.react.props).toMatchObject({
      recipientName: 'Marisol Reyes',
      purgeDate: 'May 21, 2027',
    });
    expect(summary.deletionEmails).toEqual({ sent: 1, notSent: 0 });
  });

  it('a failed send stops neither the other sends nor any later phase', async () => {
    coolingExpired(5, 6);
    executeUserSoftDeleteMock.mockResolvedValue([
      softDeleted(5, { email: 'first@example.com', fullName: null }),
      softDeleted(6, { email: 'second@example.com', fullName: 'Dana' }),
    ]);
    sendEmailMock.mockRejectedValueOnce(new Error('Resend API error: 500'));
    findPurgeReadyDeletionRequestsMock.mockResolvedValue([{ id: 77, requestType: 'user' }]);
    pruneSitePublishSnapshotsMock.mockResolvedValue({ pruned: 2 });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { status, summary } = await runCron();
    consoleErrorSpy.mockRestore();

    expect(status).toBe(200);
    expect(sendEmailMock.mock.calls.map((c) => (c[0] as { to: string }).to)).toEqual([
      'first@example.com',
      'second@example.com',
    ]);
    expect(summary.softDeleted.users).toBe(2);
    expect(summary.deletionEmails).toEqual({ sent: 1, notSent: 1 });
    // Phase 2 (purge) and phase 5 (sweeps) still ran.
    expect(purgeUserPIIMock).toHaveBeenCalledWith(77);
    expect(summary.purged.users).toBe(1);
    expect(summary.sitePublishSnapshotsPruned).toBe(2);
    // A mail failure is not a lifecycle failure: no soft-delete error recorded.
    expect(summary.errors).toEqual([]);
  });

  // Duplicate requests of one user that expire together are one deleted
  // account: one email (under the earlier request's key) and one count. Both
  // ids are still accounted for, so neither reads as skipped.
  it('emails and counts a user with two expired requests once', async () => {
    coolingExpired(5, 6);
    executeUserSoftDeleteMock.mockResolvedValue([
      { ...softDeleted(6, { email: 'dup@example.com', fullName: null }), userId: 'same-user' },
      { ...softDeleted(5, { email: 'dup@example.com', fullName: null }), userId: 'same-user' },
    ]);

    const { status, summary } = await runCron();

    expect(status).toBe(200);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect((sendEmailMock.mock.calls[0]![0] as { idempotencyKey: string }).idempotencyKey).toBe(
      'account-deletion/executed/5',
    );
    expect(summary.softDeleted.users).toBe(1);
    expect(summary.skipped.users).toBe(0);
    expect(summary.deletionEmails).toEqual({ sent: 1, notSent: 0 });
  });

  it('never sends to a purged (@redacted) address or a row with no captured recipient', async () => {
    coolingExpired(5, 6, 7);
    executeUserSoftDeleteMock.mockResolvedValue([
      softDeleted(5, { email: 'deleted-user-5@redacted', fullName: 'Deleted User' }),
      softDeleted(6, { email: 'deleted-user-6@redacted.invalid', fullName: null }),
      softDeleted(7, null),
    ]);

    const { status, summary } = await runCron();

    expect(status).toBe(200);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(summary.softDeleted.users).toBe(3);
    expect(summary.deletionEmails).toEqual({ sent: 0, notSent: 3 });
  });
});
