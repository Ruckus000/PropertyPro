/**
 * Route unit tests — `GET /api/v1/accounting/callback`.
 *
 * Added alongside Plan A1 drain #91. Covers the contracted runRoute
 * envelope for the OAuth callback completion endpoint (QuickBooks/Xero).
 *
 * Cases: happy path, 401 unauth, 400 missing/invalid query fields
 * (communityId, provider, state, code), 403 non-member,
 * 403 accounting-disabled, 403 accounting-write permission denied,
 * 400 BadRequestError from validateAccountingOAuthState (malformed state),
 * 403 ForbiddenError from validateAccountingOAuthState (signature/id
 * mismatch), and null x-request-id forwarding at the 5th arg position.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { BadRequestError } from '../../src/lib/api/errors/BadRequestError';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requireAccountingEnabledMock,
  requireAccountingWritePermissionMock,
  completeAccountingConnectMock,
  validateAccountingOAuthStateMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requireAccountingEnabledMock: vi.fn(),
  requireAccountingWritePermissionMock: vi.fn(),
  completeAccountingConnectMock: vi.fn(),
  validateAccountingOAuthStateMock: vi.fn(),
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

vi.mock('@/lib/services/accounting-connectors-service', () => ({
  completeAccountingConnect: completeAccountingConnectMock,
  validateAccountingOAuthState: validateAccountingOAuthStateMock,
}));

import { GET } from '../../src/app/api/v1/accounting/callback/route';

const ADMIN_MEMBERSHIP = {
  userId: 'user-pm-1',
  communityId: 42,
  role: 'cam' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Community Association Manager',
  communityType: 'condo_718' as const,
};

const COMPLETE_RESULT = {
  provider: 'quickbooks' as const,
  tenantId: 'qbo-tenant',
  connectedAt: new Date('2026-01-01T00:00:00Z'),
};

const HAPPY_QUERY =
  '?communityId=42&provider=quickbooks&state=opaque-state-blob&code=qbo-code-456';

function jsonGet(query: string, headers?: Record<string, string>): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/accounting/callback${query}`,
    {
      method: 'GET',
      headers: { ...(headers ?? {}) },
    },
  );
}

describe('GET /api/v1/accounting/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-pm-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requireAccountingEnabledMock.mockReturnValue(undefined);
    requireAccountingWritePermissionMock.mockReturnValue(undefined);
    validateAccountingOAuthStateMock.mockReturnValue(undefined);
    completeAccountingConnectMock.mockResolvedValue(COMPLETE_RESULT);
  });

  it('completes the OAuth callback (happy path)', async () => {
    const res = await GET(jsonGet(HAPPY_QUERY, { 'x-request-id': 'req-abc' }));

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: unknown };
    expect(json).toEqual({
      data: {
        provider: 'quickbooks',
        tenantId: 'qbo-tenant',
        connectedAt: '2026-01-01T00:00:00.000Z',
      },
    });

    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(
      expect.any(NextRequest),
      42,
    );
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-pm-1');
    expect(requireAccountingEnabledMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(requireAccountingWritePermissionMock).toHaveBeenCalledWith(
      ADMIN_MEMBERSHIP,
    );
    expect(validateAccountingOAuthStateMock).toHaveBeenCalledWith(
      'opaque-state-blob',
      42,
      'user-pm-1',
      'quickbooks',
    );
    expect(completeAccountingConnectMock).toHaveBeenCalledWith(
      42,
      'user-pm-1',
      'quickbooks',
      'qbo-code-456',
      'req-abc',
    );
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValue(
      new UnauthorizedError('Authentication required'),
    );

    const res = await GET(jsonGet(HAPPY_QUERY));

    expect(res.status).toBe(401);
    expect(completeAccountingConnectMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when communityId is missing', async () => {
    const res = await GET(
      jsonGet(
        '?provider=quickbooks&state=opaque-state-blob&code=qbo-code-456',
      ),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(completeAccountingConnectMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when provider is missing', async () => {
    const res = await GET(
      jsonGet('?communityId=42&state=opaque-state-blob&code=qbo-code-456'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(completeAccountingConnectMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when provider is not a valid enum value', async () => {
    const res = await GET(
      jsonGet(
        '?communityId=42&provider=sage&state=opaque-state-blob&code=qbo-code-456',
      ),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(completeAccountingConnectMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when state is missing (and does NOT call validateAccountingOAuthState)', async () => {
    const res = await GET(
      jsonGet('?communityId=42&provider=quickbooks&code=qbo-code-456'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(validateAccountingOAuthStateMock).not.toHaveBeenCalled();
    expect(completeAccountingConnectMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when code is empty (and does NOT call completeAccountingConnect)', async () => {
    const res = await GET(
      jsonGet(
        '?communityId=42&provider=quickbooks&state=opaque-state-blob&code=',
      ),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(completeAccountingConnectMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller is not a community member', async () => {
    requireCommunityMembershipMock.mockRejectedValue(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await GET(jsonGet(HAPPY_QUERY));

    expect(res.status).toBe(403);
    expect(requireAccountingEnabledMock).not.toHaveBeenCalled();
    expect(completeAccountingConnectMock).not.toHaveBeenCalled();
  });

  it('returns 403 when accounting feature is disabled (and does NOT call requireAccountingWritePermission)', async () => {
    requireAccountingEnabledMock.mockImplementation(() => {
      throw new ForbiddenError('Accounting feature not enabled');
    });

    const res = await GET(jsonGet(HAPPY_QUERY));

    expect(res.status).toBe(403);
    expect(requireAccountingWritePermissionMock).not.toHaveBeenCalled();
    expect(validateAccountingOAuthStateMock).not.toHaveBeenCalled();
    expect(completeAccountingConnectMock).not.toHaveBeenCalled();
  });

  it('returns 403 when accounting-write permission is denied (and does NOT call validateAccountingOAuthState)', async () => {
    requireAccountingWritePermissionMock.mockImplementation(() => {
      throw new ForbiddenError('Missing accounting:write permission');
    });

    const res = await GET(jsonGet(HAPPY_QUERY));

    expect(res.status).toBe(403);
    expect(validateAccountingOAuthStateMock).not.toHaveBeenCalled();
    expect(completeAccountingConnectMock).not.toHaveBeenCalled();
  });

  it('returns 400 when validateAccountingOAuthState throws BadRequestError (malformed state)', async () => {
    validateAccountingOAuthStateMock.mockImplementationOnce(() => {
      throw new BadRequestError('Invalid OAuth state parameter');
    });

    const res = await GET(jsonGet(HAPPY_QUERY));

    expect(res.status).toBe(400);
    expect(completeAccountingConnectMock).not.toHaveBeenCalled();
  });

  it('returns 403 when validateAccountingOAuthState throws ForbiddenError (signature/communityId mismatch)', async () => {
    validateAccountingOAuthStateMock.mockImplementationOnce(() => {
      throw new ForbiddenError('OAuth state mismatch');
    });

    const res = await GET(jsonGet(HAPPY_QUERY));

    expect(res.status).toBe(403);
    expect(completeAccountingConnectMock).not.toHaveBeenCalled();
  });

  it('forwards null x-request-id when header absent', async () => {
    const res = await GET(jsonGet(HAPPY_QUERY));

    expect(res.status).toBe(200);
    expect(completeAccountingConnectMock).toHaveBeenCalledWith(
      42,
      'user-pm-1',
      'quickbooks',
      'qbo-code-456',
      null,
    );
    // Assert 5-arg shape (requestId at tail position).
    expect(completeAccountingConnectMock.mock.calls[0]).toHaveLength(5);
  });
});
