/**
 * Route unit tests — POST /api/v1/admin/deletion-requests/[id]/intervene.
 *
 * Plan A1 drain #179.
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requirePlatformAdminMock, interveneCommunityDeletionMock } = vi.hoisted(() => ({
  requirePlatformAdminMock: vi.fn(),
  interveneCommunityDeletionMock: vi.fn(),
}));

vi.mock('@/lib/api/require-platform-admin', () => ({
  requirePlatformAdmin: requirePlatformAdminMock,
}));

vi.mock('@/lib/services/account-lifecycle-service', () => ({
  interveneCommunityDeletion: interveneCommunityDeletionMock,
}));

import { POST } from '../../src/app/api/v1/admin/deletion-requests/[id]/intervene/route';

function interveneRequest(
  requestId: string,
  init?: { body?: unknown },
): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/admin/deletion-requests/${requestId}/intervene`,
    {
      method: 'POST',
      headers: {
        origin: 'http://localhost:3001',
        'Content-Type': 'application/json',
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    },
  );
}

describe('POST /api/v1/admin/deletion-requests/[id]/intervene', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePlatformAdminMock.mockResolvedValue('admin-user-1');
    interveneCommunityDeletionMock.mockResolvedValue({
      id: 5,
      status: 'cancelled',
    });
  });

  it('returns 200 with canonical data envelope and forwards notes', async () => {
    const res = await POST(interveneRequest('5', { body: { notes: 'Customer retained' } }), {
      params: Promise.resolve({ id: '5' }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual({ id: 5, status: 'cancelled' });
    expect(interveneCommunityDeletionMock).toHaveBeenCalledWith(5, {
      adminUserId: 'admin-user-1',
      notes: 'Customer retained',
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3001');
  });

  it('returns 400 for invalid request id', async () => {
    const res = await POST(interveneRequest('bad-id', { body: {} }), {
      params: Promise.resolve({ id: 'bad-id' }),
    });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error?.code).toBe('VALIDATION_ERROR');
    expect(interveneCommunityDeletionMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid body', async () => {
    const res = await POST(
      interveneRequest('5', { body: { notes: 'x'.repeat(2001) } }),
      { params: Promise.resolve({ id: '5' }) },
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error?.code).toBe('VALIDATION_ERROR');
    expect(interveneCommunityDeletionMock).not.toHaveBeenCalled();
  });

  it('does not call interveneCommunityDeletion when platform admin check fails', async () => {
    const { ForbiddenError } = await import('@/lib/api/errors');
    requirePlatformAdminMock.mockRejectedValue(new ForbiddenError());

    const res = await POST(interveneRequest('5', { body: {} }), {
      params: Promise.resolve({ id: '5' }),
    });

    expect(res.status).toBe(403);
    expect(interveneCommunityDeletionMock).not.toHaveBeenCalled();
  });
});
