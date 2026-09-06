/**
 * Route unit tests — `GET /api/v1/documents/drafts/[id]/document-search`.
 *
 * Added alongside Plan A1 bundle drain #36. Picker endpoint; requires
 * documents.write + draft authorship/admin.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requirePermissionMock,
  getDocumentDraftAuthorshipMock,
  getAccessibleDocumentsMock,
  listAllDocumentCategoryNamesMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  getDocumentDraftAuthorshipMock: vi.fn(),
  getAccessibleDocumentsMock: vi.fn(),
  listAllDocumentCategoryNamesMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  getAccessibleDocuments: getAccessibleDocumentsMock,
}));
vi.mock('@/lib/api/auth', () => ({ requireAuthenticatedUserId: requireAuthenticatedUserIdMock }));
vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));
vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
}));
vi.mock('@/lib/services/document-draft-service', () => ({
  getDocumentDraftAuthorship: getDocumentDraftAuthorshipMock,
}));
vi.mock('@/lib/services/document-category-service', () => ({
  listAllDocumentCategoryNames: listAllDocumentCategoryNamesMock,
}));

import { GET } from '../../src/app/api/v1/documents/drafts/[id]/document-search/route';

const MEMBERSHIP = {
  userId: 'user-1',
  communityId: 42,
  role: 'board_member' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board Member',
  communityType: 'condo_718' as const,
};

const DRAFT_AS_AUTHOR = { id: 5, authorId: 'user-1', deletedAt: null };
const DRAFT_AS_OTHER = { id: 5, authorId: 'someone-else', deletedAt: null };
const DRAFT_DELETED = { id: 5, authorId: 'user-1', deletedAt: new Date() };

function req(qs = '?communityId=42', id = '5', headers?: Record<string, string>): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/documents/drafts/${id}/document-search${qs}`,
    { headers: headers ?? {} },
  );
}
function ctx(id = '5') {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/v1/documents/drafts/[id]/document-search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    requirePermissionMock.mockReturnValue(undefined);
    getDocumentDraftAuthorshipMock.mockResolvedValue(DRAFT_AS_AUTHOR);
    getAccessibleDocumentsMock.mockResolvedValue([
      { id: 10, title: 'Bylaws.pdf', categoryId: 1, mimeType: 'application/pdf' },
      { id: 11, title: 'Budget 2026', categoryId: 2, mimeType: 'application/pdf' },
    ]);
    listAllDocumentCategoryNamesMock.mockResolvedValue(new Map([[1, 'Governing'], [2, 'Finance']]));
  });

  it('returns wrapped filtered docs for the draft author', async () => {
    const res = await GET(req('?communityId=42&q=bylaws'), ctx());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Array<{ documentId: number; title: string }> };
    expect(json.data).toHaveLength(1);
    expect(json.data[0]!.documentId).toBe(10);
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());
    const res = await GET(req(), ctx());
    expect(res.status).toBe(401);
  });

  it('returns 400 when communityId is missing', async () => {
    const res = await GET(req(''), ctx());
    expect(res.status).toBe(400);
  });

  it('returns 400 when communityId is non-numeric', async () => {
    const res = await GET(req('?communityId=abc'), ctx());
    expect(res.status).toBe(400);
  });

  it('returns 400 when [id] is non-numeric', async () => {
    const res = await GET(req('?communityId=42', 'abc'), ctx('abc'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when limit exceeds 50', async () => {
    const res = await GET(req('?communityId=42&limit=999'), ctx());
    expect(res.status).toBe(400);
  });

  it('returns 404 when x-community-id header disagrees with the query', async () => {
    const res = await GET(req('?communityId=42', '5', { 'x-community-id': '99' }), ctx());
    expect(res.status).toBe(404);
  });

  it('returns 403 when documents.write is denied', async () => {
    requirePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('No documents.write');
    });
    const res = await GET(req(), ctx());
    expect(res.status).toBe(403);
  });

  it('returns 404 when the draft does not exist', async () => {
    getDocumentDraftAuthorshipMock.mockResolvedValueOnce(null);
    const res = await GET(req(), ctx());
    expect(res.status).toBe(404);
  });

  it('returns 404 when the draft is soft-deleted', async () => {
    getDocumentDraftAuthorshipMock.mockResolvedValueOnce(DRAFT_DELETED);
    const res = await GET(req(), ctx());
    expect(res.status).toBe(404);
  });

  it('returns 403 when caller is neither author nor admin', async () => {
    requireCommunityMembershipMock.mockResolvedValueOnce({ ...MEMBERSHIP, isAdmin: false });
    getDocumentDraftAuthorshipMock.mockResolvedValueOnce(DRAFT_AS_OTHER);
    const res = await GET(req(), ctx());
    expect(res.status).toBe(403);
  });
});
