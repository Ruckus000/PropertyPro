/**
 * Unit tests for `/api/v1/assessments` GET — paginated list envelope.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  paginateAssessmentsForCommunityMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  parseCommunityIdFromQueryMock,
  requireFinanceEnabledMock,
  requireFinanceReadPermissionMock,
} = vi.hoisted(() => ({
  paginateAssessmentsForCommunityMock: vi.fn(),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  parseCommunityIdFromQueryMock: vi.fn(),
  requireFinanceEnabledMock: vi.fn(),
  requireFinanceReadPermissionMock: vi.fn(),
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

vi.mock('@/lib/finance/common', () => ({
  requireFinanceEnabled: requireFinanceEnabledMock,
  requireFinanceReadPermission: requireFinanceReadPermissionMock,
  requireFinanceWritePermission: vi.fn(),
  requireFinanceAdminWrite: vi.fn(),
}));

vi.mock('@/lib/services/finance-service', () => ({
  paginateAssessmentsForCommunity: paginateAssessmentsForCommunityMock,
  createAssessmentForCommunity: vi.fn(),
}));

vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: vi.fn(),
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: vi.fn(),
}));

vi.mock('@/lib/api/error-handler', () => ({
  withErrorHandler: (handler: unknown) => handler,
}));

vi.mock('@/lib/api/errors', () => ({
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

import { GET } from '../../src/app/api/v1/assessments/route';

const COMMUNITY_ID = 99;

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthenticatedUserIdMock.mockResolvedValue('user-finance');
  parseCommunityIdFromQueryMock.mockReturnValue(COMMUNITY_ID);
  requireCommunityMembershipMock.mockResolvedValue({ role: 'cam', isAdmin: true });
  requireFinanceEnabledMock.mockResolvedValue(undefined);
  requireFinanceReadPermissionMock.mockReturnValue(undefined);
});

describe('GET /api/v1/assessments', () => {
  it('returns paginated envelope', async () => {
    paginateAssessmentsForCommunityMock.mockResolvedValue({
      data: [{ id: 1, title: 'HOA Dues' }],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    const res = await GET(
      new NextRequest(`http://localhost/api/v1/assessments?communityId=${COMMUNITY_ID}`),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.data).toHaveLength(1);
    expect(json.data.pagination.hasMore).toBe(false);
  });
});
