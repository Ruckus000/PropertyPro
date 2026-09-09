import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  recoverStuckProvisioningJobsMock,
  reconcileLostCheckoutSignupsMock,
  expireStalePendingSignupsMock,
  captureExceptionMock,
  captureMessageMock,
  withScopeMock,
} = vi.hoisted(() => ({
  recoverStuckProvisioningJobsMock: vi.fn(),
  reconcileLostCheckoutSignupsMock: vi.fn(),
  expireStalePendingSignupsMock: vi.fn().mockResolvedValue({ expired: 0 }),
  captureExceptionMock: vi.fn(),
  captureMessageMock: vi.fn(),
  withScopeMock: vi.fn((cb: (scope: { setTag: ReturnType<typeof vi.fn>; setUser: ReturnType<typeof vi.fn> }) => void) =>
    cb({ setTag: vi.fn(), setUser: vi.fn() }),
  ),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: captureExceptionMock,
  captureMessage: captureMessageMock,
  withScope: withScopeMock,
  // `withCronJob` (the job-identity wrapper on every cron route) calls this.
  // A mock factory that omits it makes the route throw at module load —
  // the same trap CLAUDE.md documents for @propertypro/db mocks.
  // The stub scope must offer EVERY method withCronJob calls, not just the ones
  // this route's assertions care about — it runs the real wrapper. Adding
  // `setFingerprint` to withCronJob broke 21 tests across two files that stubbed
  // only `setTag`, with a bare `scope.setFingerprint is not a function`.
  withIsolationScope: (fn: (scope: { setTag: () => void; setFingerprint: () => void }) => unknown) =>
    fn({ setTag: () => {}, setFingerprint: () => {} }),
}));

vi.mock('@/lib/services/provisioning-service', () => ({
  recoverStuckProvisioningJobs: recoverStuckProvisioningJobsMock,
  reconcileLostCheckoutSignups: reconcileLostCheckoutSignupsMock,
  expireStalePendingSignups: expireStalePendingSignupsMock,
}));

import { GET, POST } from '../../src/app/api/v1/internal/provisioning-watchdog/route';

const URL = 'http://localhost:3000/api/v1/internal/provisioning-watchdog';

describe('provisioning watchdog cron route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PROVISIONING_RETRY_SECRET = 'test-secret';
    delete process.env.CRON_SECRET;
    recoverStuckProvisioningJobsMock.mockResolvedValue({
      scanned: 1,
      attempted: 1,
      completed: 1,
      failed: 0,
      failures: [],
      orphans: [],
    });
    reconcileLostCheckoutSignupsMock.mockResolvedValue({
      scanned: 0,
      recovered: 0,
      skippedNotComplete: 0,
      failed: 0,
      failures: [],
    });
  });

  it('returns 401 for missing bearer token', async () => {
    const req = new NextRequest(URL, { method: 'GET' });
    const res = await GET(req);
    expect(res.status).toBe(401);
    expect(recoverStuckProvisioningJobsMock).not.toHaveBeenCalled();
  });

  it('recovers stuck provisioning jobs with a valid GET token', async () => {
    const req = new NextRequest(URL, {
      method: 'GET',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: {
        scanned: 1,
        attempted: 1,
        completed: 1,
        failed: 0,
        failures: [],
        orphans: [],
        reconcile: {
          scanned: 0,
          recovered: 0,
          skippedNotComplete: 0,
          failed: 0,
          failures: [],
        },
        signupExpiry: { expired: 0 },
      },
    });
    expect(recoverStuckProvisioningJobsMock).toHaveBeenCalledOnce();
    expect(reconcileLostCheckoutSignupsMock).toHaveBeenCalledOnce();
    expect(captureMessageMock).toHaveBeenCalledWith(
      'provisioning_watchdog_recovered_jobs',
      expect.objectContaining({ level: 'warning' }),
    );
  });

  it('supports POST for manual retries with the same auth contract', async () => {
    const req = new NextRequest(URL, {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(recoverStuckProvisioningJobsMock).toHaveBeenCalledOnce();
  });

  it('falls back to CRON_SECRET when PROVISIONING_RETRY_SECRET is not configured', async () => {
    delete process.env.PROVISIONING_RETRY_SECRET;
    process.env.CRON_SECRET = 'cron-secret';

    const req = new NextRequest(URL, {
      method: 'GET',
      headers: { authorization: 'Bearer cron-secret' },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(recoverStuckProvisioningJobsMock).toHaveBeenCalledOnce();
  });

  it('alerts when recovery attempts still fail', async () => {
    recoverStuckProvisioningJobsMock.mockResolvedValue({
      scanned: 1,
      attempted: 1,
      completed: 0,
      failed: 1,
      failures: [
        {
          jobId: 10,
          signupRequestId: 'req-stuck',
          errorMessage: 'Email provider unavailable',
        },
      ],
      orphans: [],
    });

    const req = new NextRequest(URL, {
      method: 'GET',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(captureMessageMock).toHaveBeenCalledWith(
      'provisioning_watchdog_failed_jobs',
      expect.objectContaining({ level: 'error' }),
    );
    expect(captureExceptionMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          component: 'provisioning-watchdog',
          jobId: 10,
          signupRequestId: 'req-stuck',
        }),
      }),
    );
  });

  it('alerts on orphan communities surfaced by the sweep', async () => {
    recoverStuckProvisioningJobsMock.mockResolvedValue({
      scanned: 0,
      attempted: 0,
      completed: 0,
      failed: 0,
      failures: [],
      orphans: [
        {
          communityId: 281,
          slug: 'ruckus-browser-test-association',
          subscriptionStatus: 'active',
          stripeCustomerId: 'cus_UGQ9azrdMidRey',
        },
      ],
    });

    const req = new NextRequest(URL, {
      method: 'GET',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(captureMessageMock).toHaveBeenCalledWith(
      'provisioning_watchdog_orphan_communities',
      expect.objectContaining({
        level: 'error',
        extra: expect.objectContaining({
          count: 1,
          orphans: expect.arrayContaining([
            expect.objectContaining({ communityId: 281 }),
          ]),
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Pending-signup expiry sweep. The ORDER is the safety property here, not an
// implementation detail: reconcileLostCheckoutSignups is what rescues a
// genuinely-paid `checkout_started` row whose webhook was lost, and it only
// selects live statuses. Expiring first would hide such a row from it forever.
// ---------------------------------------------------------------------------
describe('provisioning watchdog — pending-signup expiry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    expireStalePendingSignupsMock.mockResolvedValue({ expired: 0 });
  });

  it('runs the expiry sweep STRICTLY AFTER the lost-checkout reconcile', async () => {
    process.env.CRON_SECRET = 'test-secret';
    expireStalePendingSignupsMock.mockResolvedValue({ expired: 3 });

    const res = await GET(
      new NextRequest(URL, { headers: { authorization: 'Bearer test-secret' } }),
    );

    expect(res.status).toBe(200);
    expect(expireStalePendingSignupsMock).toHaveBeenCalledTimes(1);

    const reconcileOrder = reconcileLostCheckoutSignupsMock.mock.invocationCallOrder[0];
    const expiryOrder = expireStalePendingSignupsMock.mock.invocationCallOrder[0];
    expect(reconcileOrder).toBeDefined();
    expect(expiryOrder).toBeGreaterThan(reconcileOrder as number);
  });

  it('reports the count under a key withCronJob does not read as a failure', async () => {
    process.env.CRON_SECRET = 'test-secret';
    expireStalePendingSignupsMock.mockResolvedValue({ expired: 2 });

    const res = await GET(
      new NextRequest(URL, { headers: { authorization: 'Bearer test-secret' } }),
    );
    const body = (await res.json()) as { data: Record<string, unknown> };

    expect(body.data.signupExpiry).toEqual({ expired: 2 });
    // withCronJob scans a 200 body for these and raises a Sentry error event.
    for (const key of ['rowsFailed', 'failedCount', 'failures']) {
      expect(body.data.signupExpiry).not.toHaveProperty(key);
    }
  });
});
