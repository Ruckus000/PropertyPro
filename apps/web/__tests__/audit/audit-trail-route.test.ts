/**
 * Unit tests for audit trail API route (P3-53).
 *
 * Tests cover:
 * - Admin role gate: owner/tenant denied (403)
 * - Filters: action, date range, userId — passed through to paginate() as `where`
 * - Cursor-based pagination via the canonical `paginate()` helper (Plan B3)
 * - CSV export with formula-injection sanitization (kept on its own MAX_CSV_ROWS path)
 * - Metadata redaction for sensitive keys
 * - Read-only: no mutation routes
 *
 * Mocking approach: the JSON path mocks `paginate()` directly (matching the
 * document-categories pilot pattern). The CSV path still mocks `selectFrom`
 * because the helper isn't used there.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  paginateMock,
  createScopedClientMock,
  complianceAuditLogTableMock,
  userRolesTableMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
} = vi.hoisted(() => ({
  paginateMock: vi.fn(),
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
  paginate: paginateMock,
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

// resolve-users imports from @propertypro/db/unsafe which initializes drizzle.
// Stub it here so the unit test doesn't require DATABASE_URL.
vi.mock('@/lib/utils/resolve-users', () => ({
  resolveUserDisplayNames: vi.fn().mockResolvedValue(new Map<string, string>()),
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

/** Default `paginate()` result: 3 rows in DESC id order, no more pages. */
function makeDefaultPaginateResult() {
  return {
    data: [
      makeAuditRow({ id: 3, createdAt: new Date('2026-02-22T10:00:00Z') }),
      makeAuditRow({ id: 2, createdAt: new Date('2026-02-21T08:00:00Z') }),
      makeAuditRow({ id: 1, createdAt: new Date('2026-02-20T12:00:00Z') }),
    ],
    pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
  };
}

function makeChainableBuilder(rows: unknown[]) {
  let currentRows = [...rows];
  const builder: Record<string, unknown> = {};
  builder.orderBy = vi.fn().mockImplementation(() => {
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
    const limited = currentRows.slice(0, n);
    const thenable: Record<string, unknown> = { ...builder };
    thenable.then = (resolve: (v: unknown) => unknown) => Promise.resolve(limited).then(resolve);
    return thenable;
  });
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(currentRows).then(resolve);
  return builder;
}

function makeDefaultScopedClient(overrides: Record<string, unknown> = {}) {
  // CSV path uses selectFrom directly; JSON path uses paginate() (mocked separately).
  const defaultAuditRows = [
    makeAuditRow({ id: 3, createdAt: new Date('2026-02-22T10:00:00Z') }),
    makeAuditRow({ id: 2, createdAt: new Date('2026-02-21T08:00:00Z') }),
    makeAuditRow({ id: 1, createdAt: new Date('2026-02-20T12:00:00Z') }),
  ];

  const query = vi.fn().mockResolvedValue([]);
  const selectFrom = vi.fn().mockImplementation((table: unknown) => {
    if (table === complianceAuditLogTableMock) return makeChainableBuilder(defaultAuditRows);
    return makeChainableBuilder([]);
  });

  return {
    query,
    selectFrom,
    ...overrides,
  };
}

const ADMIN_MEMBERSHIP = {
  userId: 'session-user-1',
  communityId: 42,
  role: 'manager',
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board President',
  presetKey: 'board_president',
  permissions: {
    resources: {
      audit: { read: true, write: true },
    },
  },
  communityType: 'condo_718',
};

interface JsonEnvelope {
  data: {
    data: Array<Record<string, unknown>>;
    pagination: { nextCursor: string | null; hasMore: boolean; pageSize: number };
    users: Record<string, string>;
  };
}

describe('p3-53 audit trail route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('session-user-1');
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    createScopedClientMock.mockReturnValue(makeDefaultScopedClient());
    paginateMock.mockResolvedValue(makeDefaultPaginateResult());
  });

  // -------------------------------------------------------------------------
  // Admin role gate
  // -------------------------------------------------------------------------

  describe('admin role gate', () => {
    it('returns 403 for owner role', async () => {
      requireCommunityMembershipMock.mockResolvedValue({
        userId: 'session-user-1',
        communityId: 42,
        role: 'resident',
        isAdmin: false,
        isUnitOwner: true,
        displayTitle: 'Owner',
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
        role: 'resident',
        isAdmin: false,
        isUnitOwner: false,
        displayTitle: 'Tenant',
        communityType: 'condo_718',
      });

      const req = new NextRequest('http://localhost:3000/api/v1/audit-trail?communityId=42');
      const res = await GET(req);
      expect(res.status).toBe(403);
    });

    it('returns 200 for admin roles', async () => {
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
  // JSON path — paginate() integration
  // -------------------------------------------------------------------------

  describe('paginate() integration', () => {
    it('returns rows in the order paginate() returns them', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/audit-trail?communityId=42');
      const res = await GET(req);
      const json = (await res.json()) as JsonEnvelope;

      expect(res.status).toBe(200);
      expect(json.data.data.map((r) => r['id'])).toEqual([3, 2, 1]);
      expect(json.data.pagination).toEqual({ nextCursor: null, hasMore: false, pageSize: 50 });
      expect(paginateMock).toHaveBeenCalledTimes(1);
    });

    it('forwards cursor and pageSize to paginate()', async () => {
      paginateMock.mockResolvedValueOnce({
        data: [makeAuditRow({ id: 5 })],
        pagination: { nextCursor: 'opaque-next', hasMore: true, pageSize: 25 },
      });

      const req = new NextRequest(
        'http://localhost:3000/api/v1/audit-trail?communityId=42&limit=25&cursor=abc',
      );
      const res = await GET(req);
      const json = (await res.json()) as JsonEnvelope;

      expect(res.status).toBe(200);
      const [, , input] = paginateMock.mock.calls[0] as [unknown, unknown, { cursor?: string; pageSize?: number }];
      expect(input).toEqual({ cursor: 'abc', pageSize: 25 });
      expect(json.data.pagination).toEqual({ nextCursor: 'opaque-next', hasMore: true, pageSize: 25 });
    });

    it('passes the combined where predicate as the 4th paginate() arg', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/audit-trail?communityId=42&action=update&userId=user-b&startDate=2026-02-20&endDate=2026-02-21',
      );
      const res = await GET(req);
      expect(res.status).toBe(200);

      const call = paginateMock.mock.calls[0] as [unknown, unknown, unknown, { where?: unknown } | undefined];
      expect(call[3]?.where).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // CSV export (unchanged path; uses selectFrom directly)
  // -------------------------------------------------------------------------

  describe('CSV export', () => {
    it('returns CSV content-type with format=csv', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/audit-trail?communityId=42&format=csv');
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

      const req = new NextRequest('http://localhost:3000/api/v1/audit-trail?communityId=42&format=csv');
      const res = await GET(req);
      const csvText = await res.text();

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

      const req = new NextRequest('http://localhost:3000/api/v1/audit-trail?communityId=42&format=csv');
      const res = await GET(req);
      const csvText = await res.text();

      const lines = csvText.split('\r\n').filter(Boolean);
      expect(lines.length).toBe(10_001);
      expect(lines[0]).toContain('ID');
      expect(res.headers.get('x-csv-truncated')).toBe('true');
      expect(res.headers.get('x-csv-max-rows')).toBe('10000');
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

      const req = new NextRequest('http://localhost:3000/api/v1/audit-trail?communityId=42&format=csv');
      const res = await GET(req);
      const csvText = await res.text();
      const lines = csvText.split('\r\n').filter(Boolean);

      expect(lines.length).toBe(10_000);
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

      const req = new NextRequest('http://localhost:3000/api/v1/audit-trail?communityId=42&format=csv');
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
      paginateMock.mockResolvedValueOnce({
        data: [
          makeAuditRow({
            id: 1,
            metadata: { requestId: 'safe', apiKey: 'secret-key' },
          }),
        ],
        pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
      });

      const req = new NextRequest('http://localhost:3000/api/v1/audit-trail?communityId=42');
      const res = await GET(req);
      const json = (await res.json()) as JsonEnvelope;

      const meta = json.data.data[0]['metadata'] as Record<string, unknown>;
      expect(meta['requestId']).toBe('safe');
      expect(meta['apiKey']).toBe('[REDACTED]');
    });

    it('recursively redacts sensitive keys in nested objects', async () => {
      paginateMock.mockResolvedValueOnce({
        data: [
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
        ],
        pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
      });

      const req = new NextRequest('http://localhost:3000/api/v1/audit-trail?communityId=42');
      const res = await GET(req);
      const json = (await res.json()) as JsonEnvelope;

      const meta = json.data.data[0]['metadata'] as Record<string, unknown>;
      expect(meta['requestId']).toBe('req-1');
      const nested = meta['nested'] as Record<string, unknown>;
      expect(nested['token']).toBe('[REDACTED]');
      expect(nested['safe']).toBe('keep-me');
      const deep = nested['deep'] as Record<string, unknown>;
      expect(deep['password']).toBe('[REDACTED]');
      expect(deep['label']).toBe('ok');
    });

    it('recursively redacts sensitive keys in arrays', async () => {
      paginateMock.mockResolvedValueOnce({
        data: [
          makeAuditRow({
            id: 1,
            metadata: {
              items: [
                { token: 'tok-1', label: 'a' },
                { secret: 'sec-2', label: 'b' },
              ],
            },
          }),
        ],
        pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
      });

      const req = new NextRequest('http://localhost:3000/api/v1/audit-trail?communityId=42');
      const res = await GET(req);
      const json = (await res.json()) as JsonEnvelope;

      const meta = json.data.data[0]['metadata'] as Record<string, unknown>;
      const items = meta['items'] as Array<Record<string, unknown>>;
      expect(items[0]['token']).toBe('[REDACTED]');
      expect(items[0]['label']).toBe('a');
      expect(items[1]['secret']).toBe('[REDACTED]');
      expect(items[1]['label']).toBe('b');
    });

    it('redacts sensitive keys in oldValues and newValues', async () => {
      paginateMock.mockResolvedValueOnce({
        data: [
          makeAuditRow({
            id: 1,
            oldValues: { token: 'old-secret', title: 'Old Title' },
            newValues: { token: 'new-secret', title: 'New Title' },
            metadata: null,
          }),
        ],
        pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
      });

      const req = new NextRequest('http://localhost:3000/api/v1/audit-trail?communityId=42');
      const res = await GET(req);
      const json = (await res.json()) as JsonEnvelope;

      const oldVals = json.data.data[0]['oldValues'] as Record<string, unknown>;
      const newVals = json.data.data[0]['newValues'] as Record<string, unknown>;
      expect(oldVals['token']).toBe('[REDACTED]');
      expect(newVals['token']).toBe('[REDACTED]');
      expect(oldVals['title']).toBe('Old Title');
      expect(newVals['title']).toBe('New Title');
    });

    it('handles null oldValues and newValues without throwing', async () => {
      paginateMock.mockResolvedValueOnce({
        data: [
          makeAuditRow({
            id: 1,
            oldValues: null,
            newValues: { title: 'Created Document' },
            metadata: null,
          }),
        ],
        pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
      });

      const req = new NextRequest('http://localhost:3000/api/v1/audit-trail?communityId=42');
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = (await res.json()) as JsonEnvelope;

      expect(json.data.data[0]['oldValues']).toBeNull();
      expect(json.data.data[0]['newValues']).toEqual({ title: 'Created Document' });
    });

    it('redacts case-insensitive key variants (Authorization, COOKIE, SignedUrl)', async () => {
      paginateMock.mockResolvedValueOnce({
        data: [
          makeAuditRow({
            id: 1,
            metadata: {
              Authorization: 'Bearer xyz',
              COOKIE: 'session=abc',
              SignedUrl: 'https://s3.example.com/file?sig=xxx',
              safe: 'visible',
            },
          }),
        ],
        pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
      });

      const req = new NextRequest('http://localhost:3000/api/v1/audit-trail?communityId=42');
      const res = await GET(req);
      const json = (await res.json()) as JsonEnvelope;

      const meta = json.data.data[0]['metadata'] as Record<string, unknown>;
      expect(meta['Authorization']).toBe('[REDACTED]');
      expect(meta['COOKIE']).toBe('[REDACTED]');
      expect(meta['SignedUrl']).toBe('[REDACTED]');
      expect(meta['safe']).toBe('visible');
    });
  });

  // -------------------------------------------------------------------------
  // Limit validation (route enforces positive int; paginate() clamps upper bound)
  // -------------------------------------------------------------------------

  describe('limit validation', () => {
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

    it('returns 200 for limit exceeding paginate MAX_PAGE_SIZE (silent clamp)', async () => {
      // paginate() clamps pageSize to MAX_PAGE_SIZE silently; the route does
      // not 400 on oversize values. This is a behavioral change from the
      // previous custom impl that 400'd at >200.
      const req = new NextRequest(
        'http://localhost:3000/api/v1/audit-trail?communityId=42&limit=999',
      );
      const res = await GET(req);
      expect(res.status).toBe(200);
    });

    it('returns 200 for valid limit within bounds', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/audit-trail?communityId=42&limit=10',
      );
      const res = await GET(req);
      expect(res.status).toBe(200);
    });

    it('treats empty-string params as missing (regression: ?cursor= and ?limit= must not 400)', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/audit-trail?communityId=42&cursor=&limit=',
      );
      const res = await GET(req);
      expect(res.status).toBe(200);
    });

    it('returns 200 for malformed cursor (paginate silently treats as first page)', async () => {
      // paginate() is intentionally permissive: stale/malformed cursors from
      // old clients fall back to "first page" rather than 400. This is a
      // behavioral change from the previous custom impl that 400'd.
      const req = new NextRequest(
        'http://localhost:3000/api/v1/audit-trail?communityId=42&cursor=not-valid-base64',
      );
      const res = await GET(req);
      expect(res.status).toBe(200);
    });
  });
});
