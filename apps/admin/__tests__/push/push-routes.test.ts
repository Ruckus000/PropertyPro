/**
 * The two HTTP surfaces of web push.
 *
 * The dispatch route's tests are the load-bearing ones: it is the only route in
 * this app that middleware lets past the session gate, so its bearer check is
 * the ONLY thing standing between an anonymous caller and a handler on the
 * deployment holding the service-role key. Every test below asserts the REFUSAL
 * as well as the success — per the 2026-08 outage, the 401 path is the one
 * production actually exercises.
 */
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '@propertypro/shared/http';

const captureMessage = vi.hoisted(() => vi.fn());
vi.mock('@sentry/nextjs', () => ({
  captureMessage,
  captureException: vi.fn(),
  // `withAdminErrorHandler` uses this on the non-AppError path.
  withScope: (fn: (scope: { setTag(): void; setUser(): void }) => void) =>
    fn({ setTag: () => {}, setUser: () => {} }),
}));

const dispatchPush = vi.hoisted(() =>
  vi.fn(async () => ({ configured: true, admins: 1, sent: 0, failed: 0, pruned: 0 })),
);
vi.mock('@/lib/server/push', () => ({ dispatchPush: () => dispatchPush() }));

const requirePlatformAdmin = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/platform-admin', () => ({ requirePlatformAdmin }));

const logAdminAction = vi.hoisted(() =>
  vi.fn(async (_params: Record<string, unknown>) => {}),
);
vi.mock('@/lib/audit/log-admin-action', () => ({ logAdminAction }));

const upsert = vi.hoisted(() => vi.fn(async () => ({ error: null })));
const deleteFilters = vi.hoisted(() => [] as Array<[string, unknown]>);
const deleteResult = vi.hoisted(() => ({ error: null as { message: string } | null }));
/** The row the POST reads before upserting, to see whom it is displacing. */
const existingRow = vi.hoisted(() => ({ value: null as { user_id: string } | null }));
vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminTypedClient: () => ({
    from: () => ({
      upsert,
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: existingRow.value, error: null }),
        }),
      }),
      delete: () => {
        const chain = {
          eq: (column: string, value: unknown) => {
            deleteFilters.push([column, value]);
            return chain;
          },
          then: (resolve: (value: typeof deleteResult) => unknown) => resolve(deleteResult),
        };
        return chain;
      },
    }),
  }),
}));

import { GET, POST } from '@/app/api/admin/internal/push-dispatch/route';
import {
  POST as SUBSCRIBE,
  DELETE as UNSUBSCRIBE,
} from '@/app/api/admin/push/subscriptions/route';

const ADMIN = { id: 'admin-1', email: 'ops@getpropertypro.com', role: 'super_admin' };

function jsonRequest(method: string, body: unknown): NextRequest {
  return new NextRequest('http://admin.local/api/admin/push/subscriptions', {
    method,
    headers: { 'content-type': 'application/json', 'user-agent': 'Vitest/1.0' },
    body: JSON.stringify(body),
  });
}

describe('POST/GET /api/admin/internal/push-dispatch', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 's';
  });

  it('401s without the cron secret', async () => {
    const res = await POST(new NextRequest('http://a/x', { method: 'POST' }));
    expect(res.status).toBe(401);
    expect(dispatchPush).not.toHaveBeenCalled();
  });

  it('401s on a WRONG secret', async () => {
    const res = await POST(
      new NextRequest('http://a/x', { method: 'POST', headers: { authorization: 'Bearer nope' } }),
    );
    expect(res.status).toBe(401);
    expect(dispatchPush).not.toHaveBeenCalled();
  });

  it('401s on a bearer that is a PREFIX of the secret (no length-blind compare)', async () => {
    process.env.CRON_SECRET = 'supersecret';
    const res = await POST(
      new NextRequest('http://a/x', { method: 'POST', headers: { authorization: 'Bearer super' } }),
    );
    expect(res.status).toBe(401);
    expect(dispatchPush).not.toHaveBeenCalled();
  });

  it('401s when the secret is NOT CONFIGURED, even if the caller sends one', async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(
      new NextRequest('http://a/x', { method: 'POST', headers: { authorization: 'Bearer s' } }),
    );
    expect(res.status).toBe(401);
    expect(dispatchPush).not.toHaveBeenCalled();
  });

  it('401s on a non-Bearer Authorization header', async () => {
    const res = await POST(
      new NextRequest('http://a/x', { method: 'POST', headers: { authorization: 's' } }),
    );
    expect(res.status).toBe(401);
    expect(dispatchPush).not.toHaveBeenCalled();
  });

  it('runs with the secret', async () => {
    const res = await POST(
      new NextRequest('http://a/x', { method: 'POST', headers: { authorization: 'Bearer s' } }),
    );
    expect(res.status).toBe(200);
    expect(dispatchPush).toHaveBeenCalledTimes(1);
    expect(await res.json()).toEqual({
      data: { configured: true, admins: 1, sent: 0, failed: 0, pruned: 0 },
    });
  });

  it('answers GET too — Vercel Cron issues GET, not POST', async () => {
    const res = await GET(
      new NextRequest('http://a/x', { headers: { authorization: 'Bearer s' } }),
    );
    expect(res.status).toBe(200);
    expect(dispatchPush).toHaveBeenCalledTimes(1);
  });

  it('401s an unauthenticated GET, exactly as it does a POST', async () => {
    const res = await GET(new NextRequest('http://a/x'));
    expect(res.status).toBe(401);
    expect(dispatchPush).not.toHaveBeenCalled();
  });

  it('reports "not configured" as a 200, so the cron is not retried forever', async () => {
    dispatchPush.mockResolvedValueOnce({
      configured: false,
      admins: 0,
      sent: 0,
      failed: 0,
      pruned: 0,
    });
    const res = await POST(
      new NextRequest('http://a/x', { method: 'POST', headers: { authorization: 'Bearer s' } }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data.configured).toBe(false);
  });
});

/**
 * Security MEDIUM-2. `requireCronSecret` throws `UnauthorizedError`, an
 * `AppError`, and `withAdminErrorHandler` RETURNS those without a Sentry
 * capture — so a wrong or missing `CRON_SECRET` on the admin project left this
 * cron dead with nothing anywhere saying so. That is verbatim the 2026-08 shape
 * where seventeen web crons 401'd for months behind a green dashboard.
 *
 * Fake timers throughout: the report is throttled per process, so the window has
 * to be moved rather than waited out — and the throttle is itself the thing that
 * stops a session-less route being used to burn the Sentry quota.
 */
describe('push-dispatch reports a rejected call', () => {
  const HOUR = 60 * 60 * 1000;

  beforeEach(() => {
    process.env.CRON_SECRET = 's';
    vi.useFakeTimers();
    // Far past any window a previous test in this file consumed.
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('captures the 401 that the error handler would otherwise swallow', async () => {
    // Distinctive, so "the secret is not in the payload" is a real assertion
    // rather than one satisfied by any string containing an "s".
    process.env.CRON_SECRET = 'zq7-cron-secret-value';

    const res = await POST(new NextRequest('http://a/x', { method: 'POST' }));

    expect(res.status).toBe(401);
    expect(captureMessage).toHaveBeenCalledTimes(1);
    const [message, options] = captureMessage.mock.calls[0]!;
    expect(message).toContain('push-dispatch');
    expect(options.level).toBe('warning');
    expect(options.tags).toEqual({ cron: 'push-dispatch', outcome: 'unauthorized' });
    // The fact that separates "somebody probed the endpoint" from "this
    // deployment cannot run its own cron" — and never the secret itself.
    expect(options.extra.cronSecretConfigured).toBe(true);
    expect(options.extra.hasAuthorizationHeader).toBe(false);
    expect(JSON.stringify(options)).not.toContain('zq7-cron-secret-value');
  });

  it('distinguishes a deployment with no secret configured at all', async () => {
    delete process.env.CRON_SECRET;
    vi.setSystemTime(new Date('2030-01-01T02:00:00Z'));

    await POST(new NextRequest('http://a/x', { method: 'POST' }));

    expect(captureMessage.mock.calls[0]![1].extra.cronSecretConfigured).toBe(false);
  });

  // The route is session-less by design, so anyone can reach it. An uncapped
  // capture would let a stranger mint one Sentry event per request.
  it('throttles: a flood of anonymous calls reports once, not once each', async () => {
    vi.setSystemTime(new Date('2030-01-01T04:00:00Z'));

    for (let i = 0; i < 25; i += 1) {
      await POST(new NextRequest('http://a/x', { method: 'POST' }));
    }

    expect(captureMessage).toHaveBeenCalledTimes(1);

    // ...and a genuinely misconfigured secret still reports again next window,
    // so the throttle does not turn into silence.
    vi.setSystemTime(new Date(Date.now() + HOUR + 1000));
    await POST(new NextRequest('http://a/x', { method: 'POST' }));
    expect(captureMessage).toHaveBeenCalledTimes(2);
  });

  it('says nothing when the cron authenticates', async () => {
    vi.setSystemTime(new Date('2030-01-01T08:00:00Z'));

    const res = await POST(
      new NextRequest('http://a/x', { method: 'POST', headers: { authorization: 'Bearer s' } }),
    );

    expect(res.status).toBe(200);
    expect(captureMessage).not.toHaveBeenCalled();
  });
});

describe('/api/admin/push/subscriptions', () => {
  beforeEach(() => {
    requirePlatformAdmin.mockResolvedValue(ADMIN);
    deleteFilters.length = 0;
    deleteResult.error = null;
    existingRow.value = null;
  });

  it('upserts on endpoint and 201s', async () => {
    const res = await SUBSCRIBE(
      jsonRequest('POST', {
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
        keys: { p256dh: 'pub', auth: 'sec' },
      }),
    );

    expect(res.status).toBe(201);
    expect(upsert).toHaveBeenCalledTimes(1);
    const [row, options] = upsert.mock.calls[0] as unknown as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(options).toEqual({ onConflict: 'endpoint' });
    expect(row.user_id).toBe('admin-1');
    expect(row.failure_count).toBe(0);
  });

  it('rejects a non-https endpoint before it can become a delivery target', async () => {
    const res = await SUBSCRIBE(
      jsonRequest('POST', {
        endpoint: 'http://evil.example/push',
        keys: { p256dh: 'pub', auth: 'sec' },
      }),
    );
    expect(res.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  /**
   * Security LOW-3. `https://` bounded the SCHEME and not the HOST, and
   * `web-push` POSTs a signed request to whatever string it is handed, from the
   * cron process, every fifteen minutes.
   */
  it.each([
    'https://evil.example/push',
    'https://internal.vercel.app/admin',
    'https://fcm.googleapis.com.evil.example/fcm/send/abc',
    'https://notfcm.googleapis.com/fcm/send/abc',
  ])('refuses %s, which no browser could have minted', async (endpoint) => {
    const res = await SUBSCRIBE(
      jsonRequest('POST', { endpoint, keys: { p256dh: 'pub', auth: 'sec' } }),
    );
    expect(res.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  // Anti-vacuity for the case above: a host allowlist that refused everything
  // would satisfy it while breaking every real browser.
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://sin.notify.windows.com/w/?token=abc',
    'https://web.push.apple.com/abc',
  ])('accepts %s, which a real subscribe() returns', async (endpoint) => {
    const res = await SUBSCRIBE(
      jsonRequest('POST', { endpoint, keys: { p256dh: 'pub', auth: 'sec' } }),
    );
    expect(res.status).toBe(201);
  });

  /**
   * Security LOW-2. The upsert is keyed on `endpoint` alone, so registering an
   * endpoint another operator holds silently ends THEIR alerts. That is the
   * intended "a device handed over moves with it" behaviour, but the audit entry
   * named only the acting admin, so the displaced operator was nowhere in the
   * trail.
   */
  it('records the operator whose device this registration takes over', async () => {
    existingRow.value = { user_id: 'admin-2' };

    const res = await SUBSCRIBE(
      jsonRequest('POST', {
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
        keys: { p256dh: 'pub', auth: 'sec' },
      }),
    );

    expect(res.status).toBe(201);
    const entry = logAdminAction.mock.calls[0]![0] as { metadata: Record<string, unknown> };
    expect(entry.metadata.displacedUserId).toBe('admin-2');
  });

  it('records no displacement when the operator re-registers their OWN device', async () => {
    existingRow.value = { user_id: ADMIN.id };

    await SUBSCRIBE(
      jsonRequest('POST', {
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
        keys: { p256dh: 'pub', auth: 'sec' },
      }),
    );

    const entry = logAdminAction.mock.calls[0]![0] as { metadata: Record<string, unknown> };
    expect(entry.metadata).not.toHaveProperty('displacedUserId');
  });

  it('records no displacement for a brand-new endpoint', async () => {
    await SUBSCRIBE(
      jsonRequest('POST', {
        endpoint: 'https://fcm.googleapis.com/fcm/send/new',
        keys: { p256dh: 'pub', auth: 'sec' },
      }),
    );

    const entry = logAdminAction.mock.calls[0]![0] as { metadata: Record<string, unknown> };
    expect(entry.metadata).not.toHaveProperty('displacedUserId');
  });

  it('401s an anonymous caller before touching the table', async () => {
    requirePlatformAdmin.mockRejectedValueOnce(new UnauthorizedError());
    const res = await SUBSCRIBE(
      jsonRequest('POST', {
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
        keys: { p256dh: 'pub', auth: 'sec' },
      }),
    );
    expect(res.status).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('never puts the subscription keys or endpoint path in the audit log', async () => {
    await SUBSCRIBE(
      jsonRequest('POST', {
        endpoint: 'https://fcm.googleapis.com/fcm/send/SECRET-DEVICE-ID',
        keys: { p256dh: 'PUBKEY', auth: 'AUTHSECRET' },
      }),
    );

    const entry = logAdminAction.mock.calls[0]![0] as unknown as {
      action: string;
      metadata: Record<string, unknown>;
      bestEffort: boolean;
    };
    expect(entry.action).toBe('push_subscription_added');
    expect(entry.bestEffort).toBe(true);
    const serialized = JSON.stringify(entry);
    expect(serialized).toContain('https://fcm.googleapis.com');
    expect(serialized).not.toContain('SECRET-DEVICE-ID');
    expect(serialized).not.toContain('PUBKEY');
    expect(serialized).not.toContain('AUTHSECRET');
  });

  it('deletes by endpoint AND user, so one operator cannot drop another device', async () => {
    const res = await UNSUBSCRIBE(
      jsonRequest('DELETE', { endpoint: 'https://fcm.googleapis.com/fcm/send/abc' }),
    );

    expect(res.status).toBe(200);
    expect(deleteFilters).toEqual([
      ['endpoint', 'https://fcm.googleapis.com/fcm/send/abc'],
      ['user_id', 'admin-1'],
    ]);
    expect(logAdminAction.mock.calls[0]![0]).toMatchObject({
      action: 'push_subscription_removed',
    });
  });
});
