/**
 * Route unit tests — POST /api/v1/admin/join-requests/[id]/approve.
 *
 * Added alongside Plan A1 drain #81. Covers the contracted `runRoute`
 * envelope with **header-only communityId** resolution and **empty-body
 * tolerance** (mirrors drain #72 esign/cancel). Audit log preserved
 * post-service-call (drain #73 precedent).
 *
 * Test cases:
 *   - happy path with notes
 *   - happy path with no body (empty-body tolerance)
 *   - 401 unauthenticated
 *   - 400 VALIDATION_ERROR — params.id non-numeric
 *   - 400 VALIDATION_ERROR — params.id zero
 *   - 400 VALIDATION_ERROR — notes > 500 chars
 *   - 403 non-member
 *   - 403 permission denied
 *   - 404 NotFoundError when getJoinRequestCommunityId returns null
 *   - 403 ForbiddenError when community mismatches (cross-community)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requirePermissionMock,
  approveJoinRequestMock,
  getJoinRequestCommunityIdMock,
  logAuditEventMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  approveJoinRequestMock: vi.fn(),
  getJoinRequestCommunityIdMock: vi.fn(),
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

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock('@/lib/join-requests/approve-request', () => ({
  approveJoinRequest: approveJoinRequestMock,
  getJoinRequestCommunityId: getJoinRequestCommunityIdMock,
}));

vi.mock('@propertypro/db', () => ({
  logAuditEvent: logAuditEventMock,
}));

import { POST } from '../../src/app/api/v1/admin/join-requests/[id]/approve/route';

const ADMIN_MEMBERSHIP = {
  userId: 'user-admin-1',
  communityId: 42,
  role: 'board_president' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board President',
  communityType: 'condo_718' as const,
};

const SERVICE_RESULT = {
  requestId: 7,
  userId: 'new-user-uuid',
  approvedAt: new Date('2026-05-27T00:00:00.000Z'),
};

function postReq(
  id: string | number,
  opts: { body?: unknown; omitBody?: boolean; headers?: Record<string, string> } = {},
): NextRequest {
  const url = `http://localhost:3000/api/v1/admin/join-requests/${id}/approve`;
  const init: NonNullable<ConstructorParameters<typeof NextRequest>[1]> = {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(opts.headers ?? {}) },
  };
  if (!opts.omitBody) {
    init.body = JSON.stringify(opts.body ?? {});
  }
  return new NextRequest(url, init);
}

function routeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/v1/admin/join-requests/[id]/approve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requirePermissionMock.mockReturnValue(undefined);
    getJoinRequestCommunityIdMock.mockResolvedValue(42);
    approveJoinRequestMock.mockResolvedValue(SERVICE_RESULT);
    logAuditEventMock.mockResolvedValue(undefined);
  });

  it('approves with notes; service + audit called with notes (happy path)', async () => {
    const res = await POST(
      postReq(7, { body: { notes: 'Looks good' } }),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(expect.anything(), null);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-admin-1');
    expect(requirePermissionMock).toHaveBeenCalledWith(
      ADMIN_MEMBERSHIP,
      'residents',
      'write',
    );
    expect(getJoinRequestCommunityIdMock).toHaveBeenCalledWith(7);
    expect(approveJoinRequestMock).toHaveBeenCalledWith({
      requestId: 7,
      reviewerUserId: 'user-admin-1',
      notes: 'Looks good',
    });
    expect(logAuditEventMock).toHaveBeenCalledWith({
      userId: 'user-admin-1',
      communityId: 42,
      action: 'join_request.approved',
      resourceType: 'community_join_request',
      resourceId: '7',
      metadata: { notes: 'Looks good' },
    });
  });

  it('approves with no body (empty-body tolerance); audit metadata.notes = null', async () => {
    const res = await POST(postReq(7, { omitBody: true }), routeCtx('7'));

    expect(res.status).toBe(200);
    expect(approveJoinRequestMock).toHaveBeenCalledWith({
      requestId: 7,
      reviewerUserId: 'user-admin-1',
      notes: undefined,
    });
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { notes: null },
      }),
    );
  });

  it('returns 401 when unauthenticated; downstream gates not called', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await POST(postReq(7, { body: {} }), routeCtx('7'));

    expect(res.status).toBe(401);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(getJoinRequestCommunityIdMock).not.toHaveBeenCalled();
    expect(approveJoinRequestMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is non-numeric', async () => {
    const res = await POST(postReq('abc', { body: {} }), routeCtx('abc'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(approveJoinRequestMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is zero', async () => {
    const res = await POST(postReq('0', { body: {} }), routeCtx('0'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(approveJoinRequestMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when notes exceeds 500 chars', async () => {
    const tooLong = 'x'.repeat(501);
    const res = await POST(postReq(7, { body: { notes: tooLong } }), routeCtx('7'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(approveJoinRequestMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a member of the resolved community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await POST(postReq(7, { body: {} }), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(getJoinRequestCommunityIdMock).not.toHaveBeenCalled();
    expect(approveJoinRequestMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller lacks residents.write permission', async () => {
    requirePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const res = await POST(postReq(7, { body: {} }), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(getJoinRequestCommunityIdMock).not.toHaveBeenCalled();
    expect(approveJoinRequestMock).not.toHaveBeenCalled();
  });

  it('returns 404 when getJoinRequestCommunityId returns null', async () => {
    getJoinRequestCommunityIdMock.mockResolvedValueOnce(null);

    const res = await POST(postReq(7, { body: {} }), routeCtx('7'));

    expect(res.status).toBe(404);
    expect(approveJoinRequestMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it("returns 403 with message 'Request belongs to a different community' when communities mismatch", async () => {
    getJoinRequestCommunityIdMock.mockResolvedValueOnce(99);

    const res = await POST(postReq(7, { body: {} }), routeCtx('7'));

    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error.message).toBe('Request belongs to a different community');
    expect(approveJoinRequestMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });
});
