/**
 * Route unit tests — POST /api/v1/admin/deletion-requests/[id]/recover.
 *
 * Plan A1 drain.
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  requirePlatformAdminMock,
  getDeletionRequestTypeMock,
  recoverUserMock,
  recoverCommunityMock,
} = vi.hoisted(() => ({
  requirePlatformAdminMock: vi.fn(),
  getDeletionRequestTypeMock: vi.fn(),
  recoverUserMock: vi.fn(),
  recoverCommunityMock: vi.fn(),
}));

vi.mock('@/lib/api/require-platform-admin', () => ({
  requirePlatformAdmin: requirePlatformAdminMock,
}));

vi.mock('@/lib/services/account-lifecycle-service', () => ({
  getDeletionRequestType: getDeletionRequestTypeMock,
  recoverUser: recoverUserMock,
  recoverCommunity: recoverCommunityMock,
}));

import { POST } from '../../src/app/api/v1/admin/deletion-requests/[id]/recover/route';

function recoverRequest(requestId: string): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/admin/deletion-requests/${requestId}/recover`,
    {
      method: 'POST',
      headers: {
        origin: 'http://localhost:3001',
      },
    },
  );
}

describe('POST /api/v1/admin/deletion-requests/[id]/recover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePlatformAdminMock.mockResolvedValue('admin-user-1');
    getDeletionRequestTypeMock.mockResolvedValue('user');
    recoverUserMock.mockResolvedValue({ id: 5, status: 'recovered' });
    recoverCommunityMock.mockResolvedValue({ id: 7, status: 'recovered' });
  });

  it('recovers a user and returns canonical data envelope with CORS', async () => {
    const res = await POST(recoverRequest('5'), {
      params: Promise.resolve({ id: '5' }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual({ id: 5, status: 'recovered' });
    expect(getDeletionRequestTypeMock).toHaveBeenCalledWith(5);
    expect(recoverUserMock).toHaveBeenCalledWith(5, 'admin-user-1');
    expect(recoverCommunityMock).not.toHaveBeenCalled();
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'http://localhost:3001',
    );
  });

  it('dispatches to recoverCommunity when request_type is community', async () => {
    getDeletionRequestTypeMock.mockResolvedValue('community');

    const res = await POST(recoverRequest('7'), {
      params: Promise.resolve({ id: '7' }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual({ id: 7, status: 'recovered' });
    expect(recoverCommunityMock).toHaveBeenCalledWith(7, 'admin-user-1');
    expect(recoverUserMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the deletion request is not found', async () => {
    getDeletionRequestTypeMock.mockResolvedValue(null);

    const res = await POST(recoverRequest('5'), {
      params: Promise.resolve({ id: '5' }),
    });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error?.message).toBe('Deletion request not found');
    expect(recoverUserMock).not.toHaveBeenCalled();
    expect(recoverCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 for a non-numeric request id', async () => {
    const res = await POST(recoverRequest('abc'), {
      params: Promise.resolve({ id: 'abc' }),
    });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error?.code).toBe('VALIDATION_ERROR');
    expect(getDeletionRequestTypeMock).not.toHaveBeenCalled();
  });

  it('returns 400 for a zero request id', async () => {
    const res = await POST(recoverRequest('0'), {
      params: Promise.resolve({ id: '0' }),
    });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error?.code).toBe('VALIDATION_ERROR');
    expect(getDeletionRequestTypeMock).not.toHaveBeenCalled();
  });

  it('does not call any service when the platform admin check fails', async () => {
    const { ForbiddenError } = await import('@/lib/api/errors');
    requirePlatformAdminMock.mockRejectedValue(new ForbiddenError());

    const res = await POST(recoverRequest('5'), {
      params: Promise.resolve({ id: '5' }),
    });

    expect(res.status).toBe(403);
    expect(getDeletionRequestTypeMock).not.toHaveBeenCalled();
    expect(recoverUserMock).not.toHaveBeenCalled();
    expect(recoverCommunityMock).not.toHaveBeenCalled();
  });
});
