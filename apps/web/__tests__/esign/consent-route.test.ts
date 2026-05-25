/**
 * Route unit tests — `/api/v1/esign/consent` (GET + DELETE).
 *
 * Added alongside Plan A1 drain #22. The pre-migration route had partial
 * coverage in `esign-route.test.ts` (one happy-path GET + one happy-path
 * DELETE). This dedicated file adds the auth-chain rejection paths, the
 * runner's validation envelope (400), the header/query mismatch (404), and
 * the `x-request-id` header-fallback assertion (drain #13 lesson — both
 * branches of the `?? null` pattern need a test).
 *
 * Mirrors drain #13's two-contracts-per-file test layout. First DELETE
 * handler in the contract corpus — DELETE is invoked the same way as POST
 * in test (NextRequest with `{ method: 'DELETE' }`), and `runRoute` skips
 * body parsing for any contract that doesn't declare a body schema (the
 * DELETE contract here is query-only).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requireEsignReadPermissionMock,
  requireEsignWritePermissionMock,
  getConsentStatusMock,
  revokeConsentMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requireEsignReadPermissionMock: vi.fn(),
  requireEsignWritePermissionMock: vi.fn(),
  getConsentStatusMock: vi.fn(),
  revokeConsentMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/esign/esign-route-helpers', () => ({
  requireEsignReadPermission: requireEsignReadPermissionMock,
  requireEsignWritePermission: requireEsignWritePermissionMock,
}));

vi.mock('@/lib/services/esign-service', () => ({
  getConsentStatus: getConsentStatusMock,
  revokeConsent: revokeConsentMock,
}));

import { GET, DELETE } from '../../src/app/api/v1/esign/consent/route';

const MEMBERSHIP = {
  userId: 'user-1',
  communityId: 42,
  role: 'board_member' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board Member',
  communityType: 'condo_718' as const,
};

const CONSENT_STATUS = {
  hasActiveConsent: true,
  givenAt: new Date('2026-01-15T00:00:00Z'),
};

interface GetConsentJson {
  data: { hasActiveConsent: boolean; givenAt: string | null };
}

interface DeleteConsentJson {
  data: { success: true };
}

function getReq(qs = '?communityId=42', headers?: Record<string, string>): NextRequest {
  return new NextRequest(`http://localhost:3000/api/v1/esign/consent${qs}`, {
    headers: headers ?? {},
  });
}

function deleteReq(
  qs = '?communityId=42',
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest(`http://localhost:3000/api/v1/esign/consent${qs}`, {
    method: 'DELETE',
    headers: headers ?? {},
  });
}

describe('GET /api/v1/esign/consent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    requireEsignReadPermissionMock.mockResolvedValue(undefined);
    getConsentStatusMock.mockResolvedValue(CONSENT_STATUS);
  });

  it('returns wrapped consent status for an authenticated member with read permission', async () => {
    const res = await GET(getReq());

    expect(res.status).toBe(200);
    const json = (await res.json()) as GetConsentJson;
    // Date serializes to ISO string through NextResponse.json
    expect(json.data).toEqual({
      hasActiveConsent: true,
      givenAt: '2026-01-15T00:00:00.000Z',
    });
    expect(requireAuthenticatedUserIdMock).toHaveBeenCalledTimes(1);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-1');
    expect(requireEsignReadPermissionMock).toHaveBeenCalledWith(MEMBERSHIP);
    expect(getConsentStatusMock).toHaveBeenCalledWith(42, 'user-1');
  });

  it('returns 401 when unauthenticated; downstream gates not called', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(getReq());

    expect(res.status).toBe(401);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(requireEsignReadPermissionMock).not.toHaveBeenCalled();
    expect(getConsentStatusMock).not.toHaveBeenCalled();
  });

  it('returns 403 when user is not a member of the requested community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await GET(getReq());

    expect(res.status).toBe(403);
    expect(requireEsignReadPermissionMock).not.toHaveBeenCalled();
    expect(getConsentStatusMock).not.toHaveBeenCalled();
  });

  it('returns 403 when esign read permission is denied; service not called', async () => {
    requireEsignReadPermissionMock.mockRejectedValueOnce(
      new ForbiddenError('E-Sign read permission required'),
    );

    const res = await GET(getReq());

    expect(res.status).toBe(403);
    expect(getConsentStatusMock).not.toHaveBeenCalled();
  });

  it('returns 400 when communityId is missing from the query', async () => {
    const res = await GET(getReq(''));

    expect(res.status).toBe(400);
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(getConsentStatusMock).not.toHaveBeenCalled();
  });

  it('returns 400 when communityId is non-numeric', async () => {
    const res = await GET(getReq('?communityId=abc'));

    expect(res.status).toBe(400);
    expect(getConsentStatusMock).not.toHaveBeenCalled();
  });

  it('returns 404 when x-community-id header disagrees with the query', async () => {
    const res = await GET(getReq('?communityId=42', { 'x-community-id': '99' }));

    expect(res.status).toBe(404);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(getConsentStatusMock).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/v1/esign/consent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    requireEsignWritePermissionMock.mockResolvedValue(undefined);
    revokeConsentMock.mockResolvedValue(undefined);
  });

  it('revokes consent and returns the canonical { success: true } envelope; forwards x-request-id', async () => {
    const res = await DELETE(
      deleteReq('?communityId=42', { 'x-request-id': 'req-abc-123' }),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as DeleteConsentJson;
    expect(json.data).toEqual({ success: true });
    expect(requireAuthenticatedUserIdMock).toHaveBeenCalledTimes(1);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-1');
    expect(requireEsignWritePermissionMock).toHaveBeenCalledWith(MEMBERSHIP);
    expect(revokeConsentMock).toHaveBeenCalledWith(42, 'user-1', 'req-abc-123');
  });

  it('passes a null requestId to revokeConsent when x-request-id header is absent', async () => {
    const res = await DELETE(deleteReq());

    expect(res.status).toBe(200);
    expect(revokeConsentMock).toHaveBeenCalledWith(42, 'user-1', null);
  });

  it('returns 401 when unauthenticated; revokeConsent not called', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await DELETE(deleteReq());

    expect(res.status).toBe(401);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(requireEsignWritePermissionMock).not.toHaveBeenCalled();
    expect(revokeConsentMock).not.toHaveBeenCalled();
  });

  it('returns 403 when user is not a member of the requested community; revokeConsent not called', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await DELETE(deleteReq());

    expect(res.status).toBe(403);
    expect(requireEsignWritePermissionMock).not.toHaveBeenCalled();
    expect(revokeConsentMock).not.toHaveBeenCalled();
  });

  it('returns 403 when esign write permission is denied; revokeConsent not called', async () => {
    requireEsignWritePermissionMock.mockRejectedValueOnce(
      new ForbiddenError('E-Sign write permission required'),
    );

    const res = await DELETE(deleteReq());

    expect(res.status).toBe(403);
    expect(revokeConsentMock).not.toHaveBeenCalled();
  });

  it('returns 400 when communityId is missing from the query', async () => {
    const res = await DELETE(deleteReq(''));

    expect(res.status).toBe(400);
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(revokeConsentMock).not.toHaveBeenCalled();
  });

  it('returns 404 when x-community-id header disagrees with the query', async () => {
    const res = await DELETE(
      deleteReq('?communityId=42', { 'x-community-id': '99' }),
    );

    expect(res.status).toBe(404);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(revokeConsentMock).not.toHaveBeenCalled();
  });
});
