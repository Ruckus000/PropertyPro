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
import { PassThrough } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  requireAuthenticatedUserIdMock,
  requireFreshReauthMock,
  requireCommunityMembershipMock,
  exportResidentsMock,
  exportDocumentsMock,
  exportMaintenanceRequestsMock,
  exportAnnouncementsMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireFreshReauthMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  exportResidentsMock: vi.fn(),
  exportDocumentsMock: vi.fn(),
  exportMaintenanceRequestsMock: vi.fn(),
  exportAnnouncementsMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/reauth-guard', () => ({
  requireFreshReauth: requireFreshReauthMock,
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
  // A REAL PassThrough, not a hand-rolled EventEmitter.
  //
  // The route bridges the archive to a web stream with `Readable.toWeb`, which
  // duck-types on `_readableState` — a plain object with `on`/`append` throws
  // `The "streamReadable" argument must be an stream.Readable`. The previous
  // mock was that plain object, and it only "worked" because the route used to
  // hand-roll the bridge off raw 'data' events (with no backpressure — the very
  // defect that change fixed). A mock that cannot fail the way production fails
  // is not testing production.
  //
  // Verified against the real library: archiver is NOT `instanceof Readable`,
  // but Readable.toWeb accepts it, and a two-entry archive yields ~251 bytes.
  return {
    default: vi.fn(() => {
      const pass = new PassThrough();
      const archive = pass as unknown as Record<string, unknown>;
      archive.append = vi.fn((content: string) => {
        pass.write(Buffer.from(String(content), 'utf-8'));
      });
      archive.finalize = vi.fn(() => {
        pass.end();
        return Promise.resolve();
      });
      return archive;
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
    requireFreshReauthMock.mockResolvedValue(undefined);
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

  // ── This block asserted the OPPOSITE, and the assertion was the bug ────────
  //
  // The route gated on `requirePermission(membership, 'settings', 'read')`,
  // which the RBAC matrix grants to the `owner` row — so every unit owner could
  // pull a CSV of every resident's full name and email address. The test
  // faithfully encoded that as intended behaviour, which is why nothing caught
  // it. The bar is now management-tier-or-board.
  // See docs/audits/2026-08-09-legal-risk-audit.md F-07.

  it('REFUSES a plain unit owner', async () => {
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'resident', isAdmin: false, isUnitOwner: true, displayTitle: 'Owner',
      communityType: 'condo_718', designation: null,
    });

    const res = await GET(makeRequest(42));
    expect(res.status).toBe(403);
    expect(exportResidentsMock).not.toHaveBeenCalled();
  });

  it('REFUSES a tenant', async () => {
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'resident', isAdmin: false, isUnitOwner: false, displayTitle: 'Tenant',
      communityType: 'condo_718', designation: null,
    });

    const res = await GET(makeRequest(42));
    expect(res.status).toBe(403);
  });

  it('allows a board member, who is a resident with a designation', async () => {
    // Designation is orthogonal to role (ADR-006 §3.2), so a self-managed
    // association's board would be refused by an isAdmin-only check — and they
    // are exactly who runs this.
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'resident', isAdmin: false, isUnitOwner: true, displayTitle: 'Board President',
      communityType: 'condo_718', designation: 'board_president',
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
