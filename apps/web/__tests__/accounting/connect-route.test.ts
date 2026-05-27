/**
 * Route unit tests — `POST /api/v1/accounting/connect`.
 *
 * Added alongside Plan A1 drain #87. Near-mirror of the disconnect
 * sibling (drain #84) test file — same auth chain, same body shape — but
 * the service is `initiateAccountingConnect`, a 3-arg call with no
 * requestId. There is therefore no x-request-id forwarding test.
 *
 * Cases: happy path (quickbooks + xero), 401 unauth, 400 missing
 * communityId, 400 missing provider, 400 invalid provider enum,
 * 403 demo-grace, 403 non-member, 403 accounting-disabled,
 * 403 accounting-write permission denied.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requireAccountingEnabledMock,
  requireAccountingWritePermissionMock,
  assertNotDemoGraceMock,
  initiateAccountingConnectMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requireAccountingEnabledMock: vi.fn(),
  requireAccountingWritePermissionMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  initiateAccountingConnectMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: resolveEffectiveCommunityIdMock,
}));

vi.mock('@/lib/accounting/common', () => ({
  requireAccountingEnabled: requireAccountingEnabledMock,
  requireAccountingWritePermission: requireAccountingWritePermissionMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/services/accounting-connectors-service', () => ({
  initiateAccountingConnect: initiateAccountingConnectMock,
}));

import { POST } from '../../src/app/api/v1/accounting/connect/route';

const ADMIN_MEMBERSHIP = {
  userId: 'user-admin-1',
  communityId: 42,
  role: 'cam' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Community Association Manager',
  communityType: 'condo_718' as const,
};

const CONNECT_RESULT = { redirectUrl: 'https://oauth.example/connect' };

function jsonPost(
  payload: unknown,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/accounting/connect', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
  });
}

describe('POST /api/v1/accounting/connect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requireAccountingEnabledMock.mockReturnValue(undefined);
    requireAccountingWritePermissionMock.mockReturnValue(undefined);
    initiateAccountingConnectMock.mockResolvedValue(CONNECT_RESULT);
  });

  it('initiates QuickBooks connect (happy path)', async () => {
    const res = await POST(
      jsonPost({ communityId: 42, provider: 'quickbooks' }),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { redirectUrl: string } };
    expect(json).toEqual({ data: { redirectUrl: 'https://oauth.example/connect' } });

    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(
      expect.any(NextRequest),
      42,
    );
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-admin-1');
    expect(requireAccountingEnabledMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(requireAccountingWritePermissionMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(initiateAccountingConnectMock).toHaveBeenCalledWith(
      42,
      'user-admin-1',
      'quickbooks',
    );
    // Assert 3-arg shape (no requestId tail position).
    expect(initiateAccountingConnectMock.mock.calls[0]).toHaveLength(3);
  });

  it('initiates Xero connect (happy path)', async () => {
    const res = await POST(
      jsonPost({ communityId: 42, provider: 'xero' }),
    );

    expect(res.status).toBe(200);
    expect(initiateAccountingConnectMock).toHaveBeenCalledWith(
      42,
      'user-admin-1',
      'xero',
    );
    expect(initiateAccountingConnectMock.mock.calls[0]).toHaveLength(3);
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValue(
      new UnauthorizedError('Authentication required'),
    );

    const res = await POST(
      jsonPost({ communityId: 42, provider: 'quickbooks' }),
    );

    expect(res.status).toBe(401);
    expect(initiateAccountingConnectMock).not.toHaveBeenCalled();
  });

  it('returns 400 when body is missing communityId', async () => {
    const res = await POST(jsonPost({ provider: 'quickbooks' }));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(initiateAccountingConnectMock).not.toHaveBeenCalled();
  });

  it('returns 400 when body is missing provider', async () => {
    const res = await POST(jsonPost({ communityId: 42 }));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(initiateAccountingConnectMock).not.toHaveBeenCalled();
  });

  it('returns 400 when provider is not a valid enum value', async () => {
    const res = await POST(
      jsonPost({ communityId: 42, provider: 'stripe' }),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(initiateAccountingConnectMock).not.toHaveBeenCalled();
  });

  it('returns 403 during demo-grace', async () => {
    assertNotDemoGraceMock.mockRejectedValue(
      new ForbiddenError('Demo grace period active'),
    );

    const res = await POST(
      jsonPost({ communityId: 42, provider: 'quickbooks' }),
    );

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(initiateAccountingConnectMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller is not a community member', async () => {
    requireCommunityMembershipMock.mockRejectedValue(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await POST(
      jsonPost({ communityId: 42, provider: 'quickbooks' }),
    );

    expect(res.status).toBe(403);
    expect(requireAccountingEnabledMock).not.toHaveBeenCalled();
    expect(initiateAccountingConnectMock).not.toHaveBeenCalled();
  });

  it('returns 403 when accounting feature is disabled', async () => {
    requireAccountingEnabledMock.mockImplementation(() => {
      throw new ForbiddenError('Accounting feature not enabled');
    });

    const res = await POST(
      jsonPost({ communityId: 42, provider: 'quickbooks' }),
    );

    expect(res.status).toBe(403);
    expect(requireAccountingWritePermissionMock).not.toHaveBeenCalled();
    expect(initiateAccountingConnectMock).not.toHaveBeenCalled();
  });

  it('returns 403 when accounting-write permission is denied', async () => {
    requireAccountingWritePermissionMock.mockImplementation(() => {
      throw new ForbiddenError('Missing accounting:write permission');
    });

    const res = await POST(
      jsonPost({ communityId: 42, provider: 'quickbooks' }),
    );

    expect(res.status).toBe(403);
    expect(initiateAccountingConnectMock).not.toHaveBeenCalled();
  });
});
