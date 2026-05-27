/**
 * Route unit tests — `GET /api/v1/accounting/mapping` and
 * `PUT /api/v1/accounting/mapping`.
 *
 * Added alongside Plan A1 drain #88. Two-contract file (GET+PUT). The
 * runner dispatches by exported handler name; per-method auth gates differ
 * (read for GET, write for PUT). PUT additionally gates on
 * `assertNotDemoGrace`. PUT forwards `x-request-id` (5th positional arg)
 * with explicit `null`-when-absent assertion.
 *
 * Cases:
 *   GET — happy path, 401 unauth, 400 missing communityId, 400 missing
 *         provider, 400 invalid provider enum, 403 non-member,
 *         403 accounting-disabled.
 *   PUT — happy path, 401 unauth, 400 missing communityId, 400 missing
 *         provider, 400 missing mapping, 403 demo-grace,
 *         403 non-member, 403 accounting-write denied,
 *         null x-request-id forwarding.
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
  requireAccountingReadPermissionMock,
  requireAccountingWritePermissionMock,
  assertNotDemoGraceMock,
  getAccountingMappingMock,
  updateAccountingMappingMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requireAccountingEnabledMock: vi.fn(),
  requireAccountingReadPermissionMock: vi.fn(),
  requireAccountingWritePermissionMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  getAccountingMappingMock: vi.fn(),
  updateAccountingMappingMock: vi.fn(),
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
  requireAccountingReadPermission: requireAccountingReadPermissionMock,
  requireAccountingWritePermission: requireAccountingWritePermissionMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/services/accounting-connectors-service', () => ({
  getAccountingMapping: getAccountingMappingMock,
  updateAccountingMapping: updateAccountingMappingMock,
}));

import { GET, PUT } from '../../src/app/api/v1/accounting/mapping/route';

const ADMIN_MEMBERSHIP = {
  userId: 'user-admin-1',
  communityId: 42,
  role: 'cam' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Community Association Manager',
  communityType: 'condo_718' as const,
};

const GET_RESULT = {
  provider: 'quickbooks' as const,
  mapping: { assessment: 'qbo-1', late_fee: 'qbo-2' },
  discoveredAccounts: [
    { category: 'assessment', externalId: 'qbo-x', name: 'X' },
  ],
};

const PUT_RESULT = {
  provider: 'quickbooks' as const,
  mapping: { assessment: 'qbo-1' },
};

function jsonGet(query: string, headers?: Record<string, string>): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/accounting/mapping${query}`,
    {
      method: 'GET',
      headers: { ...(headers ?? {}) },
    },
  );
}

function jsonPut(body: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/accounting/mapping', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
  });
}

describe('GET /api/v1/accounting/mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requireAccountingEnabledMock.mockReturnValue(undefined);
    requireAccountingReadPermissionMock.mockReturnValue(undefined);
    getAccountingMappingMock.mockResolvedValue(GET_RESULT);
  });

  it('returns the accounting mapping (happy path)', async () => {
    const res = await GET(jsonGet('?communityId=42&provider=quickbooks'));

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: {
        provider: string;
        mapping: Record<string, string>;
        discoveredAccounts: Array<{ category: string; externalId: string; name: string }>;
      };
    };
    expect(json.data.provider).toBe('quickbooks');
    expect(json.data.mapping).toEqual({ assessment: 'qbo-1', late_fee: 'qbo-2' });
    expect(json.data.discoveredAccounts).toEqual([
      { category: 'assessment', externalId: 'qbo-x', name: 'X' },
    ]);

    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(
      expect.any(NextRequest),
      42,
    );
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-admin-1');
    expect(requireAccountingEnabledMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(requireAccountingReadPermissionMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(getAccountingMappingMock).toHaveBeenCalledWith(42, 'quickbooks');
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValue(
      new UnauthorizedError('Authentication required'),
    );

    const res = await GET(jsonGet('?communityId=42&provider=quickbooks'));

    expect(res.status).toBe(401);
    expect(getAccountingMappingMock).not.toHaveBeenCalled();
  });

  it('returns 400 when communityId query is missing', async () => {
    const res = await GET(jsonGet('?provider=quickbooks'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(getAccountingMappingMock).not.toHaveBeenCalled();
  });

  it('returns 400 when provider query is missing', async () => {
    const res = await GET(jsonGet('?communityId=42'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(getAccountingMappingMock).not.toHaveBeenCalled();
  });

  it('returns 400 when provider is not a valid enum value', async () => {
    const res = await GET(jsonGet('?communityId=42&provider=sage'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(getAccountingMappingMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a community member', async () => {
    requireCommunityMembershipMock.mockRejectedValue(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await GET(jsonGet('?communityId=42&provider=quickbooks'));

    expect(res.status).toBe(403);
    expect(requireAccountingEnabledMock).not.toHaveBeenCalled();
    expect(getAccountingMappingMock).not.toHaveBeenCalled();
  });

  it('returns 403 when accounting feature is disabled', async () => {
    requireAccountingEnabledMock.mockImplementation(() => {
      throw new ForbiddenError('Accounting feature not enabled');
    });

    const res = await GET(jsonGet('?communityId=42&provider=quickbooks'));

    expect(res.status).toBe(403);
    expect(requireAccountingReadPermissionMock).not.toHaveBeenCalled();
    expect(getAccountingMappingMock).not.toHaveBeenCalled();
  });
});

describe('PUT /api/v1/accounting/mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requireAccountingEnabledMock.mockReturnValue(undefined);
    requireAccountingWritePermissionMock.mockReturnValue(undefined);
    updateAccountingMappingMock.mockResolvedValue(PUT_RESULT);
  });

  it('updates the accounting mapping (happy path)', async () => {
    const res = await PUT(
      jsonPut(
        {
          communityId: 42,
          provider: 'quickbooks',
          mapping: { assessment: 'qbo-1' },
        },
        { 'x-request-id': 'req-abc' },
      ),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { provider: string; mapping: Record<string, string> };
    };
    expect(json).toEqual({
      data: { provider: 'quickbooks', mapping: { assessment: 'qbo-1' } },
    });

    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(
      expect.any(NextRequest),
      42,
    );
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-admin-1');
    expect(requireAccountingEnabledMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(requireAccountingWritePermissionMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(updateAccountingMappingMock).toHaveBeenCalledWith(
      42,
      'user-admin-1',
      'quickbooks',
      { assessment: 'qbo-1' },
      'req-abc',
    );
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValue(
      new UnauthorizedError('Authentication required'),
    );

    const res = await PUT(
      jsonPut({
        communityId: 42,
        provider: 'quickbooks',
        mapping: { assessment: 'qbo-1' },
      }),
    );

    expect(res.status).toBe(401);
    expect(updateAccountingMappingMock).not.toHaveBeenCalled();
  });

  it('returns 400 when body is missing communityId', async () => {
    const res = await PUT(
      jsonPut({ provider: 'quickbooks', mapping: { assessment: 'qbo-1' } }),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(updateAccountingMappingMock).not.toHaveBeenCalled();
  });

  it('returns 400 when body is missing provider', async () => {
    const res = await PUT(
      jsonPut({ communityId: 42, mapping: { assessment: 'qbo-1' } }),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(updateAccountingMappingMock).not.toHaveBeenCalled();
  });

  it('returns 400 when body is missing mapping', async () => {
    const res = await PUT(
      jsonPut({ communityId: 42, provider: 'quickbooks' }),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(updateAccountingMappingMock).not.toHaveBeenCalled();
  });

  it('returns 403 during demo-grace (before membership/permission run)', async () => {
    assertNotDemoGraceMock.mockRejectedValue(
      new ForbiddenError('Demo grace period active'),
    );

    const res = await PUT(
      jsonPut({
        communityId: 42,
        provider: 'quickbooks',
        mapping: { assessment: 'qbo-1' },
      }),
    );

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(requireAccountingEnabledMock).not.toHaveBeenCalled();
    expect(updateAccountingMappingMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a community member', async () => {
    requireCommunityMembershipMock.mockRejectedValue(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await PUT(
      jsonPut({
        communityId: 42,
        provider: 'quickbooks',
        mapping: { assessment: 'qbo-1' },
      }),
    );

    expect(res.status).toBe(403);
    expect(requireAccountingEnabledMock).not.toHaveBeenCalled();
    expect(updateAccountingMappingMock).not.toHaveBeenCalled();
  });

  it('returns 403 when accounting-write permission is denied', async () => {
    requireAccountingWritePermissionMock.mockImplementation(() => {
      throw new ForbiddenError('Missing accounting:write permission');
    });

    const res = await PUT(
      jsonPut({
        communityId: 42,
        provider: 'quickbooks',
        mapping: { assessment: 'qbo-1' },
      }),
    );

    expect(res.status).toBe(403);
    expect(updateAccountingMappingMock).not.toHaveBeenCalled();
  });

  it('forwards a null x-request-id when the header is absent', async () => {
    const res = await PUT(
      jsonPut({
        communityId: 42,
        provider: 'quickbooks',
        mapping: { assessment: 'qbo-1' },
      }),
    );

    expect(res.status).toBe(200);
    const call = updateAccountingMappingMock.mock.calls[0];
    expect(call[4]).toBeNull();
  });
});
