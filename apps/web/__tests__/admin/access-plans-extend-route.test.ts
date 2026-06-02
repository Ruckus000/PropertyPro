/**
 * Route unit tests — POST /api/v1/admin/access-plans/[id]/extend.
 *
 * Plan A1 drain #180.
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  requirePlatformAdminMock,
  extendFreeAccessMock,
  computeAccessPlanStatusMock,
} = vi.hoisted(() => ({
  requirePlatformAdminMock: vi.fn(),
  extendFreeAccessMock: vi.fn(),
  computeAccessPlanStatusMock: vi.fn(),
}));

vi.mock('@/lib/api/require-platform-admin', () => ({
  requirePlatformAdmin: requirePlatformAdminMock,
}));

vi.mock('@/lib/services/account-lifecycle-service', () => ({
  extendFreeAccess: extendFreeAccessMock,
  computeAccessPlanStatus: computeAccessPlanStatusMock,
}));

import { POST } from '../../src/app/api/v1/admin/access-plans/[id]/extend/route';

function extendRequest(planId: string, body: unknown): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/admin/access-plans/${planId}/extend`,
    {
      method: 'POST',
      headers: {
        origin: 'http://localhost:3001',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
}

describe('POST /api/v1/admin/access-plans/[id]/extend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePlatformAdminMock.mockResolvedValue('admin-user-1');
    extendFreeAccessMock.mockResolvedValue({
      id: 9,
      communityId: 42,
      durationMonths: 12,
    });
    computeAccessPlanStatusMock.mockReturnValue('active');
  });

  it('returns 200 with canonical data envelope including computed status', async () => {
    const res = await POST(
      extendRequest('9', { additionalMonths: 6, notes: 'Board approved' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual({
      id: 9,
      communityId: 42,
      durationMonths: 12,
      status: 'active',
    });
    expect(extendFreeAccessMock).toHaveBeenCalledWith(9, {
      additionalMonths: 6,
      grantedBy: 'admin-user-1',
      notes: 'Board approved',
    });
    expect(computeAccessPlanStatusMock).toHaveBeenCalled();
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3001');
  });

  it('returns 400 for invalid plan id', async () => {
    const res = await POST(
      extendRequest('bad', { additionalMonths: 3 }),
      { params: Promise.resolve({ id: 'bad' }) },
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error?.code).toBe('VALIDATION_ERROR');
    expect(extendFreeAccessMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid body', async () => {
    const res = await POST(
      extendRequest('9', { additionalMonths: 0 }),
      { params: Promise.resolve({ id: '9' }) },
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error?.code).toBe('VALIDATION_ERROR');
    expect(extendFreeAccessMock).not.toHaveBeenCalled();
  });

  it('does not call extendFreeAccess when platform admin check fails', async () => {
    const { ForbiddenError } = await import('@/lib/api/errors');
    requirePlatformAdminMock.mockRejectedValue(new ForbiddenError());

    const res = await POST(
      extendRequest('9', { additionalMonths: 3 }),
      { params: Promise.resolve({ id: '9' }) },
    );

    expect(res.status).toBe(403);
    expect(extendFreeAccessMock).not.toHaveBeenCalled();
  });
});
