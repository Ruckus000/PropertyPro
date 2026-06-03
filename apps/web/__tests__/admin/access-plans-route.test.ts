/**
 * Route unit tests — GET + POST /api/v1/admin/access-plans.
 *
 * Plan A1 auto-drain.
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  requirePlatformAdminMock,
  listAccessPlansWithStatusMock,
  communityExistsAdminMock,
  grantFreeAccessMock,
  computeAccessPlanStatusMock,
} = vi.hoisted(() => ({
  requirePlatformAdminMock: vi.fn(),
  listAccessPlansWithStatusMock: vi.fn(),
  communityExistsAdminMock: vi.fn(),
  grantFreeAccessMock: vi.fn(),
  computeAccessPlanStatusMock: vi.fn(),
}));

vi.mock('@/lib/api/require-platform-admin', () => ({
  requirePlatformAdmin: requirePlatformAdminMock,
}));

vi.mock('@/lib/services/account-lifecycle-service', () => ({
  listAccessPlansWithStatus: listAccessPlansWithStatusMock,
  communityExistsAdmin: communityExistsAdminMock,
  grantFreeAccess: grantFreeAccessMock,
  computeAccessPlanStatus: computeAccessPlanStatusMock,
}));

import { GET, POST } from '../../src/app/api/v1/admin/access-plans/route';

function listRequest(query = ''): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/admin/access-plans${query}`,
    { headers: { origin: 'http://localhost:3001' } },
  );
}

function grantRequest(init?: { body?: unknown }): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/admin/access-plans', {
    method: 'POST',
    headers: {
      origin: 'http://localhost:3001',
      'Content-Type': 'application/json',
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

describe('GET /api/v1/admin/access-plans', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePlatformAdminMock.mockResolvedValue('admin-user-1');
    listAccessPlansWithStatusMock.mockResolvedValue([
      { id: 10, communityId: 42, status: 'active' },
    ]);
  });

  it('returns 200 with canonical data envelope and lists all plans when no filter', async () => {
    const res = await GET(listRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual([{ id: 10, communityId: 42, status: 'active' }]);
    expect(listAccessPlansWithStatusMock).toHaveBeenCalledWith();
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3001');
  });

  it('forwards a valid communityId filter to the service', async () => {
    const res = await GET(listRequest('?communityId=42'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual([{ id: 10, communityId: 42, status: 'active' }]);
    expect(listAccessPlansWithStatusMock).toHaveBeenCalledWith({ communityId: 42 });
  });

  it('treats an empty communityId param as no filter', async () => {
    const res = await GET(listRequest('?communityId='));

    expect(res.status).toBe(200);
    expect(listAccessPlansWithStatusMock).toHaveBeenCalledWith();
  });

  it('returns 400 for a non-numeric communityId', async () => {
    const res = await GET(listRequest('?communityId=abc'));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error?.code).toBe('VALIDATION_ERROR');
    expect(listAccessPlansWithStatusMock).not.toHaveBeenCalled();
  });

  it('returns 400 for a zero communityId', async () => {
    const res = await GET(listRequest('?communityId=0'));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error?.code).toBe('VALIDATION_ERROR');
    expect(listAccessPlansWithStatusMock).not.toHaveBeenCalled();
  });

  it('does not call listAccessPlansWithStatus when platform admin check fails', async () => {
    const { ForbiddenError } = await import('@/lib/api/errors');
    requirePlatformAdminMock.mockRejectedValue(new ForbiddenError());

    const res = await GET(listRequest('?communityId=42'));

    expect(res.status).toBe(403);
    expect(listAccessPlansWithStatusMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/admin/access-plans', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePlatformAdminMock.mockResolvedValue('admin-user-1');
    communityExistsAdminMock.mockResolvedValue(true);
    grantFreeAccessMock.mockResolvedValue({ id: 7, communityId: 42 });
    computeAccessPlanStatusMock.mockReturnValue('active');
  });

  it('returns 200 with canonical data envelope and grants access with all fields', async () => {
    const res = await POST(
      grantRequest({
        body: {
          communityId: 42,
          durationMonths: 12,
          gracePeriodDays: 14,
          notes: 'Pilot program',
        },
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual({ id: 7, communityId: 42, status: 'active' });
    expect(communityExistsAdminMock).toHaveBeenCalledWith(42);
    expect(grantFreeAccessMock).toHaveBeenCalledWith(42, {
      durationMonths: 12,
      gracePeriodDays: 14,
      notes: 'Pilot program',
      grantedBy: 'admin-user-1',
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3001');
  });

  it('applies the gracePeriodDays default of 30 and omits notes when not provided', async () => {
    const res = await POST(
      grantRequest({ body: { communityId: 42, durationMonths: 6 } }),
    );

    expect(res.status).toBe(200);
    expect(grantFreeAccessMock).toHaveBeenCalledWith(42, {
      durationMonths: 6,
      gracePeriodDays: 30,
      notes: undefined,
      grantedBy: 'admin-user-1',
    });
  });

  it('returns 400 when communityId is missing', async () => {
    const res = await POST(grantRequest({ body: { durationMonths: 12 } }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error?.code).toBe('VALIDATION_ERROR');
    expect(grantFreeAccessMock).not.toHaveBeenCalled();
  });

  it('returns 400 when durationMonths is out of range', async () => {
    const res = await POST(
      grantRequest({ body: { communityId: 42, durationMonths: 0 } }),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error?.code).toBe('VALIDATION_ERROR');
    expect(grantFreeAccessMock).not.toHaveBeenCalled();
  });

  it('returns 400 when notes exceeds the max length', async () => {
    const res = await POST(
      grantRequest({
        body: { communityId: 42, durationMonths: 12, notes: 'x'.repeat(1001) },
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error?.code).toBe('VALIDATION_ERROR');
    expect(grantFreeAccessMock).not.toHaveBeenCalled();
  });

  it('returns 400 with the "Community not found" business-rule error', async () => {
    communityExistsAdminMock.mockResolvedValue(false);

    const res = await POST(
      grantRequest({ body: { communityId: 99, durationMonths: 12 } }),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error?.code).toBe('VALIDATION_ERROR');
    expect(json.error?.message).toBe('Community not found');
    expect(grantFreeAccessMock).not.toHaveBeenCalled();
  });

  it('does not call community/grant services when platform admin check fails', async () => {
    const { ForbiddenError } = await import('@/lib/api/errors');
    requirePlatformAdminMock.mockRejectedValue(new ForbiddenError());

    const res = await POST(
      grantRequest({ body: { communityId: 42, durationMonths: 12 } }),
    );

    expect(res.status).toBe(403);
    expect(communityExistsAdminMock).not.toHaveBeenCalled();
    expect(grantFreeAccessMock).not.toHaveBeenCalled();
  });
});
