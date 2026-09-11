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
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '@propertypro/shared/http';

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
vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminTypedClient: () => ({
    from: () => ({
      upsert,
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

describe('/api/admin/push/subscriptions', () => {
  beforeEach(() => {
    requirePlatformAdmin.mockResolvedValue(ADMIN);
    deleteFilters.length = 0;
    deleteResult.error = null;
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
