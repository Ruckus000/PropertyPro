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
const logAdminAction = vi.fn(async () => {});
vi.mock('@/lib/audit/log-admin-action', () => ({
  logAdminAction: (...args: unknown[]) => logAdminAction(...args),
  AdminAuditLogError: class AdminAuditLogError extends Error {},
}));

interface ChainStubs {
  community?: { data: unknown; error: unknown };
  pack?: { data: unknown; error: unknown };
  snapshotUpdate?: { data: unknown; error: unknown };
  insertResult?: { data: unknown; error: unknown };
  auditInsert?: { data: unknown; error: unknown };
  /** Phase 11b — the home-page lookup the route uses to stamp `page_id`. */
  homePage?: { data: unknown; error: unknown };
}

/**
 * Builds a typed-client double whose .from(table) returns a chain shaped
 * to satisfy each route step. Order-dependent: the route calls .from()
 * exactly once per table, in this sequence: communities → site_starter_packs
 * → site_blocks (snapshot update) → site_pages (home-page lookup) → site_blocks
 * (insert) → compliance_audit_log.
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
        if (table === 'site_starter_packs') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue(stubs.pack ?? { data: null, error: { message: 'unset' } }),
              })),
            })),
          };
        }
        if (table === 'site_blocks') {
          // First .from('site_blocks') call is the snapshot UPDATE; second is INSERT.
          const callsForTable = calls.filter((t) => t === table).length;
          if (callsForTable === 1) {
            // Snapshot UPDATE chain
            return {
              update: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    is: vi.fn(() => ({
                      select: vi.fn().mockResolvedValue(
                        stubs.snapshotUpdate ?? { data: [], error: null },
                      ),
                    })),
                  })),
                })),
              })),
            };
          }
          // INSERT chain
          return {
            insert: vi.fn().mockResolvedValue(stubs.insertResult ?? { data: null, error: null }),
          };
        }
        if (table === 'site_pages') {
          // Phase 11b — the route resolves the community's home page so the
          // blocks it inserts carry a `page_id`. Refuses with 409 when there
          // isn't one; `stubs.homePage` lets a test drive that.
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  is: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue(
                      stubs.homePage ?? { data: { id: 55 }, error: null },
                    ),
                  })),
                })),
              })),
            })),
          };
        }
        if (table === 'compliance_audit_log') {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue(
                  stubs.auditInsert ?? {
                    data: { id: 1000, created_at: '2026-05-28T00:00:00Z' },
                    error: null,
                  },
                ),
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
  starterPackSlug: 'florida-condo-v1',
  confirmCommunitySlug: 'sunset-condos',
};

function makeRequest(body: unknown): Request {
  return new Request(
    'http://localhost/api/admin/site-templates/communities/42/reset-to-starter',
    {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    },
  );
}

async function importHandler() {
  return import(
    '../../src/app/api/admin/site-templates/communities/[id]/reset-to-starter/route'
  );
}

describe('POST /api/admin/site-templates/communities/[id]/reset-to-starter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePlatformAdminMock.mockResolvedValue({ id: 'admin-1', email: 'a@x.test' });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('happy path: snapshots current rows, inserts pack blocks, writes audit log', async () => {
    const { client } = buildClient({
      community: { data: { id: 42, slug: 'sunset-condos', name: 'Sunset Condos', community_type: 'condo_718' }, error: null },
      pack: {
        data: {
          slug: 'florida-condo-v1',
          blocks: [
            { blockType: 'hero', blockOrder: 1, content: { headline: 'Welcome' } },
            { blockType: 'announcements', blockOrder: 2, content: { limit: 5 } },
          ],
          is_archived: false,
          community_type: 'condo_718',
        },
        error: null,
      },
      snapshotUpdate: { data: [{ id: 100 }, { id: 101 }], error: null },
      auditInsert: {
        data: { id: 2000, created_at: '2026-05-28T00:00:00Z' },
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
    expect(json.reset).toMatchObject({
      communityId: 42,
      starterPackSlug: 'florida-condo-v1',
      snapshotBlockIds: [100, 101],
      appliedBlockCount: 2,
      auditLogId: 2000,
      restoreWindowDays: 30,
    });
  });

  it('409s rather than inserting page-less blocks when the community has no home page', async () => {
    // Phase 11b: this route writes site_blocks with raw SQL, outside the service
    // that owns page lifecycle. A NULL `page_id` would be invisible to the
    // multi-page editor and would break 11c's `SET NOT NULL`, so it refuses
    // instead of inventing a page from the admin app.
    const { client } = buildClient({
      community: { data: { id: 42, slug: 'sunset-condos', name: 'Sunset Condos', community_type: 'condo_718' }, error: null },
      pack: {
        data: {
          slug: 'florida-condo-v1',
          blocks: [{ blockType: 'hero', blockOrder: 1, content: { headline: 'Welcome' } }],
          is_archived: false,
          community_type: 'condo_718',
        },
        error: null,
      },
      snapshotUpdate: { data: [], error: null },
      homePage: { data: null, error: null },
    });
    createAdminTypedClientMock.mockReturnValue(client);

    const { POST } = await importHandler();
    const res = await POST(
      makeRequest(VALID_BODY) as unknown as Parameters<typeof POST>[0],
      { params: Promise.resolve({ id: '42' }) },
    );
    expect(res.status).toBe(409);
  });

  it('400s when communityId path param is not a positive integer', async () => {
    createAdminTypedClientMock.mockReturnValue(buildClient({}).client);
    const { POST } = await importHandler();
    const res = await POST(
      makeRequest(VALID_BODY) as unknown as Parameters<typeof POST>[0],
      { params: Promise.resolve({ id: 'abc' }) },
    );
    expect(res.status).toBe(400);
  });

  it('400s when body is malformed JSON', async () => {
    createAdminTypedClientMock.mockReturnValue(buildClient({}).client);
    const { POST } = await importHandler();
    const badReq = new Request(
      'http://localhost/api/admin/site-templates/communities/42/reset-to-starter',
      { method: 'POST', body: '{not-json' },
    );
    const res = await POST(
      badReq as unknown as Parameters<typeof POST>[0],
      { params: Promise.resolve({ id: '42' }) },
    );
    expect(res.status).toBe(400);
  });

  it('400s when confirmCommunitySlug does not match', async () => {
    const { client } = buildClient({
      community: { data: { id: 42, slug: 'palm-shores', name: 'Palm' }, error: null },
    });
    createAdminTypedClientMock.mockReturnValue(client);
    const { POST } = await importHandler();
    const res = await POST(
      makeRequest(VALID_BODY) as unknown as Parameters<typeof POST>[0],
      { params: Promise.resolve({ id: '42' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/does not match/i);
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

  it('404s when starter pack does not exist', async () => {
    const { client } = buildClient({
      community: { data: { id: 42, slug: 'sunset-condos' }, error: null },
      pack: { data: null, error: { code: 'PGRST116', message: 'No rows' } },
    });
    createAdminTypedClientMock.mockReturnValue(client);
    const { POST } = await importHandler();
    const res = await POST(
      makeRequest(VALID_BODY) as unknown as Parameters<typeof POST>[0],
      { params: Promise.resolve({ id: '42' }) },
    );
    expect(res.status).toBe(404);
  });

  it('400s when starter pack is archived', async () => {
    const { client } = buildClient({
      community: { data: { id: 42, slug: 'sunset-condos' }, error: null },
      pack: { data: { slug: 'old', blocks: [], is_archived: true }, error: null },
    });
    createAdminTypedClientMock.mockReturnValue(client);
    const { POST } = await importHandler();
    const res = await POST(
      makeRequest(VALID_BODY) as unknown as Parameters<typeof POST>[0],
      { params: Promise.resolve({ id: '42' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/archived/i);
  });

  it('400s when the pack community_type does not match the community (no destructive write)', async () => {
    const { client, calls } = buildClient({
      community: { data: { id: 42, slug: 'sunset-condos', name: 'Sunset Condos', community_type: 'condo_718' }, error: null },
      pack: {
        data: {
          slug: 'apartment-v1',
          blocks: [{ blockType: 'hero', blockOrder: 1, content: { headline: 'Hi' } }],
          is_archived: false,
          community_type: 'apartment',
        },
        error: null,
      },
    });
    createAdminTypedClientMock.mockReturnValue(client);
    const { POST } = await importHandler();
    const res = await POST(
      makeRequest({ starterPackSlug: 'apartment-v1', confirmCommunitySlug: 'sunset-condos' }) as unknown as Parameters<typeof POST>[0],
      { params: Promise.resolve({ id: '42' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/community type/i);
    // The guard runs BEFORE any destructive op — no site_blocks snapshot/insert.
    expect(calls).not.toContain('site_blocks');
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
