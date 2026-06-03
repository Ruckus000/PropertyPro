/**
 * Route unit tests — DELETE /api/v1/admin/access-plans/[id].
 *
 * Plan A1 drain.
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requirePlatformAdminMock, revokeFreeAccessMock } = vi.hoisted(() => ({
  requirePlatformAdminMock: vi.fn(),
  revokeFreeAccessMock: vi.fn(),
}));

vi.mock('@/lib/api/require-platform-admin', () => ({
  requirePlatformAdmin: requirePlatformAdminMock,
}));

vi.mock('@/lib/services/account-lifecycle-service', () => ({
  revokeFreeAccess: revokeFreeAccessMock,
}));

import { DELETE } from '../../src/app/api/v1/admin/access-plans/[id]/route';

function revokeRequest(
  planId: string,
  init?: { body?: unknown; hasBody?: boolean },
): NextRequest {
  const hasBody = init?.hasBody ?? init?.body !== undefined;
  return new NextRequest(
    `http://localhost:3000/api/v1/admin/access-plans/${planId}`,
    {
      method: 'DELETE',
      headers: {
        origin: 'http://localhost:3001',
        'Content-Type': 'application/json',
      },
      body: hasBody ? JSON.stringify(init?.body ?? {}) : undefined,
    },
  );
}

describe('DELETE /api/v1/admin/access-plans/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePlatformAdminMock.mockResolvedValue('admin-user-1');
    revokeFreeAccessMock.mockResolvedValue({
      id: 7,
      communityId: 42,
      revokedBy: 'admin-user-1',
    });
  });

  it('returns 200 with canonical data envelope and forwards reason', async () => {
    const res = await DELETE(revokeRequest('7', { body: { reason: 'No longer eligible' } }), {
      params: Promise.resolve({ id: '7' }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual({ id: 7, communityId: 42, revokedBy: 'admin-user-1' });
    expect(revokeFreeAccessMock).toHaveBeenCalledWith(7, {
      revokedBy: 'admin-user-1',
      reason: 'No longer eligible',
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3001');
  });

  it('returns 200 with reason undefined when body is omitted', async () => {
    const res = await DELETE(revokeRequest('7', { hasBody: false }), {
      params: Promise.resolve({ id: '7' }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual({ id: 7, communityId: 42, revokedBy: 'admin-user-1' });
    expect(revokeFreeAccessMock).toHaveBeenCalledWith(7, {
      revokedBy: 'admin-user-1',
      reason: undefined,
    });
  });

  it('returns 401 when the caller is not authenticated', async () => {
    const { UnauthorizedError } = await import('@/lib/api/errors');
    requirePlatformAdminMock.mockRejectedValue(new UnauthorizedError());

    const res = await DELETE(revokeRequest('7', { body: {} }), {
      params: Promise.resolve({ id: '7' }),
    });

    expect(res.status).toBe(401);
    expect(revokeFreeAccessMock).not.toHaveBeenCalled();
  });

  it('returns 400 for non-numeric plan id', async () => {
    const res = await DELETE(revokeRequest('abc', { body: {} }), {
      params: Promise.resolve({ id: 'abc' }),
    });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error?.code).toBe('VALIDATION_ERROR');
    expect(revokeFreeAccessMock).not.toHaveBeenCalled();
  });

  it('returns 400 for zero plan id', async () => {
    const res = await DELETE(revokeRequest('0', { body: {} }), {
      params: Promise.resolve({ id: '0' }),
    });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error?.code).toBe('VALIDATION_ERROR');
    expect(revokeFreeAccessMock).not.toHaveBeenCalled();
  });

  it('returns 400 when reason exceeds max length', async () => {
    const res = await DELETE(
      revokeRequest('7', { body: { reason: 'x'.repeat(1001) } }),
      { params: Promise.resolve({ id: '7' }) },
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error?.code).toBe('VALIDATION_ERROR');
    expect(revokeFreeAccessMock).not.toHaveBeenCalled();
  });

  it('does not call revokeFreeAccess when platform admin check fails', async () => {
    const { ForbiddenError } = await import('@/lib/api/errors');
    requirePlatformAdminMock.mockRejectedValue(new ForbiddenError());

    const res = await DELETE(revokeRequest('7', { body: {} }), {
      params: Promise.resolve({ id: '7' }),
    });

    expect(res.status).toBe(403);
    expect(revokeFreeAccessMock).not.toHaveBeenCalled();
  });
});
