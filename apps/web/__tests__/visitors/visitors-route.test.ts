/**
 * Unit tests for `/api/v1/visitors` GET — resident passCode stripping + pagination envelope.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  paginateVisitorsForCommunityMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requireVisitorLoggingEnabledMock,
  requireVisitorsReadPermissionMock,
  createScopedClientMock,
  requireActorUnitIdsMock,
} = vi.hoisted(() => ({
  paginateVisitorsForCommunityMock: vi.fn(),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requireVisitorLoggingEnabledMock: vi.fn(),
  requireVisitorsWritePermissionMock: vi.fn(),
  requireVisitorsReadPermissionMock: vi.fn(),
  createScopedClientMock: vi.fn(() => ({})),
  requireActorUnitIdsMock: vi.fn(),
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

vi.mock('@/lib/finance/request', () => ({
  parseCommunityIdFromBody: vi.fn(),
  parseCommunityIdFromQuery: vi.fn(),
}));

vi.mock('@/lib/logistics/common', () => ({
  isResidentRole: (role: string) => role === 'resident',
  requireActorUnitIds: requireActorUnitIdsMock,
  requireStaffOperator: vi.fn(),
  requireVisitorLoggingEnabled: requireVisitorLoggingEnabledMock,
  requireVisitorsReadPermission: requireVisitorsReadPermissionMock,
  requireVisitorsWritePermission: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: vi.fn(() => ({})),
}));

vi.mock('@/lib/services/package-visitor-service', () => ({
  paginateVisitorsForCommunity: paginateVisitorsForCommunityMock,
  createVisitorForCommunity: vi.fn(),
}));

vi.mock('@/lib/services/units-lookup', () => ({
  resolveUnitIdByLabel: vi.fn(),
}));

vi.mock('@/lib/api/error-handler', () => ({
  withErrorHandler: (handler: unknown) => handler,
}));

vi.mock('@/lib/api/errors', () => ({
  ForbiddenError: class ForbiddenError extends Error {},
  ValidationError: class ValidationError extends Error {
    details?: Record<string, unknown>;
    constructor(msg: string, details?: Record<string, unknown>) {
      super(msg);
      this.details = details;
    }
  },
}));

vi.mock('@/lib/api/zod/error-formatter', () => ({
  formatZodErrors: vi.fn(() => []),
}));

vi.mock('@/lib/finance/common', () => ({
  parsePositiveInt: (raw: string, field: string) => {
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) throw new Error(`Invalid ${field}`);
    return n;
  },
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: vi.fn(),
}));

vi.mock('@/lib/middleware/plan-guard', () => ({
  requirePlanFeature: vi.fn().mockResolvedValue(undefined),
}));

import { GET } from '../../src/app/api/v1/visitors/route';

const COMMUNITY_ID = 42;

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
  resolveEffectiveCommunityIdMock.mockReturnValue(COMMUNITY_ID);
  requireVisitorLoggingEnabledMock.mockResolvedValue(undefined);
  requireVisitorsReadPermissionMock.mockReturnValue(undefined);
});

describe('GET /api/v1/visitors', () => {
  it('strips passCode for residents', async () => {
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'resident',
      communityId: COMMUNITY_ID,
    });
    requireActorUnitIdsMock.mockResolvedValue([1]);
    paginateVisitorsForCommunityMock.mockResolvedValue({
      data: [{ id: 1, passCode: 'secret', visitorName: 'Guest' }],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    const res = await GET(
      new NextRequest(`http://localhost/api/v1/visitors?communityId=${COMMUNITY_ID}`),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.data[0]).not.toHaveProperty('passCode');
    expect(json.data.data[0].visitorName).toBe('Guest');
  });
});
