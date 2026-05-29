import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requirePermissionMock,
  fromMock,
  logAuditEventMock,
} = vi.hoisted(() => {
  const makeChain = () => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [] }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({ data: { id: 99 }, error: null }),
      })),
    })),
    update: vi.fn().mockReturnThis(),
  });
  return {
    requireAuthenticatedUserIdMock: vi.fn(),
    requireCommunityMembershipMock: vi.fn(),
    requirePermissionMock: vi.fn(),
    fromMock: vi.fn(() => makeChain()),
    logAuditEventMock: vi.fn(),
  };
});

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminTypedClient: () => ({ from: fromMock }),
}));

vi.mock('@propertypro/db', () => ({
  logAuditEvent: logAuditEventMock,
}));

import { GET, POST } from '../../src/app/api/v1/settings/support-access/route';

describe('settings/support-access route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('admin-1');
    requireCommunityMembershipMock.mockResolvedValue({ role: 'board_president' });
  });

  it('GET returns consent status', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/settings/support-access?communityId=42',
    );
    const res = await GET(req);
    const json = (await res.json()) as {
      data: { consentActive: boolean; recentAccess: unknown[] };
    };

    expect(res.status).toBe(200);
    expect(json.data.consentActive).toBe(false);
    expect(Array.isArray(json.data.recentAccess)).toBe(true);
  });

  it('GET requires communityId', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/settings/support-access');
    const res = await GET(req);

    expect(res.status).toBe(400);
  });

  it('POST enables consent', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/settings/support-access', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ communityId: 42, enabled: true }),
    });
    const res = await POST(req);
    const json = (await res.json()) as { data: { ok: boolean } };

    expect(res.status).toBe(200);
    expect(json.data).toEqual({ ok: true });
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'support_consent_granted' }),
    );
  });
});
