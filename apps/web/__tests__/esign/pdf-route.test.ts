/**
 * Route unit tests — `GET /api/v1/esign/templates/[id]/pdf`.
 *
 * Added alongside the Plan A1 auto-drain that migrated this route to
 * `runRoute(contract, handler)`. Covers the contracted runRoute envelope:
 * happy path (presigned URL synthesized into `{ data: { pdfUrl } }`), 401
 * unauth, 400 invalid params.id (non-numeric vs zero), 403 non-member, 403
 * esign-read-permission denied, and the two "no PDF available" branches
 * (missing `sourceDocumentPath`, presign throws) which both now surface as a
 * 404 `NOT_FOUND` with the byte-identical "No PDF available for this template"
 * message.
 *
 * The pre-migration pdf coverage that lived in `esign-route.test.ts` (which
 * asserted `rejects.toThrow('Invalid ID')` — incompatible with the contracted
 * 400 VALIDATION_ERROR response) was removed in the same change; this file is
 * the single source of truth for the route.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  parseCommunityIdFromQueryMock,
  requireEsignReadPermissionMock,
  getTemplateMock,
  createPresignedDownloadUrlMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  parseCommunityIdFromQueryMock: vi.fn(),
  requireEsignReadPermissionMock: vi.fn(),
  getTemplateMock: vi.fn(),
  createPresignedDownloadUrlMock: vi.fn(),
}));

vi.mock('@/lib/middleware/read-entitlement-guard', () => ({ requireEntitledForAdminRead: vi.fn() }));
vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/finance/request', () => ({
  parseCommunityIdFromQuery: parseCommunityIdFromQueryMock,
}));

vi.mock('@/lib/esign/esign-route-helpers', () => ({
  requireEsignReadPermission: requireEsignReadPermissionMock,
}));

vi.mock('@/lib/services/esign-service', () => ({
  getTemplate: getTemplateMock,
}));

vi.mock('@propertypro/db', () => ({
  createPresignedDownloadUrl: createPresignedDownloadUrlMock,
}));

import { GET } from '../../src/app/api/v1/esign/templates/[id]/pdf/route';

const MEMBERSHIP = {
  userId: 'user-staff',
  communityId: 1,
  role: 'cam' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'CAM',
  communityType: 'condo_718' as const,
};

const PRESIGNED_URL = 'https://supabase.storage/signed-url?token=xyz';

function getReq(id: string | number): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/esign/templates/${id}/pdf?communityId=1`,
  );
}

function routeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/v1/esign/templates/[id]/pdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-staff');
    parseCommunityIdFromQueryMock.mockReturnValue(1);
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    requireEsignReadPermissionMock.mockResolvedValue(undefined);
    getTemplateMock.mockResolvedValue({
      id: 5,
      name: 'Violation Acknowledgment',
      sourceDocumentPath: 'communities/1/esign-templates/violation-ack.pdf',
    });
    createPresignedDownloadUrlMock.mockResolvedValue(PRESIGNED_URL);
  });

  it('returns the presigned URL wrapped in { data: { pdfUrl } } (happy path)', async () => {
    const res = await GET(getReq(5), routeCtx('5'));

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { pdfUrl: string } };
    expect(json.data.pdfUrl).toBe(PRESIGNED_URL);
    expect(requireAuthenticatedUserIdMock).toHaveBeenCalled();
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(1, 'user-staff');
    expect(requireEsignReadPermissionMock).toHaveBeenCalledWith(MEMBERSHIP);
    expect(getTemplateMock).toHaveBeenCalledWith(1, 5);
    expect(createPresignedDownloadUrlMock).toHaveBeenCalledWith(
      'documents',
      'communities/1/esign-templates/violation-ack.pdf',
    );
  });

  it('returns 403 when the template path belongs to another community (defensive check)', async () => {
    getTemplateMock.mockResolvedValueOnce({
      id: 5,
      name: 'Violation Acknowledgment',
      // Path under community 99 — must be refused for a community-1 caller.
      sourceDocumentPath: 'communities/99/esign-templates/violation-ack.pdf',
    });

    const res = await GET(getReq(5), routeCtx('5'));

    expect(res.status).toBe(403);
    expect(createPresignedDownloadUrlMock).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(getReq(5), routeCtx('5'));

    expect(res.status).toBe(401);
    expect(getTemplateMock).not.toHaveBeenCalled();
    expect(createPresignedDownloadUrlMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is non-numeric', async () => {
    const res = await GET(getReq('abc'), routeCtx('abc'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(getTemplateMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is zero', async () => {
    const res = await GET(getReq('0'), routeCtx('0'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(getTemplateMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a member of the resolved community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await GET(getReq(5), routeCtx('5'));

    expect(res.status).toBe(403);
    expect(requireEsignReadPermissionMock).not.toHaveBeenCalled();
    expect(getTemplateMock).not.toHaveBeenCalled();
  });

  it('returns 403 when esign read permission is denied', async () => {
    requireEsignReadPermissionMock.mockRejectedValueOnce(
      new ForbiddenError('Insufficient permissions'),
    );

    const res = await GET(getReq(5), routeCtx('5'));

    expect(res.status).toBe(403);
    expect(getTemplateMock).not.toHaveBeenCalled();
  });

  it('returns 404 NOT_FOUND when the template has no sourceDocumentPath', async () => {
    getTemplateMock.mockResolvedValueOnce({
      id: 5,
      name: 'Empty Template',
      sourceDocumentPath: null,
    });

    const res = await GET(getReq(5), routeCtx('5'));

    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe('NOT_FOUND');
    expect(json.error.message).toBe('No PDF available for this template');
    expect(createPresignedDownloadUrlMock).not.toHaveBeenCalled();
  });

  it('returns 404 NOT_FOUND when presigned URL generation fails', async () => {
    createPresignedDownloadUrlMock.mockRejectedValueOnce(new Error('Object not found'));

    const res = await GET(getReq(5), routeCtx('5'));

    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe('NOT_FOUND');
    expect(json.error.message).toBe('No PDF available for this template');
  });
});
