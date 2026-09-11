/**
 * The three preference routes.
 *
 * The property worth the most here is the one that is structural rather than
 * conditional: the operator id comes from `requirePlatformAdmin()` and NEVER
 * from the request, so a body naming another admin cannot reach the service.
 * That is asserted directly rather than inferred from a 403.
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requirePlatformAdmin = vi.fn();
const getPreferences = vi.fn();
const updateAlertPrefs = vi.fn();
const markAllRead = vi.fn();

vi.mock('@/lib/auth/platform-admin', () => ({
  requirePlatformAdmin: () => requirePlatformAdmin(),
}));

vi.mock('@/lib/server/preferences', async () => {
  // The real module for the pure vocabulary the route's Zod schema is built
  // from — mocking ALERT_PREF_KEYS would make every validation case vacuous.
  const actual = await vi.importActual<typeof import('@/lib/server/preferences')>(
    '@/lib/server/preferences',
  );
  return {
    ...actual,
    getPreferences: (...a: unknown[]) => getPreferences(...a),
    updateAlertPrefs: (...a: unknown[]) => updateAlertPrefs(...a),
    markAllRead: (...a: unknown[]) => markAllRead(...a),
  };
});

import { DEFAULT_ALERT_PREFS } from '@/lib/server/preferences';
import { GET, PUT } from '@/app/api/admin/preferences/route';
import { POST } from '@/app/api/admin/preferences/read-all/route';

const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SOMEONE_ELSE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const PREFS = {
  notificationsReadAt: null,
  alertPrefs: DEFAULT_ALERT_PREFS,
  pushSentFingerprints: [],
};

function putRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3001/api/admin/preferences', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  requirePlatformAdmin.mockResolvedValue({ id: ME, email: 'ops@propertypro.test', role: 'super_admin' });
  getPreferences.mockResolvedValue(PREFS);
  updateAlertPrefs.mockResolvedValue(PREFS);
  markAllRead.mockResolvedValue({ ...PREFS, notificationsReadAt: '2026-09-11T08:00:00.000Z' });
});

describe('GET /api/admin/preferences', () => {
  it('returns this operator\'s preferences under `data`', async () => {
    const res = await GET(new NextRequest('http://localhost:3001/api/admin/preferences'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: PREFS });
    expect(getPreferences).toHaveBeenCalledWith(ME);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('propagates the gate\'s status rather than reading anything', async () => {
    const { UnauthorizedError } = await import('@propertypro/shared/http');
    requirePlatformAdmin.mockRejectedValue(new UnauthorizedError());

    const res = await GET(new NextRequest('http://localhost:3001/api/admin/preferences'));

    expect(res.status).toBe(401);
    expect(getPreferences).not.toHaveBeenCalled();
  });
});

describe('PUT /api/admin/preferences', () => {
  it('patches only the named keys', async () => {
    const res = await PUT(putRequest({ alertPrefs: { newLeadsDigest: true } }));
    expect(res.status).toBe(200);
    expect(updateAlertPrefs).toHaveBeenCalledWith(ME, { newLeadsDigest: true });
  });

  it('takes the operator id from the gate, never from the body', async () => {
    // Two independent defences, both asserted: `.strict()` refuses the extra
    // key outright, AND the id handed to the service is the gate's regardless.
    const res = await PUT(putRequest({ userId: SOMEONE_ELSE, alertPrefs: { errorSpikes: false } }));
    expect(res.status).toBe(400);
    expect(updateAlertPrefs).not.toHaveBeenCalled();

    const ok = await PUT(putRequest({ alertPrefs: { errorSpikes: false } }));
    expect(ok.status).toBe(200);
    expect(updateAlertPrefs).toHaveBeenCalledTimes(1);
    expect(updateAlertPrefs.mock.calls[0]![0]).toBe(ME);
  });

  it('400s an unknown preference key rather than silently dropping it', async () => {
    const res = await PUT(putRequest({ alertPrefs: { smokeSignals: true } }));
    expect(res.status).toBe(400);
    expect(updateAlertPrefs).not.toHaveBeenCalled();
  });

  it.each([
    ['zero', 0],
    ['negative', -5],
    ['above the ceiling', 1001],
    ['fractional', 10.5],
    ['a string', '25'],
  ])('400s a %s threshold', async (_label, value) => {
    const res = await PUT(putRequest({ alertPrefs: { errorSpikeThreshold: value } }));
    expect(res.status).toBe(400);
    expect(updateAlertPrefs).not.toHaveBeenCalled();
  });

  it('accepts the boundary values', async () => {
    expect((await PUT(putRequest({ alertPrefs: { errorSpikeThreshold: 1 } }))).status).toBe(200);
    expect((await PUT(putRequest({ alertPrefs: { errorSpikeThreshold: 1000 } }))).status).toBe(200);
  });

  it('400s a body with no alertPrefs at all', async () => {
    const res = await PUT(putRequest({}));
    expect(res.status).toBe(400);
    expect(updateAlertPrefs).not.toHaveBeenCalled();
  });

  it('runs the gate before parsing the body', async () => {
    const { ForbiddenError } = await import('@propertypro/shared/http');
    requirePlatformAdmin.mockRejectedValue(new ForbiddenError('Platform admin access required'));

    const res = await PUT(putRequest({ alertPrefs: { errorSpikes: false } }));

    expect(res.status).toBe(403);
    expect(updateAlertPrefs).not.toHaveBeenCalled();
  });

  it('surfaces a write failure as a 500 rather than a silent 200', async () => {
    updateAlertPrefs.mockRejectedValue(new Error('Failed to save alert preferences: nope'));
    const res = await PUT(putRequest({ alertPrefs: { errorSpikes: false } }));
    expect(res.status).toBe(500);
  });
});

describe('POST /api/admin/preferences/read-all', () => {
  it('stamps the watermark for this operator and returns it', async () => {
    const res = await POST(
      new NextRequest('http://localhost:3001/api/admin/preferences/read-all', { method: 'POST' }),
    );

    expect(res.status).toBe(200);
    expect((await res.json()).data.notificationsReadAt).toBe('2026-09-11T08:00:00.000Z');
    // Exactly one argument: the instant is the SERVER's, never the caller's.
    expect(markAllRead).toHaveBeenCalledWith(ME);
  });

  it('does not accept a caller-supplied instant', async () => {
    await POST(
      new NextRequest('http://localhost:3001/api/admin/preferences/read-all', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ at: '2099-01-01T00:00:00.000Z' }),
      }),
    );
    expect(markAllRead.mock.calls[0]).toEqual([ME]);
  });

  it('propagates the gate\'s status', async () => {
    const { UnauthorizedError } = await import('@propertypro/shared/http');
    requirePlatformAdmin.mockRejectedValue(new UnauthorizedError());

    const res = await POST(
      new NextRequest('http://localhost:3001/api/admin/preferences/read-all', { method: 'POST' }),
    );

    expect(res.status).toBe(401);
    expect(markAllRead).not.toHaveBeenCalled();
  });
});
