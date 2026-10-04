/**
 * Route unit tests — `GET /api/v1/meetings/[id]`.
 *
 * Added alongside Plan A1 bundle drain #37. Standard params + query GET.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  getAccessibleKnownCategories,
  isElevatedRole,
  normalizeCategoryName,
  type KnownDocumentCategoryKey,
} from '@propertypro/shared';
import type { DocumentAccessContext } from '@propertypro/db';
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
  tenantsCanViewInspectionReports: false,
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

  describe('attached documents are filtered by document-category access', () => {
    const CATEGORY_NAMES = new Map<number, string>([
      [1, 'Inspection Reports'],
      [2, 'Rules'],
      [3, 'Meeting Minutes'],
    ]);
    const LINKS = [
      { documentId: 101, attachedAt: new Date('2026-04-01T00:00:00.000Z') },
      { documentId: 102, attachedAt: new Date('2026-04-02T00:00:00.000Z') },
      { documentId: 103, attachedAt: new Date('2026-04-03T00:00:00.000Z') },
    ];
    const ROWS = [
      { id: 101, title: 'Milestone Inspection', fileName: 'i.pdf', fileSize: 1, mimeType: 'application/pdf', categoryId: 1 },
      { id: 102, title: 'Pool Rules', fileName: 'r.pdf', fileSize: 1, mimeType: 'application/pdf', categoryId: 2 },
      { id: 103, title: 'April Minutes', fileName: 'm.pdf', fileSize: 1, mimeType: 'application/pdf', categoryId: 3 },
    ];

    function membership(overrides: Record<string, unknown>) {
      return {
        userId: 'user-1',
        communityId: 42,
        role: 'resident' as const,
        isAdmin: false,
        isUnitOwner: false,
        displayTitle: 'Resident',
        communityType: 'condo_718' as const,
        tenantsCanViewInspectionReports: false,
        ...overrides,
      };
    }

    async function attachedTitles(): Promise<string[]> {
      const res = await GET(req(), ctx());
      expect(res.status).toBe(200);
      const json = (await res.json()) as { data: { documents: Array<{ title: string }> } };
      return json.data.documents.map((d) => d.title);
    }

    beforeEach(() => {
      listMeetingDocumentLinksMock.mockResolvedValue(LINKS);
      getDocumentCategoryNamesMock.mockResolvedValue(CATEGORY_NAMES);
      // Stands in for the SQL filter with the same shared policy
      // `buildDocumentAccessFilter` compiles: elevated roles see every
      // category, everyone else only the categories their role may read.
      // The real SQL is covered by calendar-phase2a.integration.test.ts.
      listMeetingAttachedDocumentsMock.mockImplementation(
        async (access: DocumentAccessContext, ids: number[]) => {
          const opts = {
            isUnitOwner: access.isUnitOwner,
            tenantsCanViewInspectionReports: access.tenantsCanViewInspectionReports,
          };
          const allowed = new Set<string>(
            getAccessibleKnownCategories(access.role, access.communityType, opts),
          );
          return ROWS.filter((row) => ids.includes(row.id)).filter(
            (row) =>
              isElevatedRole(access.role, opts) ||
              allowed.has(
                normalizeCategoryName(CATEGORY_NAMES.get(row.categoryId)) as KnownDocumentCategoryKey,
              ),
          );
        },
      );
    });

    it('a condo tenant gets no Inspection Reports attachment by default', async () => {
      requireCommunityMembershipMock.mockResolvedValue(membership({}));

      const titles = await attachedTitles();

      expect(titles).not.toContain('Milestone Inspection');
      expect(titles).toContain('Pool Rules');
      expect(listMeetingAttachedDocumentsMock).toHaveBeenCalledWith(
        {
          communityId: 42,
          role: 'resident',
          communityType: 'condo_718',
          isUnitOwner: false,
          tenantsCanViewInspectionReports: false,
        },
        [101, 102, 103],
      );
    });

    it('a condo tenant gets the Inspection Reports attachment once the community opts in', async () => {
      requireCommunityMembershipMock.mockResolvedValue(
        membership({ tenantsCanViewInspectionReports: true }),
      );

      const titles = await attachedTitles();

      expect(titles).toContain('Milestone Inspection');
      expect(titles).toContain('Pool Rules');
    });

    it('a unit owner always gets the Inspection Reports attachment', async () => {
      requireCommunityMembershipMock.mockResolvedValue(
        membership({ isUnitOwner: true, displayTitle: 'Owner' }),
      );

      const titles = await attachedTitles();

      expect(titles).toEqual(['Milestone Inspection', 'Pool Rules', 'April Minutes']);
    });

    it('a manager gets every attachment', async () => {
      requireCommunityMembershipMock.mockResolvedValue(
        membership({ role: 'property_manager', isAdmin: true, displayTitle: 'Manager' }),
      );

      const titles = await attachedTitles();

      expect(titles).toEqual(['Milestone Inspection', 'Pool Rules', 'April Minutes']);
    });
  });
});
