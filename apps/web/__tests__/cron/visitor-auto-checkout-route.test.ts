import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * The hourly visitor auto-checkout cron.
 *
 * WHY THIS FILE DID NOT EXIST UNTIL NOW, AND WHY THAT MATTERED. This route had
 * no test at all, and it was the worst swallower in the repo: a single
 * `try/catch` around its entire body turned ANY failure — a dead database
 * included — into `HTTP 200 { autoCheckedOut: 0, errors: [...] }`, with no
 * `console.error` and no Sentry capture. It could have been permanently broken
 * while every dashboard showed it healthy, which is strictly worse than the
 * #1042 outage: that one at least 500'd loudly for a day.
 *
 * The case that matters here is the last one. It asserts the route now returns
 * 500 rather than a comfortable lie.
 */
const { autoCheckoutOverdueVisitorsMock, logAuditEventMock } = vi.hoisted(() => ({
  autoCheckoutOverdueVisitorsMock: vi.fn(),
  logAuditEventMock: vi.fn(),
}));

vi.mock('@/lib/services/visitor-cron-service', () => ({
  autoCheckoutOverdueVisitors: autoCheckoutOverdueVisitorsMock,
}));
vi.mock('@propertypro/db', () => ({ logAuditEvent: logAuditEventMock }));

import { GET, POST } from '../../src/app/api/v1/internal/visitor-auto-checkout/route';

const URL = 'http://localhost:3000/api/v1/internal/visitor-auto-checkout';
const authed = () => new NextRequest(URL, { headers: { authorization: 'Bearer test-secret' } });

describe('visitor-auto-checkout cron route', () => {
  const previousRouteSecret = process.env.VISITOR_AUTO_CHECKOUT_CRON_SECRET;
  const previousCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VISITOR_AUTO_CHECKOUT_CRON_SECRET = 'test-secret';
    autoCheckoutOverdueVisitorsMock.mockResolvedValue([
      { id: 1, communityId: 10 },
      { id: 2, communityId: 10 },
      { id: 3, communityId: 20 },
    ]);
    logAuditEventMock.mockResolvedValue(undefined);
  });

  // Restored rather than deleted: these are real process-wide env vars, and
  // leaving a test value behind changes how later files' auth behaves.
  afterEach(() => {
    if (previousRouteSecret === undefined) delete process.env.VISITOR_AUTO_CHECKOUT_CRON_SECRET;
    else process.env.VISITOR_AUTO_CHECKOUT_CRON_SECRET = previousRouteSecret;
    if (previousCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousCronSecret;
  });

  it('401s without a bearer token, and does not run the job', async () => {
    const res = await GET(new NextRequest(URL));

    expect(res.status).toBe(401);
    expect(autoCheckoutOverdueVisitorsMock).not.toHaveBeenCalled();
  });

  it('401s on the wrong token', async () => {
    const res = await GET(new NextRequest(URL, { headers: { authorization: 'Bearer nope' } }));

    expect(res.status).toBe(401);
    expect(autoCheckoutOverdueVisitorsMock).not.toHaveBeenCalled();
  });

  it('checks out overdue visitors and reports the count', async () => {
    const res = await GET(authed());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: { autoCheckedOut: 3, errors: [] } });
  });

  it('emits one bulk audit event per community, not one per visitor', async () => {
    await GET(authed());

    expect(logAuditEventMock).toHaveBeenCalledTimes(2);
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ communityId: 10, resourceId: '1,2' }),
    );
  });

  it('accepts POST as well as GET', async () => {
    const res = await POST(authed());

    expect(res.status).toBe(200);
  });

  it('still returns 200 when only SOME audit writes fail — a genuine partial failure', async () => {
    // The visitors were checked out; only the audit trail is incomplete. This
    // is the one case where a 200 with `errors` is the honest answer, and
    // `withCronJob`'s summary scan now reports it to Sentry.
    logAuditEventMock.mockRejectedValueOnce(new Error('audit write failed'));

    const res = await GET(authed());

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { autoCheckedOut: number; errors: string[] } };
    expect(body.data.autoCheckedOut).toBe(3);
    expect(body.data.errors).toEqual(['audit write failed']);
  });

  it('returns 500 when the job itself fails, instead of a 200 that lies', async () => {
    /*
     * THE POINT OF THIS FILE.
     *
     * Before, an outer catch turned this into
     * `200 { autoCheckedOut: 0, errors: ['...'] }` — no log, no Sentry, no
     * signal of any kind. A dead database looked like a quiet night.
     */
    autoCheckoutOverdueVisitorsMock.mockRejectedValue(new Error('DB connection failed'));

    const res = await GET(authed());

    expect(res.status).toBe(500);
  });
});
