/**
 * Route unit tests — GET /api/v1/admin/deletion-requests.
 *
 * Plan A1 drain #175.
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requirePlatformAdminMock, listDeletionRequestsMock } = vi.hoisted(() => ({
  requirePlatformAdminMock: vi.fn(),
  listDeletionRequestsMock: vi.fn(),
}));

vi.mock('@/lib/api/require-platform-admin', () => ({
  requirePlatformAdmin: requirePlatformAdminMock,
}));

vi.mock('@/lib/services/account-lifecycle-service', () => ({
  listDeletionRequests: listDeletionRequestsMock,
}));

import { GET } from '../../src/app/api/v1/admin/deletion-requests/route';

function listRequest(query = ''): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/admin/deletion-requests${query}`,
    {
      headers: { origin: 'http://localhost:3001' },
    },
  );
}

describe('GET /api/v1/admin/deletion-requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePlatformAdminMock.mockResolvedValue('admin-user-1');
    listDeletionRequestsMock.mockResolvedValue([
      { id: 1, status: 'cooling', requestType: 'user' },
    ]);
  });

  it('returns 200 with canonical data envelope and forwards filters', async () => {
    const res = await GET(listRequest('?status=cooling&type=user'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual([{ id: 1, status: 'cooling', requestType: 'user' }]);
    expect(listDeletionRequestsMock).toHaveBeenCalledWith({
      status: 'cooling',
      requestType: 'user',
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3001');
  });

  it('omits filters when query params are absent', async () => {
    await GET(listRequest());

    expect(listDeletionRequestsMock).toHaveBeenCalledWith({
      status: undefined,
      requestType: undefined,
    });
  });

  it('returns 400 for invalid status filter', async () => {
    const res = await GET(listRequest('?status=not-a-status'));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error?.code).toBe('VALIDATION_ERROR');
    expect(listDeletionRequestsMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid type filter', async () => {
    const res = await GET(listRequest('?type=invalid'));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error?.code).toBe('VALIDATION_ERROR');
    expect(listDeletionRequestsMock).not.toHaveBeenCalled();
  });

  it('does not call listDeletionRequests when platform admin check fails', async () => {
    const { ForbiddenError } = await import('@/lib/api/errors');
    requirePlatformAdminMock.mockRejectedValue(new ForbiddenError());

    const res = await GET(listRequest());
    expect(res.status).toBe(403);
    expect(listDeletionRequestsMock).not.toHaveBeenCalled();
  });
});
