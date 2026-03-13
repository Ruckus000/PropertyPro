/**
 * Unit tests for community data export API route (P4-64).
 *
 * Tests cover:
 * - RBAC enforcement (403 for tenant, 200 for board_member)
 * - Auth requirement (401 when unauthenticated)
 * - Response format (Content-Type, Content-Disposition)
 * - X-Export-Truncated header when data is truncated
 * - communityId validation
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  exportResidentsMock,
  exportDocumentsMock,
  exportMaintenanceRequestsMock,
  exportAnnouncementsMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  exportResidentsMock: vi.fn(),
  exportDocumentsMock: vi.fn(),
  exportMaintenanceRequestsMock: vi.fn(),
  exportAnnouncementsMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/services/community-export', () => ({
  exportResidents: exportResidentsMock,
  exportDocuments: exportDocumentsMock,
  exportMaintenanceRequests: exportMaintenanceRequestsMock,
  exportAnnouncements: exportAnnouncementsMock,
}));

vi.mock('archiver', () => {
  return {
    default: vi.fn(() => {
      const listeners: Record<string, Array<(arg: unknown) => void>> = {};
      return {
        on: vi.fn((event: string, cb: (arg: unknown) => void) => {
          if (!listeners[event]) listeners[event] = [];
          listeners[event].push(cb);
        }),
        append: vi.fn((content: string) => {
          const buf = Buffer.from(content, 'utf-8');
          if (listeners['data']) {
            for (const cb of listeners['data']) cb(buf);
          }
        }),
        finalize: vi.fn(() => {
          // Emit 'end' so the ReadableStream controller closes
          if (listeners['end']) {
            for (const cb of listeners['end']) cb(undefined);
          }
          return Promise.resolve();
        }),
      };
    }),
  };
});

import { GET } from '../../src/app/api/v1/export/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeExportResult(filename: string, truncated = false) {
  return {
    filename,
    content: `header\r\nrow1\r\n`,
    rowCount: 1,
    truncated,
  };
}

function makeRequest(communityId?: string | number) {
  const url = communityId
    ? `http://localhost:3000/api/v1/export?communityId=${communityId}`
    : 'http://localhost:3000/api/v1/export';
  return new NextRequest(url);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/v1/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-123');
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Board Member', presetKey: 'board_member', permissions: { resources: { documents: { read: true, write: true }, meetings: { read: true, write: true }, announcements: { read: true, write: true }, compliance: { read: true, write: true }, residents: { read: true, write: true }, financial: { read: true, write: true }, maintenance: { read: true, write: true }, violations: { read: true, write: true }, leases: { read: true, write: true }, contracts: { read: true, write: true }, polls: { read: true, write: true }, settings: { read: true, write: true }, audit: { read: true, write: true }, arc_submissions: { read: true, write: true }, work_orders: { read: true, write: true }, amenities: { read: true, write: true }, packages: { read: true, write: true }, visitors: { read: true, write: true }, calendar_sync: { read: true, write: true }, accounting: { read: true, write: true }, esign: { read: true, write: true }, finances: { read: true, write: true } } },
      communityType: 'condo_718',
    });
    exportResidentsMock.mockResolvedValue(makeExportResult('residents.csv'));
    exportDocumentsMock.mockResolvedValue(makeExportResult('documents.csv'));
    exportMaintenanceRequestsMock.mockResolvedValue(makeExportResult('maintenance-requests.csv'));
    exportAnnouncementsMock.mockResolvedValue(makeExportResult('announcements.csv'));
  });

  it('returns ZIP file with correct headers for authorized user', async () => {
    const res = await GET(makeRequest(42));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/zip');
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="community-export-42.zip"',
    );
  });

  it('returns 403 for tenant role', async () => {
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'resident', isAdmin: false, isUnitOwner: false, displayTitle: 'Tenant',
      communityType: 'condo_718',
    });

    const res = await GET(makeRequest(42));
    expect(res.status).toBe(403);
  });

  it('returns 401 when unauthenticated', async () => {
    const { UnauthorizedError } = await import('../../src/lib/api/errors');
    requireAuthenticatedUserIdMock.mockRejectedValue(new UnauthorizedError());

    const res = await GET(makeRequest(42));
    expect(res.status).toBe(401);
  });

  it('returns 400 when communityId is missing', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
  });

  it('returns 400 when communityId is invalid', async () => {
    const res = await GET(makeRequest('abc'));
    expect(res.status).toBe(400);
  });

  it('sets X-Export-Truncated header when any export is truncated', async () => {
    exportResidentsMock.mockResolvedValue(makeExportResult('residents.csv', true));

    const res = await GET(makeRequest(42));
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Export-Truncated')).toBe('true');
  });

  it('does not set X-Export-Truncated when no export is truncated', async () => {
    const res = await GET(makeRequest(42));
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Export-Truncated')).toBeNull();
  });

  it('calls all four export functions with communityId', async () => {
    await GET(makeRequest(42));

    expect(exportResidentsMock).toHaveBeenCalledWith(42);
    expect(exportDocumentsMock).toHaveBeenCalledWith(42);
    expect(exportMaintenanceRequestsMock).toHaveBeenCalledWith(42);
    expect(exportAnnouncementsMock).toHaveBeenCalledWith(42);
  });

  it('allows owner role access', async () => {
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'resident', isAdmin: false, isUnitOwner: true, displayTitle: 'Owner',
      communityType: 'condo_718',
    });

    const res = await GET(makeRequest(42));
    expect(res.status).toBe(200);
  });

  it('allows property_manager_admin role access', async () => {
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'pm_admin', isAdmin: true, isUnitOwner: false, displayTitle: 'Property Manager Admin',
      communityType: 'apartment',
    });

    const res = await GET(makeRequest(42));
    expect(res.status).toBe(200);
  });

  it('allows board_president role access', async () => {
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Board President', presetKey: 'board_president', permissions: { resources: { documents: { read: true, write: true }, meetings: { read: true, write: true }, announcements: { read: true, write: true }, compliance: { read: true, write: true }, residents: { read: true, write: true }, financial: { read: true, write: true }, maintenance: { read: true, write: true }, violations: { read: true, write: true }, leases: { read: true, write: true }, contracts: { read: true, write: true }, polls: { read: true, write: true }, settings: { read: true, write: true }, audit: { read: true, write: true }, arc_submissions: { read: true, write: true }, work_orders: { read: true, write: true }, amenities: { read: true, write: true }, packages: { read: true, write: true }, visitors: { read: true, write: true }, calendar_sync: { read: true, write: true }, accounting: { read: true, write: true }, esign: { read: true, write: true }, finances: { read: true, write: true } } },
      communityType: 'condo_718',
    });

    const res = await GET(makeRequest(42));
    expect(res.status).toBe(200);
  });

  it('allows cam role access', async () => {
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Community Manager', presetKey: 'cam', permissions: { resources: { documents: { read: true, write: true }, meetings: { read: true, write: true }, announcements: { read: true, write: true }, compliance: { read: true, write: true }, residents: { read: true, write: true }, financial: { read: true, write: true }, maintenance: { read: true, write: true }, violations: { read: true, write: true }, leases: { read: true, write: true }, contracts: { read: true, write: true }, polls: { read: true, write: true }, settings: { read: true, write: true }, audit: { read: true, write: true }, arc_submissions: { read: true, write: true }, work_orders: { read: true, write: true }, amenities: { read: true, write: true }, packages: { read: true, write: true }, visitors: { read: true, write: true }, calendar_sync: { read: true, write: true }, accounting: { read: true, write: true }, esign: { read: true, write: true }, finances: { read: true, write: true } } },
      communityType: 'condo_718',
    });

    const res = await GET(makeRequest(42));
    expect(res.status).toBe(200);
  });

  it('allows site_manager role access for apartment', async () => {
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Site Manager', presetKey: 'site_manager', permissions: { resources: { documents: { read: true, write: true }, meetings: { read: true, write: true }, announcements: { read: true, write: true }, compliance: { read: true, write: true }, residents: { read: true, write: true }, financial: { read: true, write: true }, maintenance: { read: true, write: true }, violations: { read: true, write: true }, leases: { read: true, write: true }, contracts: { read: true, write: true }, polls: { read: true, write: true }, settings: { read: true, write: true }, audit: { read: true, write: true }, arc_submissions: { read: true, write: true }, work_orders: { read: true, write: true }, amenities: { read: true, write: true }, packages: { read: true, write: true }, visitors: { read: true, write: true }, calendar_sync: { read: true, write: true }, accounting: { read: true, write: true }, esign: { read: true, write: true }, finances: { read: true, write: true } } },
      communityType: 'apartment',
    });

    const res = await GET(makeRequest(42));
    expect(res.status).toBe(200);
  });
});
