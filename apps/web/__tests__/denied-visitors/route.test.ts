/**
 * Unit tests for `/api/v1/visitors/denied` GET — paginate() integration via
 * the package-visitor-service wrapper (Plan B3 + A3 Phase 2 service drain).
 *
 * Covers:
 * - paginateDeniedVisitors called with the correct community + opts
 * - `active=true` / `active=false` / unknown / absent pushes the right
 *   `onlyActive` value into the service call
 * - cursor + pageSize forwarded
 * - Empty-string `?cursor=` / `?pageSize=` treated as missing (B3 lesson #5)
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  paginateDeniedVisitorsMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requireVisitorLoggingEnabledMock,
  requireVisitorsReadPermissionMock,
  requireStaffOperatorMock,
  parseCommunityIdFromQueryMock,
} = vi.hoisted(() => ({
  paginateDeniedVisitorsMock: vi.fn(),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requireVisitorLoggingEnabledMock: vi.fn(),
  requireVisitorsReadPermissionMock: vi.fn(),
  requireStaffOperatorMock: vi.fn(),
  parseCommunityIdFromQueryMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/finance/request', () => ({
  parseCommunityIdFromQuery: parseCommunityIdFromQueryMock,
  parseCommunityIdFromBody: vi.fn(),
}));

vi.mock('@/lib/logistics/common', () => ({
  requireVisitorLoggingEnabled: requireVisitorLoggingEnabledMock,
  requireVisitorsReadPermission: requireVisitorsReadPermissionMock,
  requireVisitorsWritePermission: vi.fn(),
  requireStaffOperator: requireStaffOperatorMock,
}));

vi.mock('@/lib/services/package-visitor-service', () => ({
  createDeniedVisitor: vi.fn(),
  paginateDeniedVisitors: paginateDeniedVisitorsMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/api/error-handler', () => ({
  withErrorHandler: (handler: unknown) => handler,
}));

vi.mock('@/lib/api/errors', () => ({
  ValidationError: class ValidationError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'ValidationError';
    }
  },
}));

vi.mock('@/lib/api/zod/error-formatter', () => ({
  formatZodErrors: vi.fn(() => []),
}));

import { GET } from '../../src/app/api/v1/visitors/denied/route';

function makeRequest(url: string) {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

const COMMUNITY_ID = 99;

const staffMembership = {
  userId: 'user-staff',
  communityId: COMMUNITY_ID,
  role: 'cam',
  isAdmin: true,
  isUnitOwner: false,
  communityType: 'condo_718',
};

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthenticatedUserIdMock.mockResolvedValue('user-staff');
  parseCommunityIdFromQueryMock.mockReturnValue(COMMUNITY_ID);
  requireCommunityMembershipMock.mockResolvedValue(staffMembership);
  requireVisitorLoggingEnabledMock.mockResolvedValue(undefined);
  requireVisitorsReadPermissionMock.mockReturnValue(undefined);
  requireStaffOperatorMock.mockReturnValue(undefined);
});

describe('GET /api/v1/visitors/denied — paginateDeniedVisitors integration', () => {
  it('calls the service with no `onlyActive` when no `active` param is passed', async () => {
    paginateDeniedVisitorsMock.mockResolvedValueOnce({
      data: [{ id: 1, fullName: 'A', isActive: true }],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    const response = await GET(
      makeRequest(`/api/v1/visitors/denied?communityId=${COMMUNITY_ID}`),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.data).toHaveLength(1);
    expect(json.data.pagination).toEqual({ nextCursor: null, hasMore: false, pageSize: 50 });

    expect(paginateDeniedVisitorsMock).toHaveBeenCalledWith({
      communityId: COMMUNITY_ID,
      cursor: undefined,
      pageSize: undefined,
      onlyActive: undefined,
    });
  });

  it('passes `onlyActive: true` when ?active=true', async () => {
    paginateDeniedVisitorsMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    await GET(
      makeRequest(`/api/v1/visitors/denied?communityId=${COMMUNITY_ID}&active=true`),
    );

    expect(paginateDeniedVisitorsMock).toHaveBeenCalledWith(
      expect.objectContaining({ onlyActive: true }),
    );
  });

  it('passes `onlyActive: false` when ?active=false', async () => {
    paginateDeniedVisitorsMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    await GET(
      makeRequest(`/api/v1/visitors/denied?communityId=${COMMUNITY_ID}&active=false`),
    );

    expect(paginateDeniedVisitorsMock).toHaveBeenCalledWith(
      expect.objectContaining({ onlyActive: false }),
    );
  });

  it('treats unknown `active` values as absent (no `onlyActive` filter)', async () => {
    paginateDeniedVisitorsMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    await GET(
      makeRequest(`/api/v1/visitors/denied?communityId=${COMMUNITY_ID}&active=garbage`),
    );

    // `active` only accepts the literal strings 'true' / 'false'. Anything
    // else (including 'garbage') falls back to undefined.
    expect(paginateDeniedVisitorsMock).toHaveBeenCalledWith(
      expect.objectContaining({ onlyActive: undefined }),
    );
  });

  it('forwards cursor and pageSize to the service', async () => {
    paginateDeniedVisitorsMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: 'next-opaque', hasMore: true, pageSize: 25 },
    });

    const response = await GET(
      makeRequest(
        `/api/v1/visitors/denied?communityId=${COMMUNITY_ID}&cursor=abc&pageSize=25`,
      ),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.pagination).toEqual({
      nextCursor: 'next-opaque',
      hasMore: true,
      pageSize: 25,
    });
    expect(paginateDeniedVisitorsMock).toHaveBeenCalledWith({
      communityId: COMMUNITY_ID,
      cursor: 'abc',
      pageSize: 25,
      onlyActive: undefined,
    });
  });

  it('treats empty-string ?cursor= and ?pageSize= as missing (B3 lesson #5)', async () => {
    paginateDeniedVisitorsMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    const response = await GET(
      makeRequest(`/api/v1/visitors/denied?communityId=${COMMUNITY_ID}&cursor=&pageSize=`),
    );
    expect(response.status).toBe(200);

    expect(paginateDeniedVisitorsMock).toHaveBeenCalledWith({
      communityId: COMMUNITY_ID,
      cursor: undefined,
      pageSize: undefined,
      onlyActive: undefined,
    });
  });
});
