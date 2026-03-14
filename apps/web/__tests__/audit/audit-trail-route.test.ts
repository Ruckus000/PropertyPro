/**
 * Unit tests for audit trail API route (P3-53).
 *
 * Tests cover:
 * - Admin role gate: owner/tenant denied (403)
 * - Filters: action, date range, userId
 * - Reverse chronological sort (createdAt DESC, id DESC)
 * - Cursor-based pagination stability
 * - CSV export with formula-injection sanitization
 * - Metadata redaction for sensitive keys
 * - Read-only: no mutation routes
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  createScopedClientMock,
  complianceAuditLogTableMock,
  userRolesTableMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  complianceAuditLogTableMock: { id: Symbol('compliance_audit_log.id') },
  userRolesTableMock: { id: Symbol('user_roles.id') },
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  complianceAuditLog: complianceAuditLogTableMock,
  userRoles: userRolesTableMock,
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

import { GET } from '../../src/app/api/v1/audit-trail/route';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function makeAuditRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    userId: 'user-abc',
    communityId: 42,
    action: 'create',
    resourceType: 'document',
    resourceId: '10',
    oldValues: null,
    newValues: { title: 'Test' },
    metadata: { requestId: 'req-1' },
    createdAt: new Date('2026-02-20T12:00:00Z'),
    ...overrides,
  };
}

function makeChainableBuilder(rows: unknown[]) {
  let currentRows = [...rows];
  const builder: Record<string, unknown> = {};
  builder.orderBy = vi.fn().mockImplementation(() => {
    // Simulate DB ordering used by the route: (createdAt DESC, id DESC).
    if (
      currentRows.every(
        (row) =>
          row !== null &&
          typeof row === 'object' &&
          'createdAt' in (row as Record<string, unknown>) &&
          'id' in (row as Record<string, unknown>),
      )
    ) {
      currentRows = [...currentRows].sort((a, b) => {
        const aRow = a as { createdAt: Date; id: number };
        const bRow = b as { createdAt: Date; id: number };
        const byCreatedAt = bRow.createdAt.getTime() - aRow.createdAt.getTime();
        if (byCreatedAt !== 0) return byCreatedAt;
        return bRow.id - aRow.id;
      });
    }
    return builder;
  });
  builder.limit = vi.fn().mockImplementation((n: number) => {
    // Return a thenable that resolves to rows.slice(0, n)
    const limited = currentRows.slice(0, n);
    const thenable: Record<string, unknown> = { ...builder };
    thenable.then = (resolve: (v: unknown) => unknown) => Promise.resolve(limited).then(resolve);
    return thenable;
  });
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(currentRows).then(resolve);
  return builder;
}

function makeDefaultScopedClient(overrides: Record<string, unknown> = {}) {
  // Pre-sorted DESC by (createdAt, id) as the DB would return with orderBy
  const defaultAuditRows = [
    makeAuditRow({ id: 3, createdAt: new Date('2026-02-22T10:00:00Z') }),
    makeAuditRow({ id: 2, createdAt: new Date('2026-02-21T08:00:00Z') }),
    makeAuditRow({ id: 1, createdAt: new Date('2026-02-20T12:00:00Z') }),
  ];

  const query = vi.fn().mockImplementation(async (table: unknown) => {
    if (table === userRolesTableMock) {
      return [{ userId: 'user-abc', role: 'manager', isUnitOwner: false, displayTitle: 'Board President', presetKey: 'board_president', permissions: { resources: { documents: { read: true, write: true }, meetings: { read: true, write: true }, announcements: { read: true, write: true }, compliance: { read: true, write: true }, residents: { read: true, write: true }, financial: { read: true, write: true }, maintenance: { read: true, write: true }, violations: { read: true, write: true }, leases: { read: true, write: true }, contracts: { read: true, write: true }, polls: { read: true, write: true }, settings: { read: true, write: true }, audit: { read: true, write: true }, arc_submissions: { read: true, write: true }, work_orders: { read: true, write: true }, amenities: { read: true, write: true }, packages: { read: true, write: true }, visitors: { read: true, write: true }, calendar_sync: { read: true, write: true }, accounting: { read: true, write: true }, esign: { read: true, write: true }, finances: { read: true, write: true } } }, communityId: 42 }];
    }
    return [];
  });

  const selectFrom = vi.fn().mockImplementation((table: unknown) => {
    if (table === complianceAuditLogTableMock) {
      return makeChainableBuilder(defaultAuditRows);
    }
    if (table === userRolesTableMock) {
      return makeChainableBuilder([{ userId: 'user-abc', role: 'manager', isUnitOwner: false, displayTitle: 'Board President', presetKey: 'board_president', permissions: { resources: { documents: { read: true, write: true }, meetings: { read: true, write: true }, announcements: { read: true, write: true }, compliance: { read: true, write: true }, residents: { read: true, write: true }, financial: { read: true, write: true }, maintenance: { read: true, write: true }, violations: { read: true, write: true }, leases: { read: true, write: true }, contracts: { read: true, write: true }, polls: { read: true, write: true }, settings: { read: true, write: true }, audit: { read: true, write: true }, arc_submissions: { read: true, write: true }, work_orders: { read: true, write: true }, amenities: { read: true, write: true }, packages: { read: true, write: true }, visitors: { read: true, write: true }, calendar_sync: { read: true, write: true }, accounting: { read: true, write: true }, esign: { read: true, write: true }, finances: { read: true, write: true } } }, communityId: 42 }]);
    }
    return makeChainableBuilder([]);
  });

  return {
    query,
    selectFrom,
    ...overrides,
  };
}

describe('p3-53 audit trail route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('session-user-1');
    requireCommunityMembershipMock.mockResolvedValue({
      userId: 'session-user-1',
      communityId: 42,
      role: 'manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Board President', presetKey: 'board_president', permissions: { resources: { documents: { read: true, write: true }, meetings: { read: true, write: true }, announcements: { read: true, write: true }, compliance: { read: true, write: true }, residents: { read: true, write: true }, financial: { read: true, write: true }, maintenance: { read: true, write: true }, violations: { read: true, write: true }, leases: { read: true, write: true }, contracts: { read: true, write: true }, polls: { read: true, write: true }, settings: { read: true, write: true }, audit: { read: true, write: true }, arc_submissions: { read: true, write: true }, work_orders: { read: true, write: true }, amenities: { read: true, write: true }, packages: { read: true, write: true }, visitors: { read: true, write: true }, calendar_sync: { read: true, write: true }, accounting: { read: true, write: true }, esign: { read: true, write: true }, finances: { read: true, write: true } } },
      communityType: 'condo_718',
    });
    createScopedClientMock.mockReturnValue(makeDefaultScopedClient());
  });

  // -------------------------------------------------------------------------
  // Admin role gate
  // -------------------------------------------------------------------------

  describe('admin role gate', () => {
    it('returns 403 for owner role', async () => {
      requireCommunityMembershipMock.mockResolvedValue({
        userId: 'session-user-1',
        communityId: 42,
        role: 'resident', isAdmin: false, isUnitOwner: true, displayTitle: 'Owner',
        communityType: 'condo_718',
      });

      const req = new NextRequest('http://localhost:3000/api/v1/audit-trail?communityId=42');
      const res = await GET(req);
      expect(res.status).toBe(403);
    });

    it('returns 403 for tenant role', async () => {
      requireCommunityMembershipMock.mockResolvedValue({
        userId: 'session-user-1',
        communityId: 42,
        role: 'resident', isAdmin: false, isUnitOwner: false, displayTitle: 'Tenant',
        communityType: 'condo_718',
      });

      const req = new NextRequest('http://localhost:3000/api/v1/audit-trail?communityId=42');
      const res = await GET(req);
      expect(res.status).toBe(403);
    });

    it.each([
      { label: 'board_member', presetKey: 'board_member', displayTitle: 'Board Member' },
      { label: 'board_president', presetKey: 'board_president', displayTitle: 'Board President' },
      { label: 'cam', presetKey: 'cam', displayTitle: 'Community Manager' },
    ] as const)('returns 200 for $label role in condo_718', async ({ presetKey, displayTitle }) => {
      requireCommunityMembershipMock.mockResolvedValue({
        userId: 'session-user-1',
        communityId: 42,
        role: 'manager', isAdmin: true, isUnitOwner: false, displayTitle, presetKey,
        permissions: { resources: { documents: { read: true, write: true }, meetings: { read: true, write: true }, announcements: { read: true, write: true }, compliance: { read: true, write: true }, residents: { read: true, write: true }, maintenance: { read: true, write: true }, violations: { read: true, write: true }, contracts: { read: true, write: true }, polls: { read: true, write: true }, settings: { read: true, write: true }, audit: { read: true, write: true }, arc_submissions: { read: true, write: true }, work_orders: { read: true, write: true }, amenities: { read: true, write: true }, packages: { read: true, write: true }, visitors: { read: true, write: true }, calendar_sync: { read: true, write: true }, accounting: { read: true, write: true }, esign: { read: true, write: true }, finances: { read: true, write: true } } },
        communityType: 'condo_718',
      });

      const req = new NextRequest('http://localhost:3000/api/v1/audit-trail?communityId=42');
      const res = await GET(req);
      expect(res.status).toBe(200);
    });

    it('returns 200 for property_manager_admin role in condo_718', async () => {
      requireCommunityMembershipMock.mockResolvedValue({
        userId: 'session-user-1',
        communityId: 42,
        role: 'pm_admin', isAdmin: true, isUnitOwner: false, displayTitle: 'Property Manager Admin',
        communityType: 'condo_718',
      });

      const req = new NextRequest('http://localhost:3000/api/v1/audit-trail?communityId=42');
      const res = await GET(req);
      expect(res.status).toBe(200);
    });

    it('returns 200 for site_manager role in apartment', async () => {
      requireCommunityMembershipMock.mockResolvedValue({
        userId: 'session-user-1',
        communityId: 42,
        role: 'manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Site Manager', presetKey: 'site_manager', permissions: { resources: { documents: { read: true, write: true }, meetings: { read: true, write: true }, announcements: { read: true, write: true }, compliance: { read: true, write: true }, residents: { read: true, write: true }, financial: { read: true, write: true }, maintenance: { read: true, write: true }, violations: { read: true, write: true }, leases: { read: true, write: true }, contracts: { read: true, write: true }, polls: { read: true, write: true }, settings: { read: true, write: true }, audit: { read: true, write: true }, arc_submissions: { read: true, write: true }, work_orders: { read: true, write: true }, amenities: { read: true, write: true }, packages: { read: true, write: true }, visitors: { read: true, write: true }, calendar_sync: { read: true, write: true }, accounting: { read: true, write: true }, esign: { read: true, write: true }, finances: { read: true, write: true } } },
        communityType: 'apartment',
      });

      const req = new NextRequest('http://localhost:3000/api/v1/audit-trail?communityId=42');
      const res = await GET(req);
      expect(res.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  describe('validation', () => {
    it('rejects missing communityId', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/audit-trail');
      const res = await GET(req);
      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // Sorting
  // -------------------------------------------------------------------------

  describe('sorting', () => {
    it('returns entries in reverse chronological order (createdAt DESC, id DESC)', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/audit-trail?communityId=42');
      const res = await GET(req);
      const json = (await res.json()) as { data: Array<{ id: number; createdAt: string }> };

      expect(json.data[0].id).toBe(3); // most recent
      expect(json.data[1].id).toBe(2);
      expect(json.data[2].id).toBe(1); // oldest
    });
  });

  // -------------------------------------------------------------------------
  // Filters
  // -------------------------------------------------------------------------

  describe('filters', () => {
    it('filters by action', async () => {
      // DB-level filtering: route passes additionalWhere to selectFrom; mock returns only matching rows
      const selectFrom = vi.fn().mockImplementation((table: unknown) => {
        if (table === complianceAuditLogTableMock) {
          return makeChainableBuilder([makeAuditRow({ id: 2, action: 'update' })]);
        }
        return makeChainableBuilder([]);
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ selectFrom }));

      const req = new NextRequest(
        'http://localhost:3000/api/v1/audit-trail?communityId=42&action=update',
      );
      const res = await GET(req);
      const json = (await res.json()) as { data: Array<{ action: string }> };

      expect(json.data).toHaveLength(1);
      expect(json.data[0].action).toBe('update');
    });

    it('filters by userId', async () => {
      const selectFrom = vi.fn().mockImplementation((table: unknown) => {
        if (table === complianceAuditLogTableMock) {
          return makeChainableBuilder([makeAuditRow({ id: 2, userId: 'user-b' })]);
        }
        return makeChainableBuilder([]);
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ selectFrom }));

      const req = new NextRequest(
        'http://localhost:3000/api/v1/audit-trail?communityId=42&userId=user-b',
      );
      const res = await GET(req);
      const json = (await res.json()) as { data: Array<{ userId: string }> };

      expect(json.data).toHaveLength(1);
      expect(json.data[0].userId).toBe('user-b');
    });

    it('filters by date range', async () => {
      const selectFrom = vi.fn().mockImplementation((table: unknown) => {
        if (table === complianceAuditLogTableMock) {
          return makeChainableBuilder([makeAuditRow({ id: 2, createdAt: new Date('2026-02-20T12:00:00Z') })]);
        }
        return makeChainableBuilder([]);
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ selectFrom }));

      const req = new NextRequest(
        'http://localhost:3000/api/v1/audit-trail?communityId=42&startDate=2026-02-20&endDate=2026-02-21',
      );
      const res = await GET(req);
      const json = (await res.json()) as { data: Array<{ id: number }> };

      expect(json.data).toHaveLength(1);
      expect(json.data[0].id).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // Cursor pagination
  // -------------------------------------------------------------------------

  describe('cursor pagination', () => {
    it('returns nextCursor when hasMore', async () => {
      const rows = Array.from({ length: 55 }, (_, i) =>
        makeAuditRow({
          id: i + 1,
          createdAt: new Date(`2026-02-${String(Math.min(i + 1, 28)).padStart(2, '0')}T12:00:00Z`),
        }),
      );
      const selectFrom = vi.fn().mockImplementation((table: unknown) => {
        if (table === complianceAuditLogTableMock) return makeChainableBuilder(rows);
        return makeChainableBuilder([]);
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ selectFrom }));

      const req = new NextRequest(
        'http://localhost:3000/api/v1/audit-trail?communityId=42&limit=10',
      );
      const res = await GET(req);
      const json = (await res.json()) as {
        data: unknown[];
        pagination: { nextCursor: string | null; hasMore: boolean };
      };

      expect(json.pagination.hasMore).toBe(true);
      expect(json.pagination.nextCursor).not.toBeNull();
      expect(json.data).toHaveLength(10);
    });

    it('returns null nextCursor when no more pages', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/audit-trail?communityId=42&limit=50',
      );
      const res = await GET(req);
      const json = (await res.json()) as {
        pagination: { nextCursor: string | null; hasMore: boolean };
      };

      expect(json.pagination.hasMore).toBe(false);
      expect(json.pagination.nextCursor).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // CSV export
  // -------------------------------------------------------------------------

  describe('CSV export', () => {
    it('returns CSV content-type with format=csv', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/audit-trail?communityId=42&format=csv',
      );
      const res = await GET(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/csv');
      expect(res.headers.get('content-disposition')).toContain('audit-trail-42.csv');
    });

    it('sanitizes formula injection in CSV cells', async () => {
      const selectFrom = vi.fn().mockImplementation((table: unknown) => {
        if (table === complianceAuditLogTableMock) {
          return makeChainableBuilder([
            makeAuditRow({
              id: 1,
              action: '=CMD()',
              resourceType: '+evil',
              resourceId: '@malicious',
            }),
          ]);
        }
        return makeChainableBuilder([]);
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ selectFrom }));

      const req = new NextRequest(
        'http://localhost:3000/api/v1/audit-trail?communityId=42&format=csv',
      );
      const res = await GET(req);
      const csvText = await res.text();

      // Dangerous characters should be prefixed with apostrophe
      expect(csvText).toContain("'=CMD()");
      expect(csvText).toContain("'+evil");
      expect(csvText).toContain("'@malicious");
    });

    it('caps CSV export at MAX_CSV_ROWS when input exceeds limit', async () => {
      const rows = Array.from({ length: 10_005 }, (_, i) =>
        makeAuditRow({
          id: i + 1,
          createdAt: new Date(Date.now() - i * 1000),
        }),
      );
      const selectFrom = vi.fn().mockImplementation((table: unknown) => {
        if (table === complianceAuditLogTableMock) return makeChainableBuilder(rows);
        return makeChainableBuilder([]);
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ selectFrom }));

      const req = new NextRequest(
        'http://localhost:3000/api/v1/audit-trail?communityId=42&format=csv',
      );
      const res = await GET(req);
      const csvText = await res.text();

      // CSV: 1 header line + exactly 10,000 data lines + trailing CRLF
      const lines = csvText.split('\r\n').filter(Boolean);
      expect(lines.length).toBe(10_001); // exactly 1 header + 10,000 data rows
      expect(lines[0]).toContain('ID'); // header row is present

      // Truncation headers must be set
      expect(res.headers.get('x-csv-truncated')).toBe('true');
      expect(res.headers.get('x-csv-max-rows')).toBe('10000');
    });

    it('sets truncation headers at exactly MAX_CSV_ROWS boundary', async () => {
      // At exactly 10,000 rows, we can't distinguish "exactly 10k" from
      // "10k+ truncated", so the route conservatively signals truncation.
      const rows = Array.from({ length: 10_000 }, (_, i) =>
        makeAuditRow({
          id: i + 1,
          createdAt: new Date(Date.now() - i * 1000),
        }),
      );
      const selectFrom = vi.fn().mockImplementation((table: unknown) => {
        if (table === complianceAuditLogTableMock) return makeChainableBuilder(rows);
        return makeChainableBuilder([]);
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ selectFrom }));

      const req = new NextRequest(
        'http://localhost:3000/api/v1/audit-trail?communityId=42&format=csv',
      );
      const res = await GET(req);
      const csvText = await res.text();
      const lines = csvText.split('\r\n').filter(Boolean);

      expect(lines.length).toBe(10_001); // 1 header + 10,000 data rows
      expect(res.headers.get('x-csv-truncated')).toBe('true');
    });

    it('does not set truncation headers when under limit (9999 rows)', async () => {
      const rows = Array.from({ length: 9_999 }, (_, i) =>
        makeAuditRow({
          id: i + 1,
          createdAt: new Date(Date.now() - i * 1000),
        }),
      );
      const selectFrom = vi.fn().mockImplementation((table: unknown) => {
        if (table === complianceAuditLogTableMock) return makeChainableBuilder(rows);
        return makeChainableBuilder([]);
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ selectFrom }));

      const req = new NextRequest(
        'http://localhost:3000/api/v1/audit-trail?communityId=42&format=csv',
      );
      const res = await GET(req);
      const csvText = await res.text();
      const lines = csvText.split('\r\n').filter(Boolean);

      expect(lines.length).toBe(10_000); // 1 header + 9,999 data rows
      expect(res.headers.get('x-csv-truncated')).toBeNull();
      expect(res.headers.get('x-csv-max-rows')).toBeNull();
    });

    it('redacts sensitive metadata keys in CSV', async () => {
      const selectFrom = vi.fn().mockImplementation((table: unknown) => {
        if (table === complianceAuditLogTableMock) {
          return makeChainableBuilder([
            makeAuditRow({
              id: 1,
              metadata: { requestId: 'req-1', token: 'secret-token-123', password: 'p@ss' },
            }),
          ]);
        }
        return makeChainableBuilder([]);
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ selectFrom }));

      const req = new NextRequest(
        'http://localhost:3000/api/v1/audit-trail?communityId=42&format=csv',
      );
      const res = await GET(req);
      const csvText = await res.text();

      expect(csvText).toContain('[REDACTED]');
      expect(csvText).not.toContain('secret-token-123');
      expect(csvText).not.toContain('p@ss');
    });
  });

  // -------------------------------------------------------------------------
  // Metadata redaction in JSON
  // -------------------------------------------------------------------------

  describe('metadata redaction', () => {
    it('redacts sensitive keys in JSON response', async () => {
      const selectFrom = vi.fn().mockImplementation((table: unknown) => {
        if (table === complianceAuditLogTableMock) {
          return makeChainableBuilder([
            makeAuditRow({
              id: 1,
              metadata: { requestId: 'safe', apiKey: 'secret-key' },
            }),
          ]);
        }
        return makeChainableBuilder([]);
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ selectFrom }));

      const req = new NextRequest('http://localhost:3000/api/v1/audit-trail?communityId=42');
      const res = await GET(req);
      const json = (await res.json()) as {
        data: Array<{ metadata: Record<string, unknown> }>;
      };

      expect(json.data[0].metadata['requestId']).toBe('safe');
      expect(json.data[0].metadata['apiKey']).toBe('[REDACTED]');
    });

    it('recursively redacts sensitive keys in nested objects', async () => {
      const selectFrom = vi.fn().mockImplementation((table: unknown) => {
        if (table === complianceAuditLogTableMock) {
          return makeChainableBuilder([
            makeAuditRow({
              id: 1,
              metadata: {
                requestId: 'req-1',
                nested: {
                  token: 'nested-secret',
                  safe: 'keep-me',
                  deep: { password: 'deep-secret', label: 'ok' },
                },
              },
            }),
          ]);
        }
        return makeChainableBuilder([]);
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ selectFrom }));

      const req = new NextRequest('http://localhost:3000/api/v1/audit-trail?communityId=42');
      const res = await GET(req);
      const json = (await res.json()) as {
        data: Array<{ metadata: Record<string, unknown> }>;
      };

      const meta = json.data[0].metadata as Record<string, unknown>;
      expect(meta['requestId']).toBe('req-1');
      const nested = meta['nested'] as Record<string, unknown>;
      expect(nested['token']).toBe('[REDACTED]');
      expect(nested['safe']).toBe('keep-me');
      const deep = nested['deep'] as Record<string, unknown>;
      expect(deep['password']).toBe('[REDACTED]');
      expect(deep['label']).toBe('ok');
    });

    it('recursively redacts sensitive keys in arrays', async () => {
      const selectFrom = vi.fn().mockImplementation((table: unknown) => {
        if (table === complianceAuditLogTableMock) {
          return makeChainableBuilder([
            makeAuditRow({
              id: 1,
              metadata: {
                items: [
                  { token: 'tok-1', label: 'a' },
                  { secret: 'sec-2', label: 'b' },
                ],
              },
            }),
          ]);
        }
        return makeChainableBuilder([]);
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ selectFrom }));

      const req = new NextRequest('http://localhost:3000/api/v1/audit-trail?communityId=42');
      const res = await GET(req);
      const json = (await res.json()) as {
        data: Array<{ metadata: Record<string, unknown> }>;
      };

      const meta = json.data[0].metadata as Record<string, unknown>;
      const items = meta['items'] as Array<Record<string, unknown>>;
      expect(items[0]['token']).toBe('[REDACTED]');
      expect(items[0]['label']).toBe('a');
      expect(items[1]['secret']).toBe('[REDACTED]');
      expect(items[1]['label']).toBe('b');
    });

    it('redacts sensitive keys in oldValues and newValues (flat)', async () => {
      const selectFrom = vi.fn().mockImplementation((table: unknown) => {
        if (table === complianceAuditLogTableMock) {
          return makeChainableBuilder([
            makeAuditRow({
              id: 1,
              oldValues: { token: 'old-secret', title: 'Old Title' },
              newValues: { token: 'new-secret', title: 'New Title' },
              metadata: null,
            }),
          ]);
        }
        return makeChainableBuilder([]);
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ selectFrom }));

      const req = new NextRequest('http://localhost:3000/api/v1/audit-trail?communityId=42');
      const res = await GET(req);
      const json = (await res.json()) as {
        data: Array<{
          oldValues: Record<string, unknown> | null;
          newValues: Record<string, unknown> | null;
        }>;
      };

      expect(json.data[0].oldValues?.['token']).toBe('[REDACTED]');
      expect(json.data[0].newValues?.['token']).toBe('[REDACTED]');
      expect(json.data[0].oldValues?.['title']).toBe('Old Title');
      expect(json.data[0].newValues?.['title']).toBe('New Title');
    });

    it('recursively redacts nested sensitive keys in oldValues and newValues', async () => {
      // Real-world scenario: a settings update where config contains an API key
      const selectFrom = vi.fn().mockImplementation((table: unknown) => {
        if (table === complianceAuditLogTableMock) {
          return makeChainableBuilder([
            makeAuditRow({
              id: 1,
              oldValues: {
                config: { apiKey: 'old-api-key', webhookUrl: 'https://old.example.com' },
                name: 'Old Name',
              },
              newValues: {
                config: { apiKey: 'new-api-key', webhookUrl: 'https://new.example.com' },
                name: 'New Name',
              },
              metadata: null,
            }),
          ]);
        }
        return makeChainableBuilder([]);
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ selectFrom }));

      const req = new NextRequest('http://localhost:3000/api/v1/audit-trail?communityId=42');
      const res = await GET(req);
      const json = (await res.json()) as {
        data: Array<{
          oldValues: Record<string, unknown> | null;
          newValues: Record<string, unknown> | null;
        }>;
      };

      const oldConfig = (json.data[0].oldValues?.['config'] as Record<string, unknown>);
      const newConfig = (json.data[0].newValues?.['config'] as Record<string, unknown>);

      // Nested apiKey must be redacted
      expect(oldConfig['apiKey']).toBe('[REDACTED]');
      expect(newConfig['apiKey']).toBe('[REDACTED]');

      // Non-sensitive nested keys preserved
      expect(oldConfig['webhookUrl']).toBe('https://old.example.com');
      expect(newConfig['webhookUrl']).toBe('https://new.example.com');

      // Top-level non-sensitive keys preserved
      expect(json.data[0].oldValues?.['name']).toBe('Old Name');
      expect(json.data[0].newValues?.['name']).toBe('New Name');
    });

    it('handles null oldValues and newValues without throwing', async () => {
      // Common case: a "create" audit event has null oldValues
      const selectFrom = vi.fn().mockImplementation((table: unknown) => {
        if (table === complianceAuditLogTableMock) {
          return makeChainableBuilder([
            makeAuditRow({
              id: 1,
              oldValues: null,
              newValues: { title: 'Created Document' },
              metadata: null,
            }),
          ]);
        }
        return makeChainableBuilder([]);
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ selectFrom }));

      const req = new NextRequest('http://localhost:3000/api/v1/audit-trail?communityId=42');
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = (await res.json()) as {
        data: Array<{
          oldValues: Record<string, unknown> | null;
          newValues: Record<string, unknown> | null;
        }>;
      };

      expect(json.data[0].oldValues).toBeNull();
      expect(json.data[0].newValues).toEqual({ title: 'Created Document' });
    });

    it('redacts case-insensitive key variants (Authorization, COOKIE, SignedUrl)', async () => {
      const selectFrom = vi.fn().mockImplementation((table: unknown) => {
        if (table === complianceAuditLogTableMock) {
          return makeChainableBuilder([
            makeAuditRow({
              id: 1,
              metadata: {
                Authorization: 'Bearer xyz',
                COOKIE: 'session=abc',
                SignedUrl: 'https://s3.example.com/file?sig=xxx',
                safe: 'visible',
              },
            }),
          ]);
        }
        return makeChainableBuilder([]);
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ selectFrom }));

      const req = new NextRequest('http://localhost:3000/api/v1/audit-trail?communityId=42');
      const res = await GET(req);
      const json = (await res.json()) as {
        data: Array<{ metadata: Record<string, unknown> }>;
      };

      const meta = json.data[0].metadata as Record<string, unknown>;
      expect(meta['Authorization']).toBe('[REDACTED]');
      expect(meta['COOKIE']).toBe('[REDACTED]');
      expect(meta['SignedUrl']).toBe('[REDACTED]');
      expect(meta['safe']).toBe('visible');
    });
  });

  // -------------------------------------------------------------------------
  // Pagination validation
  // -------------------------------------------------------------------------

  describe('pagination validation', () => {
    it('returns 400 for negative limit', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/audit-trail?communityId=42&limit=-1',
      );
      const res = await GET(req);
      expect(res.status).toBe(400);
    });

    it('returns 400 for zero limit', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/audit-trail?communityId=42&limit=0',
      );
      const res = await GET(req);
      expect(res.status).toBe(400);
    });

    it('returns 400 for non-numeric limit', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/audit-trail?communityId=42&limit=abc',
      );
      const res = await GET(req);
      expect(res.status).toBe(400);
    });

    it('returns 400 for limit exceeding MAX_PAGE_SIZE', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/audit-trail?communityId=42&limit=201',
      );
      const res = await GET(req);
      expect(res.status).toBe(400);
    });

    it('returns 200 for valid limit within bounds', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/audit-trail?communityId=42&limit=10',
      );
      const res = await GET(req);
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid cursor', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/audit-trail?communityId=42&cursor=not-valid-base64-json',
      );
      const res = await GET(req);
      expect(res.status).toBe(400);
    });

    it('returns 400 for semantically invalid decoded cursor payload', async () => {
      const badCursor = Buffer.from(
        JSON.stringify({ createdAt: 'not-a-date', id: 'oops' }),
      ).toString('base64');
      const req = new NextRequest(
        `http://localhost:3000/api/v1/audit-trail?communityId=42&cursor=${encodeURIComponent(badCursor)}`,
      );
      const res = await GET(req);
      expect(res.status).toBe(400);
    });
  });
});
