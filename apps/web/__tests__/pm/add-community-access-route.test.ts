/**
 * GET /api/v1/pm/communities/add-access answers for every signed-in user, so
 * the account menu can ask without a 403, and never writes anything.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const h = vi.hoisted(() => ({
  userId: vi.fn(),
  access: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ requireAuthenticatedUserId: h.userId }));
vi.mock('@/lib/api/pm-communities', () => ({ getAddCommunityAccess: h.access }));

import { GET } from '../../src/app/api/v1/pm/communities/add-access/route';

function get(headers: Record<string, string> = {}) {
  return GET(new NextRequest('http://localhost/api/v1/pm/communities/add-access', { headers }));
}

beforeEach(() => {
  vi.clearAllMocks();
  h.userId.mockResolvedValue('user-1');
});

describe('GET /api/v1/pm/communities/add-access', () => {
  it('returns the billing group an add would join', async () => {
    h.access.mockResolvedValue({ allowed: true, billingGroupId: 9 });

    const res = await get();

    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ allowed: true, billingGroupId: 9 });
    expect(h.access).toHaveBeenCalledWith('user-1');
  });

  it('returns a null group when this add would start one', async () => {
    h.access.mockResolvedValue({ allowed: true, billingGroupId: null });
    expect((await (await get()).json()).data).toEqual({ allowed: true, billingGroupId: null });
  });

  it('answers 200 not-allowed for someone who may not, rather than a 403', async () => {
    h.access.mockResolvedValue({ allowed: false, reason: 'not_root' });

    const res = await get();

    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ allowed: false, billingGroupId: null });
  });

  it('is never allowed under a support session, without asking', async () => {
    h.access.mockResolvedValue({ allowed: true, billingGroupId: 9 });

    const res = await get({ 'x-support-session-id': '42', 'x-support-community-id': '1' });

    expect((await res.json()).data).toEqual({ allowed: false, billingGroupId: null });
    expect(h.access).not.toHaveBeenCalled();
  });

  it('is 401 when signed out', async () => {
    h.userId.mockRejectedValue(new UnauthorizedError());
    expect((await get()).status).toBe(401);
  });
});
