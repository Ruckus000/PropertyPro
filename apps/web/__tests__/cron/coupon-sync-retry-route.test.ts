import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { recalculateVolumeTierMock, findStuckCouponSyncBillingGroupsMock } = vi.hoisted(() => ({
  recalculateVolumeTierMock: vi.fn(),
  // Annotated: a bare `async () => []` infers Promise<never[]>, so any
  // mockResolvedValue with real rows is a type error once this file is
  // type-checked.
  findStuckCouponSyncBillingGroupsMock: vi.fn(async (): Promise<Array<{ id: number }>> => []),
}));

vi.mock('@/lib/billing/billing-group-service', () => ({
  recalculateVolumeTier: recalculateVolumeTierMock,
  findStuckCouponSyncBillingGroups: findStuckCouponSyncBillingGroupsMock,
}));

import { POST } from '../../src/app/api/v1/internal/coupon-sync-retry/route';

const URL = 'http://localhost:3000/api/v1/internal/coupon-sync-retry';

describe('coupon-sync-retry cron route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CRON_SECRET;
    delete process.env.COUPON_SYNC_RETRY_CRON_SECRET;
  });

  it('accepts the canonical coupon retry secret', async () => {
    process.env.COUPON_SYNC_RETRY_CRON_SECRET = 'coupon-secret';

    const req = new NextRequest(URL, {
      method: 'POST',
      headers: { authorization: 'Bearer coupon-secret' },
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ processed: 0, failed: 0, results: [] });
  });

  it('falls back to CRON_SECRET when the coupon-specific secret is absent', async () => {
    process.env.CRON_SECRET = 'fallback-secret';

    const req = new NextRequest(URL, {
      method: 'POST',
      headers: { authorization: 'Bearer fallback-secret' },
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ processed: 0, failed: 0, results: [] });
  });

  it('accepts EITHER the route secret or the platform CRON_SECRET', async () => {
    // This test previously asserted the opposite — that CRON_SECRET is REJECTED
    // once the route-specific secret is set (the `??` fallback: reach the
    // fallback only when the specific one is unset).
    //
    // That semantic is what kept the scheduled jobs dead. Vercel Cron sends one
    // platform-wide `Authorization: Bearer $CRON_SECRET` to every job. Under
    // `??`, every route that HAD its dedicated secret configured — payment
    // reminders, assessments, compliance, and the rest — compared the platform
    // token against a different value and 401'd. Setting CRON_SECRET would have
    // fixed only the handful nobody had configured, and the outage would have
    // looked half-fixed for reasons nobody could see.
    //
    // Both tokens are operator-level credentials with identical blast radius,
    // so accepting either costs nothing and makes the platform scheduler work.
    process.env.COUPON_SYNC_RETRY_CRON_SECRET = 'coupon-secret';
    process.env.CRON_SECRET = 'fallback-secret';

    for (const token of ['coupon-secret', 'fallback-secret']) {
      const res = await POST(
        new NextRequest(URL, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}` },
        }),
      );
      expect(res.status).toBe(200);
    }
  });

  it('still rejects a token matching neither secret', async () => {
    process.env.COUPON_SYNC_RETRY_CRON_SECRET = 'coupon-secret';
    process.env.CRON_SECRET = 'fallback-secret';

    const res = await POST(
      new NextRequest(URL, {
        method: 'POST',
        headers: { authorization: 'Bearer not-either-of-them' },
      }),
    );

    expect(res.status).toBe(401);
  });

  it('fails closed when no secret is configured at all', async () => {
    delete process.env.COUPON_SYNC_RETRY_CRON_SECRET;
    delete process.env.CRON_SECRET;

    const res = await POST(
      new NextRequest(URL, {
        method: 'POST',
        headers: { authorization: 'Bearer anything' },
      }),
    );

    // Middleware waves every /api/v1/internal/* GET|POST past the session gate,
    // so this is the ONLY thing standing between an unconfigured deploy and a
    // publicly-runnable job.
    expect(res.status).toBe(401);
  });

  it('reports a `failed` count, so a run where every row fails is not silent', async () => {
    /*
     * `results: [{ ok: false }]` is invisible to `withCronJob`'s summary scan,
     * which reads numeric `failed` / array `errors`. Without this field every
     * row could fail and the run would look clean — a 200 with no signal
     * anywhere, the same shape that made visitor-auto-checkout dangerous.
     */
    process.env.COUPON_SYNC_RETRY_CRON_SECRET = 'coupon-secret';
    findStuckCouponSyncBillingGroupsMock.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    recalculateVolumeTierMock
      .mockRejectedValueOnce(new Error('stripe down'))
      .mockResolvedValueOnce(undefined);

    const res = await POST(
      new NextRequest(URL, {
        method: 'POST',
        headers: { authorization: 'Bearer coupon-secret' },
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { processed: number; failed: number };
    expect(body.processed).toBe(2);
    expect(body.failed).toBe(1);
  });
});
