import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requirePermissionMock,
  searchDocumentsByTrigramMock,
  searchMeetingsByTrigramMock,
  searchMaintenanceByTrigramMock,
  searchViolationsByTrigramMock,
  searchVisibleAnnouncementsMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  searchDocumentsByTrigramMock: vi.fn(),
  searchMeetingsByTrigramMock: vi.fn(),
  searchMaintenanceByTrigramMock: vi.fn(),
  searchViolationsByTrigramMock: vi.fn(),
  searchVisibleAnnouncementsMock: vi.fn(),
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

vi.mock('@propertypro/db', () => ({
  searchDocumentsByTrigram: searchDocumentsByTrigramMock,
  searchMeetingsByTrigram: searchMeetingsByTrigramMock,
  searchMaintenanceByTrigram: searchMaintenanceByTrigramMock,
  searchViolationsByTrigram: searchViolationsByTrigramMock,
}));

vi.mock('@/lib/announcements/read-visibility', () => ({
  searchVisibleAnnouncements: searchVisibleAnnouncementsMock,
  formatAnnouncementAudienceLabel: (audience: string) => audience,
}));

import { GET as getAnnouncementSearch } from '../../src/app/api/v1/search/announcements/route';
import { GET as getDocumentSearch } from '../../src/app/api/v1/search/documents/route';
import { GET as getMaintenanceSearch } from '../../src/app/api/v1/search/maintenance/route';
import { GET as getMeetingSearch } from '../../src/app/api/v1/search/meetings/route';
import { GET as getViolationSearch } from '../../src/app/api/v1/search/violations/route';

const membership = {
  userId: 'user-1',
  communityId: 42,
  role: 'manager',
  communityType: 'condo_718',
  isUnitOwner: false,
  isAdmin: true,
  displayTitle: 'Manager',
  city: null,
  state: null,
  timezone: 'America/New_York',
  isDemo: false,
  trialEndsAt: null,
  demoExpiresAt: null,
  electionsAttorneyReviewed: false,
} as const;

describe('entity search permission guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue(membership);
    searchDocumentsByTrigramMock.mockResolvedValue({ results: [], totalCount: 0 });
    searchMeetingsByTrigramMock.mockResolvedValue({ results: [], totalCount: 0 });
    searchMaintenanceByTrigramMock.mockResolvedValue({ results: [], totalCount: 0 });
    searchViolationsByTrigramMock.mockResolvedValue({ results: [], totalCount: 0 });
    searchVisibleAnnouncementsMock.mockResolvedValue({ rows: [], totalCount: 0 });
  });

  it('requires read permission before returning document search results', async () => {
    await getDocumentSearch(
      new NextRequest('http://localhost:3000/api/v1/search/documents?communityId=42&q=budget'),
    );

    expect(requirePermissionMock).toHaveBeenCalledWith(membership, 'documents', 'read');
  });

  it('requires read permission before returning announcement search results', async () => {
    await getAnnouncementSearch(
      new NextRequest('http://localhost:3000/api/v1/search/announcements?communityId=42&q=board'),
    );

    expect(requirePermissionMock).toHaveBeenCalledWith(membership, 'announcements', 'read');
  });

  it('requires read permission before returning meeting search results', async () => {
    await getMeetingSearch(
      new NextRequest('http://localhost:3000/api/v1/search/meetings?communityId=42&q=board'),
    );

    expect(requirePermissionMock).toHaveBeenCalledWith(membership, 'meetings', 'read');
  });

  it('requires read permission before returning maintenance search results', async () => {
    await getMaintenanceSearch(
      new NextRequest('http://localhost:3000/api/v1/search/maintenance?communityId=42&q=leak'),
    );

    expect(requirePermissionMock).toHaveBeenCalledWith(membership, 'maintenance', 'read');
  });

  it('requires read permission before returning violation search results', async () => {
    await getViolationSearch(
      new NextRequest('http://localhost:3000/api/v1/search/violations?communityId=42&q=noise'),
    );

    expect(requirePermissionMock).toHaveBeenCalledWith(membership, 'violations', 'read');
  });
});
