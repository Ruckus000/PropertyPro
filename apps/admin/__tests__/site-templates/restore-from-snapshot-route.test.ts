import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError } from '@propertypro/shared/http';

const { requirePlatformAdminMock, createAdminTypedClientMock } = vi.hoisted(() => ({
  requirePlatformAdminMock: vi.fn(),
  createAdminTypedClientMock: vi.fn(),
}));

vi.mock('@/lib/auth/platform-admin', () => ({
  requirePlatformAdmin: requirePlatformAdminMock,
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminTypedClient: createAdminTypedClientMock,
}));


// Audit writes go through logAdminAction, which uses its OWN supabase client
// (createAdminClient) rather than the one these tests stub. Mock the helper so
// the route tests stay focused, and so the call itself can be asserted — the
// helper's own semantics are covered by __tests__/audit/log-admin-action.test.ts.
// Typed with a rest parameter so the `(...args) => logAdminAction(...args)`
// forwarder below type-checks and `.mock.calls[0]![0]` is indexable.
const logAdminAction = vi.fn(async (..._args: unknown[]) => {});
vi.mock('@/lib/audit/log-admin-action', () => ({
  logAdminAction: (...args: unknown[]) => logAdminAction(...args),
  AdminAuditLogError: class AdminAuditLogError extends Error {},
}));

interface ChainStubs {
  community?: { data: unknown; error: unknown };
  prior?: { data: unknown; error: unknown };
  retired?: { data: unknown; error: unknown };
  restored?: { data: unknown; error: unknown };
  auditInsert?: { data: unknown; error: unknown };
}

/**
 * .from() call sequence:
 *   communities → compliance_audit_log (READ prior)
 *   → site_blocks (UPDATE retire current) → site_blocks (UPDATE un-soft-delete snapshot)
 *   → compliance_audit_log (INSERT)
 */
function buildClient(stubs: ChainStubs) {
  const calls: string[] = [];
  return {
    calls,
    client: {
      from: vi.fn((table: string) => {
        calls.push(table);
        if (table === 'communities') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue(stubs.community ?? { data: null, error: { message: 'unset' } }),
              })),
            })),
          };
        }
        if (table === 'compliance_audit_log') {
          const callsForTable = calls.filter((t) => t === table).length;
          if (callsForTable === 1) {
            // First call is the SELECT (look up prior reset)
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue(stubs.prior ?? { data: null, error: { message: 'unset' } }),
                })),
              })),
            };
          }
          // Second call is the INSERT (write the restore audit entry)
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue(
                  stubs.auditInsert ?? {
                    data: { id: 3000, created_at: '2026-05-28T00:00:00Z' },
                    error: null,
                  },
                ),
              })),
            })),
          };
        }
        if (table === 'site_blocks') {
          const callsForTable = calls.filter((t) => t === table).length;
          if (callsForTable === 1) {
            // First .from('site_blocks') is the retire (soft-delete) update
            return {
              update: vi.fn(() => ({
                eq: vi.fn(() => ({
                  is: vi.fn(() => ({
                    select: vi.fn().mockResolvedValue(
                      stubs.retired ?? { data: [{ id: 200 }], error: null },
                    ),
                  })),
                })),
              })),
            };
          }
          // Second is the un-soft-delete update (snapshot restore)
          return {
            update: vi.fn(() => ({
              in: vi.fn(() => ({
                eq: vi.fn(() => ({
                  select: vi.fn().mockResolvedValue(
                    stubs.restored ?? { data: [{ id: 100 }, { id: 101 }], error: null },
                  ),
                })),
              })),
            })),
          };
        }
        throw new Error(`Unexpected .from(${table})`);
      }),
    },
  };
}

const VALID_BODY = {
  auditLogId: 1000,
  confirmCommunitySlug: 'sunset-condos',
};

function makeRequest(body: unknown): Request {
  return new Request(
    'http://localhost/api/admin/site-templates/communities/42/restore-from-snapshot',
    {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    },
  );
}

async function importHandler() {
  return import(
    '../../src/app/api/admin/site-templates/communities/[id]/restore-from-snapshot/route'
  );
}

describe('POST /api/admin/site-templates/communities/[id]/restore-from-snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePlatformAdminMock.mockResolvedValue({ id: 'admin-1', email: 'a@x.test' });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('happy path: restores snapshot rows and writes audit log', async () => {
    const { client } = buildClient({
      community: { data: { id: 42, slug: 'sunset-condos' }, error: null },
      prior: {
        data: {
          id: 1000,
          community_id: 42,
          action: 'site_reset_to_starter',
          metadata: { snapshotBlockIds: [100, 101] },
          created_at: new Date().toISOString(),
        },
        error: null,
      },
    });
    createAdminTypedClientMock.mockReturnValue(client);

    const { POST } = await importHandler();
    const res = await POST(
      makeRequest(VALID_BODY) as unknown as Parameters<typeof POST>[0],
      { params: Promise.resolve({ id: '42' }) },
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.restore).toMatchObject({
      communityId: 42,
      restoredFromAuditId: 1000,
      restoredBlockIds: [100, 101],
      retiredBlockCount: 1,
      auditLogId: 3000,
    });
  });

  it('400s when communityId path param is invalid', async () => {
    createAdminTypedClientMock.mockReturnValue(buildClient({}).client);
    const { POST } = await importHandler();
    const res = await POST(
      makeRequest(VALID_BODY) as unknown as Parameters<typeof POST>[0],
      { params: Promise.resolve({ id: 'xyz' }) },
    );
    expect(res.status).toBe(400);
  });

  it('404s when community does not exist', async () => {
    const { client } = buildClient({
      community: { data: null, error: { code: 'PGRST116', message: 'No rows' } },
    });
    createAdminTypedClientMock.mockReturnValue(client);
    const { POST } = await importHandler();
    const res = await POST(
      makeRequest(VALID_BODY) as unknown as Parameters<typeof POST>[0],
      { params: Promise.resolve({ id: '42' }) },
    );
    expect(res.status).toBe(404);
  });

  it('400s when confirmCommunitySlug does not match', async () => {
    const { client } = buildClient({
      community: { data: { id: 42, slug: 'wrong-slug' }, error: null },
    });
    createAdminTypedClientMock.mockReturnValue(client);
    const { POST } = await importHandler();
    const res = await POST(
      makeRequest(VALID_BODY) as unknown as Parameters<typeof POST>[0],
      { params: Promise.resolve({ id: '42' }) },
    );
    expect(res.status).toBe(400);
  });

  it('404s when prior audit entry not found', async () => {
    const { client } = buildClient({
      community: { data: { id: 42, slug: 'sunset-condos' }, error: null },
      prior: { data: null, error: { code: 'PGRST116', message: 'No rows' } },
    });
    createAdminTypedClientMock.mockReturnValue(client);
    const { POST } = await importHandler();
    const res = await POST(
      makeRequest(VALID_BODY) as unknown as Parameters<typeof POST>[0],
      { params: Promise.resolve({ id: '42' }) },
    );
    expect(res.status).toBe(404);
  });

  it('400s when audit entry belongs to a different community', async () => {
    const { client } = buildClient({
      community: { data: { id: 42, slug: 'sunset-condos' }, error: null },
      prior: {
        data: {
          id: 1000,
          community_id: 99, // wrong community
          action: 'site_reset_to_starter',
          metadata: { snapshotBlockIds: [1] },
          created_at: new Date().toISOString(),
        },
        error: null,
      },
    });
    createAdminTypedClientMock.mockReturnValue(client);
    const { POST } = await importHandler();
    const res = await POST(
      makeRequest(VALID_BODY) as unknown as Parameters<typeof POST>[0],
      { params: Promise.resolve({ id: '42' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/does not belong/i);
  });

  it('400s when audit entry is not a reset event', async () => {
    const { client } = buildClient({
      community: { data: { id: 42, slug: 'sunset-condos' }, error: null },
      prior: {
        data: {
          id: 1000,
          community_id: 42,
          action: 'site_publish',
          metadata: { snapshotBlockIds: [1] },
          created_at: new Date().toISOString(),
        },
        error: null,
      },
    });
    createAdminTypedClientMock.mockReturnValue(client);
    const { POST } = await importHandler();
    const res = await POST(
      makeRequest(VALID_BODY) as unknown as Parameters<typeof POST>[0],
      { params: Promise.resolve({ id: '42' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/not a reset/i);
  });

  it('410s when the audit entry is past the 30-day restore window', async () => {
    const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    const { client } = buildClient({
      community: { data: { id: 42, slug: 'sunset-condos' }, error: null },
      prior: {
        data: {
          id: 1000,
          community_id: 42,
          action: 'site_reset_to_starter',
          metadata: { snapshotBlockIds: [1] },
          created_at: oldDate,
        },
        error: null,
      },
    });
    createAdminTypedClientMock.mockReturnValue(client);
    const { POST } = await importHandler();
    const res = await POST(
      makeRequest(VALID_BODY) as unknown as Parameters<typeof POST>[0],
      { params: Promise.resolve({ id: '42' }) },
    );
    expect(res.status).toBe(410);
    expect((await res.json()).error.message).toMatch(/restore window/i);
  });

  it('400s when the audit entry has no snapshotBlockIds metadata', async () => {
    const { client } = buildClient({
      community: { data: { id: 42, slug: 'sunset-condos' }, error: null },
      prior: {
        data: {
          id: 1000,
          community_id: 42,
          action: 'site_reset_to_starter',
          metadata: {},
          created_at: new Date().toISOString(),
        },
        error: null,
      },
    });
    createAdminTypedClientMock.mockReturnValue(client);
    const { POST } = await importHandler();
    const res = await POST(
      makeRequest(VALID_BODY) as unknown as Parameters<typeof POST>[0],
      { params: Promise.resolve({ id: '42' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/no snapshot/i);
  });

  it('returns 403 when requirePlatformAdmin rejects', async () => {
    requirePlatformAdminMock.mockRejectedValueOnce(new ForbiddenError('Platform admin access required'));
    const { POST } = await importHandler();
    await expect(
      POST(
        makeRequest(VALID_BODY) as unknown as Parameters<typeof POST>[0],
        { params: Promise.resolve({ id: '42' }) },
      ),
    ).resolves.toHaveProperty('status', 403);
  });
});
