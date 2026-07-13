import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  recoverStuckProvisioningJobsMock,
  reconcileLostCheckoutSignupsMock,
  captureExceptionMock,
  captureMessageMock,
  withScopeMock,
} = vi.hoisted(() => ({
  recoverStuckProvisioningJobsMock: vi.fn(),
  reconcileLostCheckoutSignupsMock: vi.fn(),
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
}));

vi.mock('@/lib/services/provisioning-service', () => ({
  recoverStuckProvisioningJobs: recoverStuckProvisioningJobsMock,
  reconcileLostCheckoutSignups: reconcileLostCheckoutSignupsMock,
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
