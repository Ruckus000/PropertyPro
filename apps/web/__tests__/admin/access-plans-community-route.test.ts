/**
 * Route unit tests — GET /api/v1/admin/access-plans/community/[id].
 *
 * Plan A1 drain #178.
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requirePlatformAdminMock, listAccessPlansWithStatusMock } = vi.hoisted(() => ({
  requirePlatformAdminMock: vi.fn(),
  listAccessPlansWithStatusMock: vi.fn(),
}));

vi.mock('@/lib/api/require-platform-admin', () => ({
  requirePlatformAdmin: requirePlatformAdminMock,
}));

vi.mock('@/lib/services/account-lifecycle-service', () => ({
  listAccessPlansWithStatus: listAccessPlansWithStatusMock,
}));

import { GET } from '../../src/app/api/v1/admin/access-plans/community/[id]/route';

function communityPlansRequest(communityId: string): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/admin/access-plans/community/${communityId}`,
    { headers: { origin: 'http://localhost:3001' } },
  );
}

describe('GET /api/v1/admin/access-plans/community/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePlatformAdminMock.mockResolvedValue('admin-user-1');
    listAccessPlansWithStatusMock.mockResolvedValue([
      { id: 10, communityId: 42, status: 'active' },
    ]);
  });

  it('returns 200 with canonical data envelope for a valid community id', async () => {
    const res = await GET(communityPlansRequest('42'), {
      params: Promise.resolve({ id: '42' }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual([{ id: 10, communityId: 42, status: 'active' }]);
    expect(listAccessPlansWithStatusMock).toHaveBeenCalledWith({ communityId: 42 });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3001');
  });

  it('returns 400 for invalid community id', async () => {
    const res = await GET(communityPlansRequest('not-a-number'), {
      params: Promise.resolve({ id: 'not-a-number' }),
    });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error?.code).toBe('VALIDATION_ERROR');
    expect(listAccessPlansWithStatusMock).not.toHaveBeenCalled();
  });

  it('does not call listAccessPlansWithStatus when platform admin check fails', async () => {
    const { ForbiddenError } = await import('@/lib/api/errors');
    requirePlatformAdminMock.mockRejectedValue(new ForbiddenError());

    const res = await GET(communityPlansRequest('42'), {
      params: Promise.resolve({ id: '42' }),
    });

    expect(res.status).toBe(403);
    expect(listAccessPlansWithStatusMock).not.toHaveBeenCalled();
  });
});
