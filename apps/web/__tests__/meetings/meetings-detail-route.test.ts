/**
 * Route unit tests — `GET /api/v1/meetings/[id]`.
 *
 * Added alongside Plan A1 bundle drain #37. Standard params + query GET.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requirePermissionMock,
  getMeetingDetailMock,
  listMeetingDocumentLinksMock,
  listMeetingAttachedDocumentsMock,
  getDocumentCategoryNamesMock,
  serializeMeetingResponseMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  getMeetingDetailMock: vi.fn(),
  listMeetingDocumentLinksMock: vi.fn(),
  listMeetingAttachedDocumentsMock: vi.fn(),
  getDocumentCategoryNamesMock: vi.fn(),
  serializeMeetingResponseMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ requireAuthenticatedUserId: requireAuthenticatedUserIdMock }));
vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));
vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
}));
vi.mock('@/lib/services/meeting-service', () => ({
  getMeetingDetail: getMeetingDetailMock,
  listMeetingDocumentLinks: listMeetingDocumentLinksMock,
  listMeetingAttachedDocuments: listMeetingAttachedDocumentsMock,
}));
vi.mock('@/lib/services/document-category-service', () => ({
  getDocumentCategoryNames: getDocumentCategoryNamesMock,
}));
vi.mock('@/lib/meetings/meeting-response', () => ({
  serializeMeetingResponse: serializeMeetingResponseMock,
}));

import { GET } from '../../src/app/api/v1/meetings/[id]/route';

const MEMBERSHIP = {
  userId: 'user-1',
  communityId: 42,
  role: 'board_member' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board Member',
  communityType: 'condo_718' as const,
};

const MEETING = { id: 11, title: 'Annual Meeting' };

function req(qs = '?communityId=42', id = '11', headers?: Record<string, string>): NextRequest {
  return new NextRequest(`http://localhost:3000/api/v1/meetings/${id}${qs}`, {
    headers: headers ?? {},
  });
}
function ctx(id = '11') {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/v1/meetings/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    requirePermissionMock.mockReturnValue(undefined);
    getMeetingDetailMock.mockResolvedValue(MEETING);
    listMeetingDocumentLinksMock.mockResolvedValue([]);
    listMeetingAttachedDocumentsMock.mockResolvedValue([]);
    getDocumentCategoryNamesMock.mockResolvedValue(new Map());
    serializeMeetingResponseMock.mockReturnValue({ id: 11, title: 'Annual Meeting' });
  });

  it('returns wrapped meeting detail with documents array', async () => {
    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { id: number; documents: unknown[] } };
    expect(json.data.id).toBe(11);
    expect(json.data.documents).toEqual([]);
    expect(getMeetingDetailMock).toHaveBeenCalledWith(42, 11);
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

  it('returns 404 when x-community-id header disagrees with the query', async () => {
    const res = await GET(req('?communityId=42', '11', { 'x-community-id': '99' }), ctx());
    expect(res.status).toBe(404);
  });

  it('returns 403 when not a community member', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member'),
    );
    const res = await GET(req(), ctx());
    expect(res.status).toBe(403);
  });

  it('returns 403 when meetings.read is denied', async () => {
    requirePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Permission denied');
    });
    const res = await GET(req(), ctx());
    expect(res.status).toBe(403);
  });

  it('returns 404 when the meeting is not found', async () => {
    getMeetingDetailMock.mockResolvedValueOnce(null);
    const res = await GET(req(), ctx());
    expect(res.status).toBe(404);
  });
});
