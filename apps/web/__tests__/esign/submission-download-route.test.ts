/**
 * Route unit tests — `GET /api/v1/esign/submissions/[id]/download`.
 *
 * Added alongside the Plan A1 auto-drain. Covers the contracted runRoute
 * envelope: happy path ({ data: { downloadUrl } }), 401 unauth, 400 invalid
 * params.id (non-numeric + zero, as separate cases), 403 esign-read-permission
 * denial, and the preserved business-rule 400 when the submission has no
 * signed document.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { BadRequestError } from '../../src/lib/api/errors/BadRequestError';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  parseCommunityIdFromQueryMock,
  requireEsignReadPermissionMock,
  getSubmissionMock,
  createPresignedDownloadUrlMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  parseCommunityIdFromQueryMock: vi.fn(),
  requireEsignReadPermissionMock: vi.fn(),
  getSubmissionMock: vi.fn(),
  createPresignedDownloadUrlMock: vi.fn(),
}));

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
  getSubmission: getSubmissionMock,
}));

vi.mock('@propertypro/db', () => ({
  createPresignedDownloadUrl: createPresignedDownloadUrlMock,
}));

import { GET } from '../../src/app/api/v1/esign/submissions/[id]/download/route';

const MEMBERSHIP = {
  userId: 'user-admin-1',
  communityId: 42,
  role: 'cam' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Community Association Manager',
  communityType: 'condo_718' as const,
};

const SUBMISSION_DETAIL = {
  submission: {
    id: 9,
    communityId: 42,
    templateId: 3,
    signedDocumentPath: 'esign/signed/doc-9.pdf',
    status: 'completed',
  },
  signers: [],
  events: [],
};

function getReq(id: string | number, query = '?communityId=42'): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/esign/submissions/${id}/download${query}`,
  );
}

function routeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/v1/esign/submissions/[id]/download', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin-1');
    parseCommunityIdFromQueryMock.mockReturnValue(42);
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    requireEsignReadPermissionMock.mockResolvedValue(undefined);
    getSubmissionMock.mockResolvedValue(SUBMISSION_DETAIL);
    createPresignedDownloadUrlMock.mockResolvedValue(
      'https://signed.example/esign/signed/doc-9.pdf',
    );
  });

  it('returns the presigned download URL wrapped in { data } (happy path)', async () => {
    const res = await GET(getReq(9), routeCtx('9'));

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { downloadUrl: string } };
    expect(json.data.downloadUrl).toBe(
      'https://signed.example/esign/signed/doc-9.pdf',
    );
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-admin-1');
    expect(requireEsignReadPermissionMock).toHaveBeenCalledWith(MEMBERSHIP);
    expect(getSubmissionMock).toHaveBeenCalledWith(42, 9);
    expect(createPresignedDownloadUrlMock).toHaveBeenCalledWith(
      'documents',
      'esign/signed/doc-9.pdf',
    );
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(getReq(9), routeCtx('9'));

    expect(res.status).toBe(401);
    expect(parseCommunityIdFromQueryMock).not.toHaveBeenCalled();
    expect(getSubmissionMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is non-numeric', async () => {
    const res = await GET(getReq('abc'), routeCtx('abc'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(getSubmissionMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is zero', async () => {
    const res = await GET(getReq('0'), routeCtx('0'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(getSubmissionMock).not.toHaveBeenCalled();
  });

  it('returns 403 when esign read permission is denied (before getSubmission)', async () => {
    requireEsignReadPermissionMock.mockRejectedValueOnce(
      new ForbiddenError('E-Sign read permission required'),
    );

    const res = await GET(getReq(9), routeCtx('9'));

    expect(res.status).toBe(403);
    expect(getSubmissionMock).not.toHaveBeenCalled();
    expect(createPresignedDownloadUrlMock).not.toHaveBeenCalled();
  });

  it('returns 400 with the preserved business-rule message when no signed document exists', async () => {
    getSubmissionMock.mockResolvedValueOnce({
      ...SUBMISSION_DETAIL,
      submission: { ...SUBMISSION_DETAIL.submission, signedDocumentPath: null },
    });

    const res = await GET(getReq(9), routeCtx('9'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { message: string } };
    expect(json.error.message).toBe(
      'No signed document available for this submission',
    );
    expect(createPresignedDownloadUrlMock).not.toHaveBeenCalled();
  });

  it('propagates a missing/invalid communityId 400 from parseCommunityIdFromQuery', async () => {
    parseCommunityIdFromQueryMock.mockImplementationOnce(() => {
      throw new BadRequestError('communityId query parameter is required');
    });

    const res = await GET(getReq(9, ''), routeCtx('9'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { message: string } };
    expect(json.error.message).toBe('communityId query parameter is required');
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(getSubmissionMock).not.toHaveBeenCalled();
  });
});
