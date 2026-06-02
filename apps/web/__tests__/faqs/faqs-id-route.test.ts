/**
 * Route unit tests — `PATCH` and `DELETE /api/v1/faqs/[id]`.
 *
 * Plan A1 drain #112.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { NotFoundError } from '../../src/lib/api/errors/NotFoundError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  updateFaqMock,
  softDeleteFaqMock,
  logAuditEventMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  assertNotDemoGraceMock,
} = vi.hoisted(() => ({
  updateFaqMock: vi.fn(),
  softDeleteFaqMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  logAuditEvent: logAuditEventMock,
}));

vi.mock('@/lib/services/faq-service', () => ({
  updateFaq: updateFaqMock,
  softDeleteFaq: softDeleteFaqMock,
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

import { DELETE, PATCH } from '../../src/app/api/v1/faqs/[id]/route';

const COMMUNITY_ID = 42;
const FAQ_ID = 7;
const USER_ID = 'user-admin';

const ADMIN_MEMBERSHIP = {
  userId: USER_ID,
  communityId: COMMUNITY_ID,
  role: 'board_president',
  isAdmin: true,
  isUnitOwner: false,
};

const TENANT_MEMBERSHIP = {
  ...ADMIN_MEMBERSHIP,
  role: 'tenant',
  isAdmin: false,
};

const FAQ_ROW = {
  id: FAQ_ID,
  question: 'Updated Q',
  answer: 'Updated A',
  sortOrder: 0,
  createdAt: new Date('2026-05-01T00:00:00Z'),
  updatedAt: new Date('2026-05-02T00:00:00Z'),
};

function routeContext() {
  return { params: Promise.resolve({ id: String(FAQ_ID) }) };
}

function patchReq(body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/v1/faqs/${FAQ_ID}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function deleteReq(communityId = COMMUNITY_ID): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/faqs/${FAQ_ID}?communityId=${communityId}`,
    { method: 'DELETE' },
  );
}

describe('PATCH /api/v1/faqs/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireAuthenticatedUserIdMock.mockResolvedValue(USER_ID);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    logAuditEventMock.mockResolvedValue(undefined);
    updateFaqMock.mockResolvedValue({
      row: FAQ_ROW,
      updateData: { question: 'Updated Q', updatedAt: FAQ_ROW.updatedAt },
    });
  });

  it('updates FAQ and logs audit event for admin', async () => {
    const res = await PATCH(
      patchReq({
        communityId: COMMUNITY_ID,
        question: 'Updated Q',
      }),
      routeContext(),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual({
      ...FAQ_ROW,
      createdAt: FAQ_ROW.createdAt.toISOString(),
      updatedAt: FAQ_ROW.updatedAt.toISOString(),
    });
    expect(updateFaqMock).toHaveBeenCalledWith(COMMUNITY_ID, FAQ_ID, {
      question: 'Updated Q',
      answer: undefined,
    });
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'faq.updated',
        resourceId: String(FAQ_ID),
        communityId: COMMUNITY_ID,
      }),
    );
  });

  it('returns 403 for non-admin', async () => {
    requireCommunityMembershipMock.mockResolvedValueOnce(TENANT_MEMBERSHIP);

    const res = await PATCH(
      patchReq({ communityId: COMMUNITY_ID, question: 'X' }),
      routeContext(),
    );

    expect(res.status).toBe(403);
    expect(updateFaqMock).not.toHaveBeenCalled();
  });

  it('returns 404 when FAQ not found', async () => {
    updateFaqMock.mockResolvedValueOnce(null);

    const res = await PATCH(
      patchReq({ communityId: COMMUNITY_ID, question: 'X' }),
      routeContext(),
    );

    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid id param', async () => {
    const res = await PATCH(
      patchReq({ communityId: COMMUNITY_ID, question: 'X' }),
      { params: Promise.resolve({ id: 'abc' }) },
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await PATCH(
      patchReq({ communityId: COMMUNITY_ID, question: 'X' }),
      routeContext(),
    );

    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/v1/faqs/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireAuthenticatedUserIdMock.mockResolvedValue(USER_ID);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    logAuditEventMock.mockResolvedValue(undefined);
    softDeleteFaqMock.mockResolvedValue(true);
  });

  it('soft-deletes FAQ and logs audit event for admin', async () => {
    const res = await DELETE(deleteReq(), routeContext());

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual({ id: FAQ_ID });
    expect(softDeleteFaqMock).toHaveBeenCalledWith(COMMUNITY_ID, FAQ_ID);
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'faq.deleted',
        resourceId: String(FAQ_ID),
      }),
    );
  });

  it('returns 403 for non-admin', async () => {
    requireCommunityMembershipMock.mockResolvedValueOnce(TENANT_MEMBERSHIP);

    const res = await DELETE(deleteReq(), routeContext());
    expect(res.status).toBe(403);
    expect(softDeleteFaqMock).not.toHaveBeenCalled();
  });

  it('returns 404 when FAQ not found', async () => {
    softDeleteFaqMock.mockResolvedValueOnce(false);

    const res = await DELETE(deleteReq(), routeContext());
    expect(res.status).toBe(404);
  });

  it('returns 400 when communityId query is missing', async () => {
    const res = await DELETE(
      new NextRequest(`http://localhost:3000/api/v1/faqs/${FAQ_ID}`, { method: 'DELETE' }),
      routeContext(),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });
});
