/**
 * Tests for the export cron worker's orchestration.
 *
 * The completion email is the whole reason the async export is usable: the job
 * finishes on a cron tick, minutes after the user closed the tab. If the send is
 * never wired up, every surface still looks correct — the job says `ready`, the
 * card renders a download — and the archive quietly expires unclaimed. So the
 * ordering (`markJobReady` FIRST, then notify) and the failure isolation are
 * pinned here rather than assumed.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-07.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnauthorizedError } from '@/lib/api/errors';

const {
  requireCronSecretMock,
  claimNextExportJobMock,
  findJobByIdMock,
  markJobReadyMock,
  failExhaustedJobsMock,
  markJobFailedMock,
  findPurgeableJobArchivesMock,
  markJobArchivePurgedMock,
  markJobExpiredMock,
  runExportJobMock,
  sendExportReadyEmailMock,
  purgeArchivesMock,
} = vi.hoisted(() => ({
  requireCronSecretMock: vi.fn(),
  claimNextExportJobMock: vi.fn(),
  findJobByIdMock: vi.fn(),
  markJobReadyMock: vi.fn(),
  failExhaustedJobsMock: vi.fn(),
  markJobFailedMock: vi.fn(),
  findPurgeableJobArchivesMock: vi.fn(),
  markJobArchivePurgedMock: vi.fn(),
  markJobExpiredMock: vi.fn(),
  runExportJobMock: vi.fn(),
  sendExportReadyEmailMock: vi.fn(),
  purgeArchivesMock: vi.fn(),
}));

// `withScope` is reached by withErrorHandler's 500 path, not by the worker
// itself — omit it and the cron-secret test fails inside the error handler.
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  withScope: vi.fn(),
  setTag: vi.fn(),
}));
vi.mock('@propertypro/db', () => ({ COMMUNITY_EXPORT_RETENTION_DAYS: 14 }));
vi.mock('@/lib/api/cron-auth', () => ({ requireCronSecret: requireCronSecretMock }));
vi.mock('@/lib/services/export/export-job-service', () => ({
  claimNextExportJob: claimNextExportJobMock,
  findJobById: findJobByIdMock,
  markJobReady: markJobReadyMock,
  failExhaustedJobs: failExhaustedJobsMock,
  markJobFailed: markJobFailedMock,
  findPurgeableJobArchives: findPurgeableJobArchivesMock,
  markJobArchivePurged: markJobArchivePurgedMock,
  markJobExpired: markJobExpiredMock,
}));
vi.mock('@/lib/services/export/export-worker', () => ({ runExportJob: runExportJobMock }));
vi.mock('@/lib/services/export/export-notification', () => ({
  sendExportReadyEmail: sendExportReadyEmailMock,
}));
vi.mock('@/lib/services/export/purge-export-archives', () => ({
  purgeExportJobArchive: purgeArchivesMock,
}));

const { POST } = await import('@/app/api/v1/internal/community-export-worker/route');

const JOB = { id: 5, communityId: 42 };
const COMPLETED = {
  status: 'completed' as const,
  // This invocation's counters...
  partsWritten: 1,
  bytesWritten: 2048,
  // ...deliberately DIFFERENT from the cumulative ones, so a test asserting the
  // recorded totals cannot pass by reading the wrong pair.
  totalParts: 4,
  totalBytes: 8192,
  warnings: 0,
  manifest: { tables: [] },
};

function request() {
  return new Request('http://localhost/api/v1/internal/community-export-worker', {
    method: 'POST',
  }) as never;
}

/** Yields the job once, then nothing — one claim per run. */
function claimOnce(job: unknown = JOB) {
  claimNextExportJobMock.mockResolvedValueOnce(job).mockResolvedValue(null);
}

beforeEach(() => {
  vi.clearAllMocks();
  findPurgeableJobArchivesMock.mockResolvedValue([]);
  markJobArchivePurgedMock.mockResolvedValue(undefined);
  markJobReadyMock.mockResolvedValue(undefined);
  failExhaustedJobsMock.mockResolvedValue([]);
  findJobByIdMock.mockResolvedValue({ ...JOB, status: 'ready' });
  sendExportReadyEmailMock.mockResolvedValue({ sent: true });
});

describe('community-export-worker', () => {
  it('emails the requester after a job completes', async () => {
    claimOnce();
    runExportJobMock.mockResolvedValue(COMPLETED);

    const body = await (await POST(request())).json();

    expect(sendExportReadyEmailMock).toHaveBeenCalledOnce();
    expect(body.data.completed).toBe(1);
    expect(body.data.notified).toBe(1);
  });

  it('marks the job READY BEFORE notifying', async () => {
    // `markJobReady` stamps `notifiedAt` in the same statement that flips the
    // status, so a worker re-invoked between the two cannot re-claim the job and
    // send a second email. Notifying first would forfeit that.
    claimOnce();
    runExportJobMock.mockResolvedValue(COMPLETED);

    await POST(request());

    expect(markJobReadyMock.mock.invocationCallOrder[0]).toBeLessThan(
      sendExportReadyEmailMock.mock.invocationCallOrder[0]!,
    );
  });

  it('passes the job as re-read AFTER the ready flip', async () => {
    // The claimed row predates completion — its partCount, totalBytes and
    // expiresAt are all null, so emailing from it would report an empty archive.
    claimOnce();
    runExportJobMock.mockResolvedValue(COMPLETED);
    findJobByIdMock.mockResolvedValue({ ...JOB, status: 'ready', partCount: 3, totalBytes: 999 });

    await POST(request());

    expect(sendExportReadyEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ partCount: 3, totalBytes: 999 }),
    );
  });

  it('still counts the job COMPLETED when the email fails', async () => {
    // The archive exists and is downloadable. A mail outage must not undo that.
    claimOnce();
    runExportJobMock.mockResolvedValue(COMPLETED);
    sendExportReadyEmailMock.mockResolvedValue({ sent: false, reason: 'resend is down' });

    const body = await (await POST(request())).json();

    expect(body.data.completed).toBe(1);
    expect(body.data.notified).toBe(0);
    expect(markJobFailedMock).not.toHaveBeenCalled();
    // Surfaced rather than swallowed, so a silent mail outage is visible.
    expect(body.data.errors[0]).toContain('resend is down');
  });

  it('does NOT email a job that only yielded', async () => {
    claimOnce();
    runExportJobMock.mockResolvedValue({ status: 'yielded', partsWritten: 0, bytesWritten: 0, totalParts: 0, totalBytes: 0, warnings: 0, manifest: {} });

    const body = await (await POST(request())).json();

    expect(sendExportReadyEmailMock).not.toHaveBeenCalled();
    expect(body.data.yielded).toBe(1);
  });

  it('does NOT email a job that failed', async () => {
    claimOnce();
    runExportJobMock.mockRejectedValue(new Error('storage unavailable'));
    markJobFailedMock.mockResolvedValue({ willRetry: false });

    const body = await (await POST(request())).json();

    expect(sendExportReadyEmailMock).not.toHaveBeenCalled();
    expect(body.data.failed).toBe(1);
  });

  it('requires the cron secret before doing any work', async () => {
    // The real guard throws UnauthorizedError; using it keeps this on
    // withErrorHandler's AppError path rather than its 500-plus-Sentry path.
    requireCronSecretMock.mockImplementationOnce(() => {
      throw new UnauthorizedError();
    });

    // `withErrorHandler` converts the throw into an error response rather than
    // rejecting, so this awaits normally; the assertion is that nothing ran.
    const response = await POST(request());

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(claimNextExportJobMock).not.toHaveBeenCalled();
  });
});

/**
 * The two behaviours the worker fixes added to this route.
 *
 * Both concern jobs that fail WITHOUT throwing — the case the catch block above
 * cannot see, because an invocation killed by the platform deadline unwinds
 * nothing.
 */
describe('community-export-worker route — stuck and multi-tick jobs', () => {
  it('records CUMULATIVE volumes on completion, not this invocation\'s', async () => {
    // partsWritten/bytesWritten reset every run. A job that yielded four times
    // and finished on the fifth would otherwise be stamped partCount: 1, and the
    // download UI reads that number.
    claimNextExportJobMock.mockResolvedValueOnce(JOB).mockResolvedValue(null);
    runExportJobMock.mockResolvedValue(COMPLETED);
    findJobByIdMock.mockResolvedValue({ ...JOB, status: 'ready' });

    await POST(request());

    expect(markJobReadyMock).toHaveBeenCalledWith(
      expect.objectContaining({ partCount: 4, totalBytes: 8192 }),
    );
  });

  it('sweeps jobs that exhausted their attempts, and reports how many', async () => {
    // Without this a hard-killed job sits in `running` with an expired lease and
    // no error, polled forever by a card that can never resolve it.
    claimNextExportJobMock.mockResolvedValue(null);
    failExhaustedJobsMock.mockResolvedValue([11, 12]);

    const res = await POST(request());
    const body = await res.json();

    expect(failExhaustedJobsMock).toHaveBeenCalled();
    expect(body.data.exhausted).toBe(2);
  });

  it('a failing sweep is reported but does not take the whole run down', async () => {
    claimNextExportJobMock.mockResolvedValue(null);
    failExhaustedJobsMock.mockRejectedValue(new Error('db unavailable'));

    const res = await POST(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.errors.some((e: string) => e.includes('exhausted-sweep'))).toBe(true);
  });
});

// ── the reaper purges per JOB, not per community ──────────────────────────

describe('community-export-worker reaper', () => {
  const READY = { id: 5, communityId: 42, downloadToken: 'tok-expired', status: 'ready' };

  it('deletes only the expiring job’s archive, not the whole community prefix', async () => {
    /*
     * The bug this pins. The reaper used to call
     * `purgeCommunityExportArchives(communityId)`, which deletes everything
     * under `exports/<communityId>/`. Volumes are written per job, at
     * `exports/<communityId>/<downloadToken>/`, so expiring ONE job destroyed
     * every other job's archive for that community — including a newer `ready`
     * one whose row still said `ready`. That PM's download then minted a
     * presigned URL to an object that was no longer there.
     */
    findPurgeableJobArchivesMock.mockResolvedValue([READY]);

    await POST(request());

    expect(purgeArchivesMock).toHaveBeenCalledTimes(1);
    expect(purgeArchivesMock).toHaveBeenCalledWith({
      communityId: 42,
      downloadToken: 'tok-expired',
    });
    // The community id alone must never be the whole argument again.
    expect(purgeArchivesMock).not.toHaveBeenCalledWith(42);
  });

  it('marks the volumes purged so the job is not re-listed every tick', async () => {
    findPurgeableJobArchivesMock.mockResolvedValue([READY]);

    await POST(request());

    expect(markJobArchivePurgedMock).toHaveBeenCalledWith(5);
  });

  it('purges a FAILED job’s volumes but leaves its status and error intact', async () => {
    /*
     * A failed job's partial volumes were reaped by nothing and sat in storage
     * until the community was hard-purged six months later. They are now
     * collected — but the job must NOT become `expired`: the settings card
     * renders `errorMessage` only under `failed`, so flipping the status would
     * erase the user's only explanation of why their export never arrived.
     */
    findPurgeableJobArchivesMock.mockResolvedValue([
      { id: 9, communityId: 42, downloadToken: 'tok-failed', status: 'failed' },
    ]);

    const body = await (await POST(request())).json();

    expect(purgeArchivesMock).toHaveBeenCalledWith({
      communityId: 42,
      downloadToken: 'tok-failed',
    });
    expect(markJobArchivePurgedMock).toHaveBeenCalledWith(9);
    expect(markJobExpiredMock).not.toHaveBeenCalled();
    expect(body.data.archivesPurged).toBe(1);
    expect(body.data.expired).toBe(0);
  });

  it('still expires a READY job, so retention keeps working', async () => {
    // The control for the case above — without it, a reaper that never expired
    // anything would look identical.
    findPurgeableJobArchivesMock.mockResolvedValue([READY]);

    const body = await (await POST(request())).json();

    expect(markJobExpiredMock).toHaveBeenCalledWith(5);
    expect(body.data.expired).toBe(1);
    expect(body.data.archivesPurged).toBe(1);
  });

  it('reports a reaper failure instead of losing the tick', async () => {
    findPurgeableJobArchivesMock.mockRejectedValue(new Error('storage down'));

    const body = await (await POST(request())).json();

    expect(body.data.errors.some((e: string) => e.includes('reaper'))).toBe(true);
  });
});
