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

function makeDefaultScopedClient(overrides: Record<string, unknown> = {}) {
  const query = vi.fn().mockImplementation(async (table: unknown) => {
    if (table === complianceAuditLogTableMock) {
      return [
        makeAuditRow({ id: 3, createdAt: new Date('2026-02-22T10:00:00Z') }),
        makeAuditRow({ id: 1, createdAt: new Date('2026-02-20T12:00:00Z') }),
        makeAuditRow({ id: 2, createdAt: new Date('2026-02-21T08:00:00Z') }),
      ];
    }
    if (table === userRolesTableMock) {
      return [{ userId: 'user-abc', role: 'board_president', communityId: 42 }];
    }
    return [];
  });

  return {
    query,
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
      role: 'board_president',
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
        role: 'owner',
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
        role: 'tenant',
        communityType: 'condo_718',
      });

      const req = new NextRequest('http://localhost:3000/api/v1/audit-trail?communityId=42');
      const res = await GET(req);
      expect(res.status).toBe(403);
    });

    it.each([
      'board_member',
      'board_president',
      'cam',
      'site_manager',
      'property_manager_admin',
    ] as const)('returns 200 for %s role', async (role) => {
      requireCommunityMembershipMock.mockResolvedValue({
        userId: 'session-user-1',
        communityId: 42,
        role,
        communityType: 'condo_718',
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
      const query = vi.fn().mockImplementation(async (table: unknown) => {
        if (table === complianceAuditLogTableMock) {
          return [
            makeAuditRow({ id: 1, action: 'create' }),
            makeAuditRow({ id: 2, action: 'update' }),
            makeAuditRow({ id: 3, action: 'delete' }),
          ];
        }
        if (table === userRolesTableMock) return [];
        return [];
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ query }));

      const req = new NextRequest(
        'http://localhost:3000/api/v1/audit-trail?communityId=42&action=update',
      );
      const res = await GET(req);
      const json = (await res.json()) as { data: Array<{ action: string }> };

      expect(json.data).toHaveLength(1);
      expect(json.data[0].action).toBe('update');
    });

    it('filters by userId', async () => {
      const query = vi.fn().mockImplementation(async (table: unknown) => {
        if (table === complianceAuditLogTableMock) {
          return [
            makeAuditRow({ id: 1, userId: 'user-a' }),
            makeAuditRow({ id: 2, userId: 'user-b' }),
          ];
        }
        if (table === userRolesTableMock) return [];
        return [];
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ query }));

      const req = new NextRequest(
        'http://localhost:3000/api/v1/audit-trail?communityId=42&userId=user-b',
      );
      const res = await GET(req);
      const json = (await res.json()) as { data: Array<{ userId: string }> };

      expect(json.data).toHaveLength(1);
      expect(json.data[0].userId).toBe('user-b');
    });

    it('filters by date range', async () => {
      const query = vi.fn().mockImplementation(async (table: unknown) => {
        if (table === complianceAuditLogTableMock) {
          return [
            makeAuditRow({ id: 1, createdAt: new Date('2026-02-19T12:00:00Z') }),
            makeAuditRow({ id: 2, createdAt: new Date('2026-02-20T12:00:00Z') }),
            makeAuditRow({ id: 3, createdAt: new Date('2026-02-22T12:00:00Z') }),
          ];
        }
        if (table === userRolesTableMock) return [];
        return [];
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ query }));

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
      const query = vi.fn().mockImplementation(async (table: unknown) => {
        if (table === complianceAuditLogTableMock) return rows;
        if (table === userRolesTableMock) return [];
        return [];
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ query }));

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
      const query = vi.fn().mockImplementation(async (table: unknown) => {
        if (table === complianceAuditLogTableMock) {
          return [
            makeAuditRow({
              id: 1,
              action: '=CMD()',
              resourceType: '+evil',
              resourceId: '@malicious',
            }),
          ];
        }
        if (table === userRolesTableMock) return [];
        return [];
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ query }));

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

    it('redacts sensitive metadata keys in CSV', async () => {
      const query = vi.fn().mockImplementation(async (table: unknown) => {
        if (table === complianceAuditLogTableMock) {
          return [
            makeAuditRow({
              id: 1,
              metadata: { requestId: 'req-1', token: 'secret-token-123', password: 'p@ss' },
            }),
          ];
        }
        if (table === userRolesTableMock) return [];
        return [];
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ query }));

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
      const query = vi.fn().mockImplementation(async (table: unknown) => {
        if (table === complianceAuditLogTableMock) {
          return [
            makeAuditRow({
              id: 1,
              metadata: { requestId: 'safe', apiKey: 'secret-key' },
            }),
          ];
        }
        if (table === userRolesTableMock) return [];
        return [];
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ query }));

      const req = new NextRequest('http://localhost:3000/api/v1/audit-trail?communityId=42');
      const res = await GET(req);
      const json = (await res.json()) as {
        data: Array<{ metadata: Record<string, unknown> }>;
      };

      expect(json.data[0].metadata['requestId']).toBe('safe');
      expect(json.data[0].metadata['apiKey']).toBe('[REDACTED]');
    });

    it('recursively redacts sensitive keys in nested objects', async () => {
      const query = vi.fn().mockImplementation(async (table: unknown) => {
        if (table === complianceAuditLogTableMock) {
          return [
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
          ];
        }
        if (table === userRolesTableMock) return [];
        return [];
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ query }));

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
      const query = vi.fn().mockImplementation(async (table: unknown) => {
        if (table === complianceAuditLogTableMock) {
          return [
            makeAuditRow({
              id: 1,
              metadata: {
                items: [
                  { token: 'tok-1', label: 'a' },
                  { secret: 'sec-2', label: 'b' },
                ],
              },
            }),
          ];
        }
        if (table === userRolesTableMock) return [];
        return [];
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ query }));

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

    it('redacts case-insensitive key variants (Authorization, COOKIE, SignedUrl)', async () => {
      const query = vi.fn().mockImplementation(async (table: unknown) => {
        if (table === complianceAuditLogTableMock) {
          return [
            makeAuditRow({
              id: 1,
              metadata: {
                Authorization: 'Bearer xyz',
                COOKIE: 'session=abc',
                SignedUrl: 'https://s3.example.com/file?sig=xxx',
                safe: 'visible',
              },
            }),
          ];
        }
        if (table === userRolesTableMock) return [];
        return [];
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ query }));

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
  });
});
