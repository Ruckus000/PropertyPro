/**
 * Unit tests for `/api/v1/faqs` GET — ordered-keyset pagination (Plan B3).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  ensureFaqsExistMock,
  listVisibleFaqsPageMock,
  createFaqMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
} = vi.hoisted(() => ({
  ensureFaqsExistMock: vi.fn(),
  listVisibleFaqsPageMock: vi.fn(),
  createFaqMock: vi.fn(),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  logAuditEvent: vi.fn(),
}));

vi.mock('@/lib/services/faq-service', () => ({
  ensureFaqsExist: ensureFaqsExistMock,
  listVisibleFaqsPage: listVisibleFaqsPageMock,
  createFaq: createFaqMock,
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

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/api/error-handler', () => ({
  withErrorHandler: (handler: unknown) => handler,
}));

vi.mock('@/lib/api/errors/ValidationError', () => ({
  ValidationError: class ValidationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ValidationError';
    }
  },
}));

vi.mock('@/lib/api/errors/ForbiddenError', () => ({
  ForbiddenError: class ForbiddenError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ForbiddenError';
    }
  },
}));

import { GET } from '../../src/app/api/v1/faqs/route';

const COMMUNITY_ID = 42;
const membership = {
  userId: 'user-1',
  communityId: COMMUNITY_ID,
  role: 'tenant',
  isAdmin: false,
};

function makeRequest(path: string) {
  return new NextRequest(new URL(path, 'http://localhost:3000'));
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
  requireCommunityMembershipMock.mockResolvedValue(membership);
  resolveEffectiveCommunityIdMock.mockReturnValue(COMMUNITY_ID);
  ensureFaqsExistMock.mockResolvedValue(undefined);
  listVisibleFaqsPageMock.mockResolvedValue({
    data: [
      {
        id: 1,
        question: 'Question',
        answer: 'Answer',
        sortOrder: 0,
        category: null,
        roleVisibility: null,
      },
    ],
    pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
  });
});

describe('GET /api/v1/faqs — ordered-keyset pagination', () => {
  it('returns the canonical double-wrapped paginated envelope', async () => {
    const response = await GET(makeRequest(`/api/v1/faqs?communityId=${COMMUNITY_ID}`));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      data: {
        data: [
          {
            id: 1,
            question: 'Question',
            answer: 'Answer',
            sortOrder: 0,
            category: null,
            roleVisibility: null,
          },
        ],
        pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
      },
    });
    expect(ensureFaqsExistMock).toHaveBeenCalledWith(COMMUNITY_ID);
    expect(listVisibleFaqsPageMock).toHaveBeenCalledWith(COMMUNITY_ID, 'tenant', {
      cursor: undefined,
      pageSize: undefined,
    });
  });

  it('passes cursor and pageSize into the FAQ ordered-keyset helper', async () => {
    await GET(
      makeRequest(`/api/v1/faqs?communityId=${COMMUNITY_ID}&cursor=abc123&pageSize=2`),
    );

    expect(listVisibleFaqsPageMock).toHaveBeenCalledWith(COMMUNITY_ID, 'tenant', {
      cursor: 'abc123',
      pageSize: 2,
    });
  });

  it('treats empty cursor and pageSize query params as missing', async () => {
    await GET(makeRequest(`/api/v1/faqs?communityId=${COMMUNITY_ID}&cursor=&pageSize=`));

    expect(listVisibleFaqsPageMock).toHaveBeenCalledWith(COMMUNITY_ID, 'tenant', {
      cursor: undefined,
      pageSize: undefined,
    });
  });

  it('passes the membership role so visibility is applied before pagination', async () => {
    requireCommunityMembershipMock.mockResolvedValueOnce({
      ...membership,
      role: 'board_member',
    });

    await GET(makeRequest(`/api/v1/faqs?communityId=${COMMUNITY_ID}`));

    expect(listVisibleFaqsPageMock).toHaveBeenCalledWith(COMMUNITY_ID, 'board_member', {
      cursor: undefined,
      pageSize: undefined,
    });
  });
});
