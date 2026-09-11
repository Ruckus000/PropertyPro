/**
 * GET /api/admin/health — the report as JSON.
 *
 * One thing to pin: the gate. This body is strictly more sensitive than the
 * unauthenticated `/api/health` two segments away — `ServiceStatus.meta` carries
 * upstream error messages verbatim and `FailedJob.error` is
 * `cron_runs.last_error`, which the web app's own public cron probe deliberately
 * withholds because it can contain query text and table internals.
 */
import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '@propertypro/shared/http';

let requirePlatformAdminImpl: () => Promise<{ id: string; email: string }> = async () => ({
  id: 'u',
  email: 'ops@getpropertypro.com',
});
vi.mock('@/lib/auth/platform-admin', () => ({
  requirePlatformAdmin: () => requirePlatformAdminImpl(),
}));

const getHealthReport = vi.fn(async (_deps?: unknown) => ({
  services: [],
  errors: null,
  jobs: [],
  errorsLastHour: 0,
  checkedAt: '2026-09-08T12:00:00Z',
}));
vi.mock('@/lib/server/health', () => ({ getHealthReport: (d?: unknown) => getHealthReport(d) }));

import { GET } from '@/app/api/admin/health/route';

const request = (headers: Record<string, string> = { host: 'admin.test' }) =>
  new NextRequest('http://admin.test/api/admin/health', { headers });

describe('GET /api/admin/health', () => {
  it('returns the report under the canonical data envelope', async () => {
    requirePlatformAdminImpl = async () => ({ id: 'u', email: 'ops@getpropertypro.com' });
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect((await res.json()).data.checkedAt).toBe('2026-09-08T12:00:00Z');
  });

  it('passes the validated request origin through to the Admin probe', async () => {
    requirePlatformAdminImpl = async () => ({ id: 'u', email: 'ops@getpropertypro.com' });
    await GET(request({ host: 'admin.test' }));
    expect(getHealthReport).toHaveBeenCalledWith({ adminOrigin: 'https://admin.test' });
  });

  it('passes undefined rather than a hostile Host header', async () => {
    requirePlatformAdminImpl = async () => ({ id: 'u', email: 'ops@getpropertypro.com' });
    await GET(request({ host: 'evil@admin.test' }));
    expect(getHealthReport).toHaveBeenCalledWith({ adminOrigin: undefined });
  });

  it('401s without a platform admin, and runs no probes', async () => {
    requirePlatformAdminImpl = async () => {
      throw new UnauthorizedError();
    };
    const res = await GET(request());
    expect(getHealthReport).not.toHaveBeenCalled();
    expect(res.status).toBe(401);
  });
});
