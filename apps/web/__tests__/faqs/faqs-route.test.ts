/**
 * Route unit tests — `GET` and `POST /api/v1/faqs`.
 *
 * Plan A1 drain #104. Covers paginated GET, admin POST, audit log, and auth.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  ensureFaqsExistMock,
  listVisibleFaqsPageMock,
  createFaqMock,
  logAuditEventMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
} = vi.hoisted(() => ({
  ensureFaqsExistMock: vi.fn(),
  listVisibleFaqsPageMock: vi.fn(),
  createFaqMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  logAuditEvent: logAuditEventMock,
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

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: vi.fn().mockResolvedValue(undefined),
}));

import { GET, POST } from '../../src/app/api/v1/faqs/route';

const COMMUNITY_ID = 42;
const USER_ID = 'user-admin';

const VISIBLE_FAQ = {
  id: 1,
  question: 'Question',
  answer: 'Answer',
  sortOrder: 0,
  category: null,
  roleVisibility: null,
};

const ADMIN_MEMBERSHIP = {
  userId: USER_ID,
  communityId: COMMUNITY_ID,
  role: 'board_president',
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board President',
  communityType: 'condo_718',
};

const TENANT_MEMBERSHIP = {
  ...ADMIN_MEMBERSHIP,
  role: 'tenant',
  isAdmin: false,
};

function getReq(path: string): NextRequest {
  return new NextRequest(new URL(path, 'http://localhost:3000'));
}

function jsonPost(payload: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/faqs', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json' },
  });
}

describe('GET /api/v1/faqs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue(USER_ID);
    requireCommunityMembershipMock.mockResolvedValue(TENANT_MEMBERSHIP);
    ensureFaqsExistMock.mockResolvedValue(undefined);
    listVisibleFaqsPageMock.mockResolvedValue({
      data: [VISIBLE_FAQ],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });
  });

  it('returns paginated FAQs and calls ensureFaqsExist', async () => {
    const res = await GET(getReq(`/api/v1/faqs?communityId=${COMMUNITY_ID}`));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      data: {
        data: [VISIBLE_FAQ],
        pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
      },
    });
    expect(ensureFaqsExistMock).toHaveBeenCalledWith(COMMUNITY_ID);
    expect(listVisibleFaqsPageMock).toHaveBeenCalledWith(COMMUNITY_ID, 'tenant', {
      cursor: undefined,
      pageSize: undefined,
    });
  });

  it('returns 400 when communityId is invalid', async () => {
    const res = await GET(getReq('/api/v1/faqs?communityId=abc'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(ensureFaqsExistMock).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(getReq(`/api/v1/faqs?communityId=${COMMUNITY_ID}`));
    expect(res.status).toBe(401);
    expect(listVisibleFaqsPageMock).not.toHaveBeenCalled();
  });

  it('returns 404 when x-community-id header disagrees with query', async () => {
    const res = await GET(
      new NextRequest(`http://localhost:3000/api/v1/faqs?communityId=${COMMUNITY_ID}`, {
        headers: { 'x-community-id': '99' },
      }),
    );

    expect(res.status).toBe(404);
    expect(ensureFaqsExistMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/faqs', () => {
  const FAQ_ROW = {
    id: 2,
    question: 'New Q',
    answer: 'New A',
    sortOrder: 1,
    category: null,
    roleVisibility: null,
    createdAt: new Date('2026-05-01T00:00:00Z'),
    updatedAt: new Date('2026-05-01T00:00:00Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue(USER_ID);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    createFaqMock.mockResolvedValue({ row: FAQ_ROW, sortOrder: 1 });
    logAuditEventMock.mockResolvedValue(undefined);
  });

  it('creates an FAQ and logs audit event for admin', async () => {
    const res = await POST(
      jsonPost({
        communityId: COMMUNITY_ID,
        question: 'New Q',
        answer: 'New A',
      }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual({
      ...FAQ_ROW,
      createdAt: FAQ_ROW.createdAt.toISOString(),
      updatedAt: FAQ_ROW.updatedAt.toISOString(),
    });
    expect(createFaqMock).toHaveBeenCalledWith(COMMUNITY_ID, {
      question: 'New Q',
      answer: 'New A',
    });
    expect(logAuditEventMock).toHaveBeenCalledWith({
      userId: USER_ID,
      action: 'faq.created',
      resourceType: 'faq',
      resourceId: '2',
      communityId: COMMUNITY_ID,
      newValues: { question: 'New Q', answer: 'New A', sortOrder: 1 },
    });
  });

  it('returns 403 for non-admin without calling createFaq', async () => {
    requireCommunityMembershipMock.mockResolvedValueOnce(TENANT_MEMBERSHIP);

    const res = await POST(
      jsonPost({
        communityId: COMMUNITY_ID,
        question: 'New Q',
        answer: 'New A',
      }),
    );

    expect(res.status).toBe(403);
    expect(createFaqMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('returns 400 when question is empty', async () => {
    const res = await POST(
      jsonPost({
        communityId: COMMUNITY_ID,
        question: '',
        answer: 'New A',
      }),
    );

    expect(res.status).toBe(400);
    expect(createFaqMock).not.toHaveBeenCalled();
  });

  it('returns 400 when answer is empty', async () => {
    const res = await POST(
      jsonPost({
        communityId: COMMUNITY_ID,
        question: 'New Q',
        answer: '',
      }),
    );

    expect(res.status).toBe(400);
    expect(createFaqMock).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await POST(
      jsonPost({
        communityId: COMMUNITY_ID,
        question: 'New Q',
        answer: 'New A',
      }),
    );

    expect(res.status).toBe(401);
    expect(createFaqMock).not.toHaveBeenCalled();
  });

  it('returns 404 when x-community-id header disagrees with body communityId', async () => {
    const res = await POST(
      new NextRequest('http://localhost:3000/api/v1/faqs', {
        method: 'POST',
        body: JSON.stringify({
          communityId: COMMUNITY_ID,
          question: 'New Q',
          answer: 'New A',
        }),
        headers: {
          'content-type': 'application/json',
          'x-community-id': '99',
        },
      }),
    );

    expect(res.status).toBe(404);
    expect(createFaqMock).not.toHaveBeenCalled();
  });
});
