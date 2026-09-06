/**
 * Route unit tests — `PATCH /api/v1/faqs/reorder`.
 *
 * Added alongside Plan A1 drain #73. Covers the full auth chain
 * (auth → resolve community → demo-grace → membership → admin gate),
 * body validation, the inline duplicate-id business validation, the
 * `reorderFaqs` missing-id callback, the audit log payload, and the
 * canonical `{ data: { ids } }` wire envelope.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  assertNotDemoGraceMock,
  reorderFaqsMock,
  logAuditEventMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  reorderFaqsMock: vi.fn(),
  logAuditEventMock: vi.fn(),
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
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/services/faq-service', () => ({
  reorderFaqs: reorderFaqsMock,
}));

vi.mock('@propertypro/db', () => ({
  logAuditEvent: logAuditEventMock,
}));

import { PATCH } from '../../src/app/api/v1/faqs/reorder/route';

const ADMIN_MEMBERSHIP = {
  userId: 'user-1',
  communityId: 42,
  role: 'board_president' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board President',
  communityType: 'condo_718' as const,
};

const NON_ADMIN_MEMBERSHIP = {
  ...ADMIN_MEMBERSHIP,
  role: 'owner' as const,
  isAdmin: false,
  isUnitOwner: true,
  displayTitle: 'Owner',
};

interface IdsJson {
  data: { ids: number[] };
}

function jsonPatch(payload: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/faqs/reorder', {
    method: 'PATCH',
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
  });
}

describe('PATCH /api/v1/faqs/reorder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    resolveEffectiveCommunityIdMock.mockImplementation(
      (_req: unknown, communityId: number) => communityId,
    );
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    reorderFaqsMock.mockResolvedValue(undefined);
    logAuditEventMock.mockResolvedValue(undefined);
  });

  it('reorders the supplied ids, logs an audit event, and returns { data: { ids } }', async () => {
    const res = await PATCH(jsonPatch({ communityId: 42, ids: [1, 2, 3] }));

    expect(res.status).toBe(200);
    const json = (await res.json()) as IdsJson;
    expect(json).toEqual({ data: { ids: [1, 2, 3] } });

    expect(requireAuthenticatedUserIdMock).toHaveBeenCalledTimes(1);
    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(expect.anything(), 42);
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-1');

    // reorderFaqs called with (communityId, ids, onMissing callback)
    expect(reorderFaqsMock).toHaveBeenCalledTimes(1);
    const [calledCommunityId, calledIds, calledOnMissing] = reorderFaqsMock.mock.calls[0]!;
    expect(calledCommunityId).toBe(42);
    expect(calledIds).toEqual([1, 2, 3]);
    expect(typeof calledOnMissing).toBe('function');

    // Audit log fires AFTER reorderFaqs resolves, with the correct payload
    expect(logAuditEventMock).toHaveBeenCalledWith({
      userId: 'user-1',
      action: 'faq.reordered',
      resourceType: 'faq',
      resourceId: 'bulk',
      communityId: 42,
      newValues: { ids: [1, 2, 3] },
    });
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await PATCH(jsonPatch({ communityId: 42, ids: [1, 2, 3] }));

    expect(res.status).toBe(401);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(reorderFaqsMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('returns 400 when communityId is missing from the body', async () => {
    const res = await PATCH(jsonPatch({ ids: [1, 2] }));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: { code?: string } };
    expect(json).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      }),
    );
    expect(reorderFaqsMock).not.toHaveBeenCalled();
  });

  it('returns 400 when ids is missing from the body', async () => {
    const res = await PATCH(jsonPatch({ communityId: 42 }));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: { code?: string } };
    expect(json).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      }),
    );
    expect(reorderFaqsMock).not.toHaveBeenCalled();
  });

  it('returns 400 when ids contains zero (positive constraint)', async () => {
    const res = await PATCH(jsonPatch({ communityId: 42, ids: [1, 0, 3] }));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: { code?: string } };
    expect(json).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      }),
    );
    expect(reorderFaqsMock).not.toHaveBeenCalled();
  });

  it('returns 400 with the duplicate-id message when ids contains duplicates', async () => {
    const res = await PATCH(jsonPatch({ communityId: 42, ids: [1, 2, 2] }));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: { code?: string; message?: string } };
    expect(json.error?.message).toBe('Duplicate FAQ IDs in reorder list');
    expect(reorderFaqsMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the community is in demo-grace', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo grace period expired'));

    const res = await PATCH(jsonPatch({ communityId: 42, ids: [1, 2, 3] }));

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(reorderFaqsMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the user is not a member of the target community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await PATCH(jsonPatch({ communityId: 42, ids: [1, 2, 3] }));

    expect(res.status).toBe(403);
    expect(reorderFaqsMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('returns 403 with the admin-only message when the caller is not an admin', async () => {
    requireCommunityMembershipMock.mockResolvedValueOnce(NON_ADMIN_MEMBERSHIP);

    const res = await PATCH(jsonPatch({ communityId: 42, ids: [1, 2, 3] }));

    expect(res.status).toBe(403);
    const json = (await res.json()) as { error?: { message?: string } };
    expect(json.error?.message).toBe('Only admins can reorder FAQs');
    expect(reorderFaqsMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('returns 400 with the templated missing-id message when reorderFaqs reports a missing id', async () => {
    reorderFaqsMock.mockImplementationOnce(
      async (_communityId: number, _ids: number[], onMissing: (id: number) => never) => {
        onMissing(7);
      },
    );

    const res = await PATCH(jsonPatch({ communityId: 42, ids: [1, 7, 3] }));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: { message?: string } };
    expect(json.error?.message).toBe('FAQ with id 7 not found or not active in this community');
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });
});
