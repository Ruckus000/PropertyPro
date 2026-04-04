import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';

const {
  createScopedClientMock,
  documentCategoriesTableMock,
  inArrayMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requirePermissionMock,
  requireViolationsEnabledMock,
  requireViolationsReadPermissionMock,
  searchAnnouncementsByTrigramMock,
  searchDocumentsMock,
  searchMaintenanceByTrigramMock,
  searchMeetingsByTrigramMock,
  searchViolationsByTrigramMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  documentCategoriesTableMock: {
    id: Symbol('document_categories.id'),
    name: Symbol('document_categories.name'),
  },
  inArrayMock: vi.fn(() => Symbol('inArray')),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  requireViolationsEnabledMock: vi.fn(),
  requireViolationsReadPermissionMock: vi.fn(),
  searchAnnouncementsByTrigramMock: vi.fn(),
  searchDocumentsMock: vi.fn(),
  searchMaintenanceByTrigramMock: vi.fn(),
  searchMeetingsByTrigramMock: vi.fn(),
  searchViolationsByTrigramMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  documentCategories: documentCategoriesTableMock,
  searchAnnouncementsByTrigram: searchAnnouncementsByTrigramMock,
  searchDocuments: searchDocumentsMock,
  searchMaintenanceByTrigram: searchMaintenanceByTrigramMock,
  searchMeetingsByTrigram: searchMeetingsByTrigramMock,
  searchViolationsByTrigram: searchViolationsByTrigramMock,
}));

vi.mock('@propertypro/db/filters', () => ({
  inArray: inArrayMock,
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock('@/lib/violations/common', () => ({
  requireViolationsEnabled: requireViolationsEnabledMock,
  requireViolationsReadPermission: requireViolationsReadPermissionMock,
}));

import { GET as getAnnouncements } from '../../src/app/api/v1/search/announcements/route';
import { GET as getDocuments } from '../../src/app/api/v1/search/documents/route';
import { GET as getMaintenance } from '../../src/app/api/v1/search/maintenance/route';
import { GET as getMeetings } from '../../src/app/api/v1/search/meetings/route';
import { GET as getViolations } from '../../src/app/api/v1/search/violations/route';

function makeMembership(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user-1',
    communityId: 42,
    communityName: 'Palm Shores HOA',
    role: 'manager',
    communityType: 'apartment',
    timezone: 'America/New_York',
    isUnitOwner: false,
    isAdmin: true,
    permissions: {
      resources: {
        announcements: { read: true, write: false },
        documents: { read: true, write: false },
        maintenance: { read: true, write: false },
        meetings: { read: true, write: false },
        violations: { read: true, write: false },
      },
      document_categories: ['rules', 'announcements'],
      can_manage_roles: false,
      can_manage_settings: false,
      is_board_member: false,
    },
    displayTitle: 'Site Manager',
    presetKey: 'site_manager',
    city: 'Fort Lauderdale',
    state: 'FL',
    isDemo: false,
    trialEndsAt: null,
    demoExpiresAt: null,
    electionsAttorneyReviewed: false,
    ...overrides,
  };
}

describe('command palette search routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue(makeMembership());
    requirePermissionMock.mockReturnValue(undefined);
    requireViolationsEnabledMock.mockResolvedValue(undefined);
    requireViolationsReadPermissionMock.mockReturnValue(undefined);
    searchDocumentsMock.mockResolvedValue({
      data: [
        {
          id: 9,
          categoryId: 7,
          title: 'Community Rules',
          description: null,
          filePath: 'communities/42/documents/rules.pdf',
          fileName: 'rules.pdf',
          fileSize: 1024,
          mimeType: 'application/pdf',
          uploadedBy: null,
          searchText: 'rules handbook',
          createdAt: new Date('2026-03-01T00:00:00.000Z'),
          updatedAt: new Date('2026-03-01T00:00:00.000Z'),
          rank: 0.91,
          communityId: 42,
        },
      ],
      nextCursor: null,
    });
    createScopedClientMock.mockReturnValue({
      selectFrom: vi.fn().mockResolvedValue([{ id: 7, name: 'Rules' }]),
    });
    searchAnnouncementsByTrigramMock.mockResolvedValue({ results: [], totalCount: 0 });
    searchMeetingsByTrigramMock.mockResolvedValue({ results: [], totalCount: 0 });
    searchMaintenanceByTrigramMock.mockResolvedValue({ results: [], totalCount: 0 });
    searchViolationsByTrigramMock.mockResolvedValue({ results: [], totalCount: 0 });
  });

  it('documents search reuses the hardened document library query path', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/search/documents?communityId=42&q=rules&limit=3',
    );

    const res = await getDocuments(req);
    const json = (await res.json()) as {
      results: Array<{ subtitle: string; relevance: number }>;
      totalCount: number;
    };

    expect(res.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith(
      expect.objectContaining({ communityId: 42 }),
      'documents',
      'read',
    );
    expect(searchDocumentsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        communityId: 42,
        query: 'rules',
        limit: 3,
        role: 'manager',
        communityType: 'apartment',
      }),
    );
    expect(json.results[0]?.subtitle).toBe('Rules');
    expect(json.results[0]?.relevance).toBe(0.91);
    expect(json.totalCount).toBe(1);
  });

  it('announcements search blocks managers without announcement read access', async () => {
    requirePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('forbidden');
    });

    const req = new NextRequest(
      'http://localhost:3000/api/v1/search/announcements?communityId=42&q=budget',
    );

    const res = await getAnnouncements(req);

    expect(res.status).toBe(403);
    expect(searchAnnouncementsByTrigramMock).not.toHaveBeenCalled();
  });

  it('meetings search blocks managers without meeting read access', async () => {
    requirePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('forbidden');
    });

    const req = new NextRequest(
      'http://localhost:3000/api/v1/search/meetings?communityId=42&q=annual',
    );

    const res = await getMeetings(req);

    expect(res.status).toBe(403);
    expect(searchMeetingsByTrigramMock).not.toHaveBeenCalled();
  });

  it('maintenance search blocks managers without maintenance read access', async () => {
    requirePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('forbidden');
    });

    const req = new NextRequest(
      'http://localhost:3000/api/v1/search/maintenance?communityId=42&q=leak',
    );

    const res = await getMaintenance(req);

    expect(res.status).toBe(403);
    expect(searchMaintenanceByTrigramMock).not.toHaveBeenCalled();
  });

  it('violations search applies the same feature/read gates as the main violations API', async () => {
    requireViolationsEnabledMock.mockRejectedValueOnce(new ForbiddenError('feature disabled'));

    const req = new NextRequest(
      'http://localhost:3000/api/v1/search/violations?communityId=42&q=fine',
    );

    const res = await getViolations(req);

    expect(res.status).toBe(403);
    expect(requireViolationsEnabledMock).toHaveBeenCalledWith(
      expect.objectContaining({ communityId: 42 }),
    );
    expect(searchViolationsByTrigramMock).not.toHaveBeenCalled();
  });
});
