/**
 * Route unit tests — `DELETE /api/v1/accounting/disconnect`.
 *
 * Added alongside Plan A1 drain #84. Covers the contracted runRoute
 * envelope for the SECOND `DELETE` handler in the corpus (after
 * drain #22 `esign/consent`), and the first DELETE that carries a body.
 *
 * Cases: happy path (quickbooks + xero), 401 unauth, 400 missing
 * communityId, 400 missing provider, 400 invalid provider enum,
 * 403 demo-grace, 403 non-member, 403 accounting-disabled,
 * 403 accounting-write permission denied, and x-request-id null
 * forwarding at the 4th arg position.
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
  disconnectAccountingMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requireAccountingEnabledMock: vi.fn(),
  requireAccountingWritePermissionMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  disconnectAccountingMock: vi.fn(),
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
  disconnectAccounting: disconnectAccountingMock,
}));

import { DELETE } from '../../src/app/api/v1/accounting/disconnect/route';

const ADMIN_MEMBERSHIP = {
  userId: 'user-admin-1',
  communityId: 42,
  role: 'cam' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Community Association Manager',
  communityType: 'condo_718' as const,
};

const DISCONNECT_RESULT = { disconnected: true };

function jsonDelete(
  payload: unknown,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/accounting/disconnect', {
    method: 'DELETE',
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
  });
}

describe('DELETE /api/v1/accounting/disconnect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requireAccountingEnabledMock.mockReturnValue(undefined);
    requireAccountingWritePermissionMock.mockReturnValue(undefined);
    disconnectAccountingMock.mockResolvedValue(DISCONNECT_RESULT);
  });

  it('disconnects QuickBooks (happy path)', async () => {
    const res = await DELETE(
      jsonDelete(
        { communityId: 42, provider: 'quickbooks' },
        { 'x-request-id': 'req-abc' },
      ),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { disconnected: boolean } };
    expect(json).toEqual({ data: { disconnected: true } });

    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(
      expect.any(NextRequest),
      42,
    );
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-admin-1');
    expect(requireAccountingEnabledMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(requireAccountingWritePermissionMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(disconnectAccountingMock).toHaveBeenCalledWith(
      42,
      'user-admin-1',
      'quickbooks',
      'req-abc',
    );
  });

  it('disconnects Xero (happy path)', async () => {
    const res = await DELETE(
      jsonDelete(
        { communityId: 42, provider: 'xero' },
        { 'x-request-id': 'req-xyz' },
      ),
    );

    expect(res.status).toBe(200);
    expect(disconnectAccountingMock).toHaveBeenCalledWith(
      42,
      'user-admin-1',
      'xero',
      'req-xyz',
    );
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValue(
      new UnauthorizedError('Authentication required'),
    );

    const res = await DELETE(
      jsonDelete({ communityId: 42, provider: 'quickbooks' }),
    );

    expect(res.status).toBe(401);
    expect(disconnectAccountingMock).not.toHaveBeenCalled();
  });

  it('returns 400 when body is missing communityId', async () => {
    const res = await DELETE(jsonDelete({ provider: 'quickbooks' }));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(disconnectAccountingMock).not.toHaveBeenCalled();
  });

  it('returns 400 when body is missing provider', async () => {
    const res = await DELETE(jsonDelete({ communityId: 42 }));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(disconnectAccountingMock).not.toHaveBeenCalled();
  });

  it('returns 400 when provider is not a valid enum value', async () => {
    const res = await DELETE(
      jsonDelete({ communityId: 42, provider: 'stripe' }),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(disconnectAccountingMock).not.toHaveBeenCalled();
  });

  it('returns 403 during demo-grace', async () => {
    assertNotDemoGraceMock.mockRejectedValue(
      new ForbiddenError('Demo grace period active'),
    );

    const res = await DELETE(
      jsonDelete({ communityId: 42, provider: 'quickbooks' }),
    );

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(disconnectAccountingMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller is not a community member', async () => {
    requireCommunityMembershipMock.mockRejectedValue(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await DELETE(
      jsonDelete({ communityId: 42, provider: 'quickbooks' }),
    );

    expect(res.status).toBe(403);
    expect(requireAccountingEnabledMock).not.toHaveBeenCalled();
    expect(disconnectAccountingMock).not.toHaveBeenCalled();
  });

  it('returns 403 when accounting feature is disabled', async () => {
    requireAccountingEnabledMock.mockImplementation(() => {
      throw new ForbiddenError('Accounting feature not enabled');
    });

    const res = await DELETE(
      jsonDelete({ communityId: 42, provider: 'quickbooks' }),
    );

    expect(res.status).toBe(403);
    expect(requireAccountingWritePermissionMock).not.toHaveBeenCalled();
    expect(disconnectAccountingMock).not.toHaveBeenCalled();
  });

  it('returns 403 when accounting-write permission is denied', async () => {
    requireAccountingWritePermissionMock.mockImplementation(() => {
      throw new ForbiddenError('Missing accounting:write permission');
    });

    const res = await DELETE(
      jsonDelete({ communityId: 42, provider: 'quickbooks' }),
    );

    expect(res.status).toBe(403);
    expect(disconnectAccountingMock).not.toHaveBeenCalled();
  });

  it('forwards null x-request-id verbatim when the header is absent', async () => {
    const res = await DELETE(
      jsonDelete({ communityId: 42, provider: 'quickbooks' }),
    );

    expect(res.status).toBe(200);
    expect(disconnectAccountingMock).toHaveBeenCalledWith(
      42,
      'user-admin-1',
      'quickbooks',
      null,
    );
    // Belt-and-suspenders: assert exact index [3] position.
    const call = disconnectAccountingMock.mock.calls[0];
    expect(call[3]).toBeNull();
  });
});
