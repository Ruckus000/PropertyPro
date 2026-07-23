/**
 * Route unit tests — `GET /api/v1/esign/submissions/[id]`.
 *
 * Added alongside Plan A1 drain #118.
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
  getSubmissionMock,
  getTemplateMock,
  createPresignedDownloadUrlMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  parseCommunityIdFromQueryMock: vi.fn(),
  requireEsignReadPermissionMock: vi.fn(),
  getSubmissionMock: vi.fn(),
  getTemplateMock: vi.fn(),
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
  getTemplate: getTemplateMock,
}));

vi.mock('@propertypro/db', () => ({
  createPresignedDownloadUrl: createPresignedDownloadUrlMock,
}));

import { GET } from '../../src/app/api/v1/esign/submissions/[id]/route';

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
};

const TEMPLATE = {
  id: 3,
  sourceDocumentPath: 'esign/templates/template-3.pdf',
};

function routeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/v1/esign/submissions/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin-1');
    parseCommunityIdFromQueryMock.mockReturnValue(42);
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    requireEsignReadPermissionMock.mockResolvedValue(undefined);
    getSubmissionMock.mockResolvedValue(SUBMISSION_DETAIL);
    getTemplateMock.mockResolvedValue(TEMPLATE);
    createPresignedDownloadUrlMock.mockImplementation(async (_bucket: string, path: string) => {
      return `https://signed.example/${path}`;
    });
  });

  it('returns submission detail with presigned URLs wrapped in { data }', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/esign/submissions/9?communityId=42',
    );
    const res = await GET(req, routeCtx('9'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toMatchObject({
      submission: SUBMISSION_DETAIL.submission,
      signers: [],
      previewPdfUrl: 'https://signed.example/esign/signed/doc-9.pdf',
      downloadUrl: 'https://signed.example/esign/signed/doc-9.pdf',
    });
    expect(getSubmissionMock).toHaveBeenCalledWith(42, 9);
    expect(getTemplateMock).toHaveBeenCalledWith(42, 3);
  });

  it('returns 401 for unauthenticated requests', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());
    const req = new NextRequest(
      'http://localhost:3000/api/v1/esign/submissions/9?communityId=42',
    );

    const res = await GET(req, routeCtx('9'));
    expect(res.status).toBe(401);
    expect(getSubmissionMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid params.id before service call', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/esign/submissions/0?communityId=42',
    );

    const res = await GET(req, routeCtx('0'));
    expect(res.status).toBe(400);
    expect(getSubmissionMock).not.toHaveBeenCalled();
  });

  it('returns 403 when esign read permission is denied', async () => {
    requireEsignReadPermissionMock.mockRejectedValueOnce(
      new ForbiddenError('E-Sign read permission required'),
    );
    const req = new NextRequest(
      'http://localhost:3000/api/v1/esign/submissions/9?communityId=42',
    );

    const res = await GET(req, routeCtx('9'));
    expect(res.status).toBe(403);
    expect(getSubmissionMock).not.toHaveBeenCalled();
  });

  it('falls back to template source path for preview when signed document is absent', async () => {
    getSubmissionMock.mockResolvedValueOnce({
      submission: {
        ...SUBMISSION_DETAIL.submission,
        signedDocumentPath: null,
      },
      signers: [],
    });
    createPresignedDownloadUrlMock.mockResolvedValueOnce(
      'https://signed.example/esign/templates/template-3.pdf',
    );

    const req = new NextRequest(
      'http://localhost:3000/api/v1/esign/submissions/9?communityId=42',
    );
    const res = await GET(req, routeCtx('9'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.previewPdfUrl).toBe('https://signed.example/esign/templates/template-3.pdf');
    expect(json.data.downloadUrl).toBeNull();
  });
});
