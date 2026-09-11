/**
 * GET /api/admin/onboarding — the pipeline as JSON.
 *
 * Two things to pin. The GATE, because the body names every open lead, every
 * unconverted demo prospect and every trialing community on the platform — the
 * whole commercial pipeline. And the `?community=` parser, because it decides
 * which checklist is expanded and is fed straight from a URL.
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

const getPipeline = vi.fn(async (_communityId?: number) => ({
  stages: { lead: [], demo: [], trial: [], active: [] },
  checklist: null,
  generatedAt: '2026-09-08T12:00:00Z',
}));
vi.mock('@/lib/server/onboarding', () => ({ getPipeline: (id?: number) => getPipeline(id) }));

import { GET } from '@/app/api/admin/onboarding/route';

const request = (query = '') =>
  new NextRequest(`http://admin.test/api/admin/onboarding${query}`, {
    headers: { host: 'admin.test' },
  });

describe('GET /api/admin/onboarding', () => {
  it('returns the pipeline under the canonical data envelope', async () => {
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect((await res.json()).data.generatedAt).toBe('2026-09-08T12:00:00Z');
  });

  it('forwards a positive integer community id', async () => {
    await GET(request('?community=42'));
    expect(getPipeline).toHaveBeenCalledWith(42);
  });

  it.each(['?community=abc', '?community=-1', '?community=0', '?community=1.5', '?community='])(
    'drops %s rather than passing it on',
    async (query) => {
      await GET(request(query));
      // `undefined`, not the junk value: the focus then falls back to the trial
      // ending soonest instead of matching nothing.
      expect(getPipeline).toHaveBeenCalledWith(undefined);
    },
  );

  it('401s without a platform admin, and reads nothing', async () => {
    requirePlatformAdminImpl = async () => {
      throw new UnauthorizedError();
    };
    const res = await GET(request());
    expect(getPipeline).not.toHaveBeenCalled();
    expect(res.status).toBe(401);
    requirePlatformAdminImpl = async () => ({ id: 'u', email: 'ops@getpropertypro.com' });
  });
});
