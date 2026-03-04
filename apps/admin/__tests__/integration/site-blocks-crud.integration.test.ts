/**
 * Site blocks CRUD integration tests.
 *
 * Verifies the full request → DB → response cycle for:
 *   1. POST /api/admin/site-blocks — create draft block
 *   2. GET  /api/admin/site-blocks — list blocks
 *   3. PUT  /api/admin/site-blocks/:id — update content and order
 *   4. DELETE /api/admin/site-blocks/:id — soft-delete
 *   5. POST /api/admin/site-blocks/publish — publish drafts
 *   6. POST /api/admin/site-blocks/discard — discard drafts
 *   7. Validation errors (missing params, invalid content)
 *
 * Requires DATABASE_URL + Supabase env vars via scripts/with-env-local.sh
 */
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

// ---------------------------------------------------------------------------
// Environment helpers
// ---------------------------------------------------------------------------

function requireEnvVarInCI(name: string): void {
  if (process.env.CI && !process.env[name]) {
    throw new Error(`${name} is required in CI for site-blocks integration tests`);
  }
}

requireEnvVarInCI('DATABASE_URL');
requireEnvVarInCI('NEXT_PUBLIC_SUPABASE_URL');
requireEnvVarInCI('SUPABASE_SERVICE_ROLE_KEY');

const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Mocks — must be before route imports
// ---------------------------------------------------------------------------

const { requirePlatformAdminMock } = vi.hoisted(() => ({
  requirePlatformAdminMock: vi.fn().mockResolvedValue({
    id: 'mock-admin-id',
    email: 'admin@test.com',
    role: 'super_admin' as const,
  }),
}));

vi.mock('@/lib/auth/platform-admin', () => ({
  requirePlatformAdmin: requirePlatformAdminMock,
}));

// ---------------------------------------------------------------------------
// Route types (dynamically imported after mocks)
// ---------------------------------------------------------------------------

type SiteBlocksRoute = typeof import('../../src/app/api/admin/site-blocks/route');
type SiteBlockIdRoute = typeof import('../../src/app/api/admin/site-blocks/[id]/route');
type PublishRoute = typeof import('../../src/app/api/admin/site-blocks/publish/route');
type DiscardRoute = typeof import('../../src/app/api/admin/site-blocks/discard/route');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE = 'http://localhost:3001';

function jsonReq(
  path: string,
  method: 'POST' | 'PUT' | 'DELETE',
  body: Record<string, unknown>,
): NextRequest {
  return new NextRequest(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function parseJson<T>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let sqlClient: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;
let communityId: number;
const runSuffix = randomUUID().slice(0, 8);

let blocksRoute: SiteBlocksRoute;
let blockIdRoute: SiteBlockIdRoute;
let publishRoute: PublishRoute;
let discardRoute: DiscardRoute;

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describeDb('site-blocks CRUD (db-backed integration)', () => {
  let createdBlockId: number;

  beforeAll(async () => {
    // DB connection for seed / teardown
    sqlClient = postgres(process.env.DATABASE_URL!, { prepare: false });
    db = drizzle(sqlClient);

    // Seed a test community directly via SQL
    const dbModule = await import('@propertypro/db');
    const [inserted] = await db
      .insert(dbModule.communities)
      .values({
        name: `SiteBlocksTest ${runSuffix}`,
        slug: `sb-test-${runSuffix}`,
        communityType: 'condo_718',
        timezone: 'America/New_York',
      })
      .returning({ id: dbModule.communities.id });

    if (!inserted) throw new Error('Failed to seed test community');
    communityId = inserted.id;

    // Import routes after mocks are installed
    blocksRoute = await import('../../src/app/api/admin/site-blocks/route');
    blockIdRoute = await import('../../src/app/api/admin/site-blocks/[id]/route');
    publishRoute = await import('../../src/app/api/admin/site-blocks/publish/route');
    discardRoute = await import('../../src/app/api/admin/site-blocks/discard/route');
  });

  beforeEach(() => {
    vi.clearAllMocks();
    requirePlatformAdminMock.mockResolvedValue({
      id: 'mock-admin-id',
      email: 'admin@test.com',
      role: 'super_admin' as const,
    });
  });

  afterAll(async () => {
    // Cascade-delete test community (takes site_blocks with it)
    try {
      const dbModule = await import('@propertypro/db');
      await db
        .delete(dbModule.communities)
        .where(eq(dbModule.communities.id, communityId));
    } catch {
      // Best-effort
    } finally {
      await sqlClient.end();
    }
  });

  // =========================================================================
  // 1. Create block
  // =========================================================================

  it('POST creates a draft block with 201', async () => {
    const res = await blocksRoute.POST(
      jsonReq('/api/admin/site-blocks', 'POST', {
        communityId,
        blockType: 'text',
        content: { body: `Hello ${runSuffix}` },
      }),
    );

    expect(res.status).toBe(201);
    const json = await parseJson<{ data: Record<string, unknown> }>(res);
    expect(json.data['block_type']).toBe('text');
    expect(json.data['is_draft']).toBe(true);
    expect((json.data['content'] as Record<string, unknown>)['body']).toBe(`Hello ${runSuffix}`);
    createdBlockId = Number(json.data['id']);
    expect(Number.isFinite(createdBlockId)).toBe(true);
  });

  // =========================================================================
  // 2. List blocks
  // =========================================================================

  it('GET lists blocks for community', async () => {
    const res = await blocksRoute.GET(
      new NextRequest(`${BASE}/api/admin/site-blocks?communityId=${communityId}`),
    );

    expect(res.status).toBe(200);
    const json = await parseJson<{ data: Array<Record<string, unknown>> }>(res);
    expect(json.data.length).toBeGreaterThanOrEqual(1);

    const found = json.data.find((b) => Number(b['id']) === createdBlockId);
    expect(found).toBeDefined();
    expect(found!['block_type']).toBe('text');
  });

  // =========================================================================
  // 3a. Update block content
  // =========================================================================

  it('PUT updates block content', async () => {
    const res = await blockIdRoute.PUT(
      jsonReq(`/api/admin/site-blocks/${createdBlockId}`, 'PUT', {
        content: { body: `Updated ${runSuffix}` },
      }),
      { params: Promise.resolve({ id: String(createdBlockId) }) },
    );

    expect(res.status).toBe(200);
    const json = await parseJson<{ data: Record<string, unknown> }>(res);
    expect((json.data['content'] as Record<string, unknown>)['body']).toBe(`Updated ${runSuffix}`);
  });

  // =========================================================================
  // 3b. Update block order
  // =========================================================================

  it('PUT updates block order', async () => {
    const res = await blockIdRoute.PUT(
      jsonReq(`/api/admin/site-blocks/${createdBlockId}`, 'PUT', {
        blockOrder: 99,
      }),
      { params: Promise.resolve({ id: String(createdBlockId) }) },
    );

    expect(res.status).toBe(200);
    const json = await parseJson<{ data: Record<string, unknown> }>(res);
    expect(json.data['block_order']).toBe(99);
  });

  // =========================================================================
  // 4. Soft-delete block
  // =========================================================================

  it('DELETE soft-deletes a block', async () => {
    const delRes = await blockIdRoute.DELETE(
      new NextRequest(`${BASE}/api/admin/site-blocks/${createdBlockId}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: String(createdBlockId) }) },
    );

    expect(delRes.status).toBe(200);
    const delJson = await parseJson<{ data: { deleted: boolean; id: number } }>(delRes);
    expect(delJson.data.deleted).toBe(true);

    // Verify block no longer appears in GET
    const listRes = await blocksRoute.GET(
      new NextRequest(`${BASE}/api/admin/site-blocks?communityId=${communityId}`),
    );
    const listJson = await parseJson<{ data: Array<Record<string, unknown>> }>(listRes);
    const found = listJson.data.find((b) => Number(b['id']) === createdBlockId);
    expect(found).toBeUndefined();
  });

  // =========================================================================
  // 5. Publish drafts
  // =========================================================================

  it('POST publish converts drafts to published', async () => {
    // Create two fresh draft blocks
    await blocksRoute.POST(
      jsonReq('/api/admin/site-blocks', 'POST', {
        communityId,
        blockType: 'hero',
        content: {
          headline: 'Test Hero',
          subheadline: 'Sub',
          ctaLabel: 'Go',
          ctaHref: '/login',
        },
      }),
    );
    await blocksRoute.POST(
      jsonReq('/api/admin/site-blocks', 'POST', {
        communityId,
        blockType: 'contact',
        content: { boardEmail: 'board@test.com' },
      }),
    );

    const pubRes = await publishRoute.POST(
      jsonReq('/api/admin/site-blocks/publish', 'POST', { communityId }),
    );

    expect(pubRes.status).toBe(200);
    const pubJson = await parseJson<{ data: { publishedCount: number } }>(pubRes);
    expect(pubJson.data.publishedCount).toBeGreaterThanOrEqual(2);
  });

  // =========================================================================
  // 6. Discard drafts
  // =========================================================================

  it('POST discard deletes all draft blocks', async () => {
    // Create a draft
    await blocksRoute.POST(
      jsonReq('/api/admin/site-blocks', 'POST', {
        communityId,
        blockType: 'text',
        content: { body: 'Discard me' },
      }),
    );

    const discRes = await discardRoute.POST(
      jsonReq('/api/admin/site-blocks/discard', 'POST', { communityId }),
    );

    expect(discRes.status).toBe(200);
    const discJson = await parseJson<{ data: { discardedCount: number } }>(discRes);
    expect(discJson.data.discardedCount).toBeGreaterThanOrEqual(1);
  });

  // =========================================================================
  // 7. Validation errors
  // =========================================================================

  it('GET without communityId returns 400', async () => {
    const res = await blocksRoute.GET(
      new NextRequest(`${BASE}/api/admin/site-blocks`),
    );
    expect(res.status).toBe(400);
  });

  it('GET with non-numeric communityId returns 400', async () => {
    const res = await blocksRoute.GET(
      new NextRequest(`${BASE}/api/admin/site-blocks?communityId=abc`),
    );
    expect(res.status).toBe(400);
  });

  it('POST with invalid block type returns 400', async () => {
    const res = await blocksRoute.POST(
      jsonReq('/api/admin/site-blocks', 'POST', {
        communityId,
        blockType: 'nonexistent',
        content: {},
      }),
    );
    expect(res.status).toBe(400);
  });

  it('POST text block with empty body returns 400', async () => {
    const res = await blocksRoute.POST(
      jsonReq('/api/admin/site-blocks', 'POST', {
        communityId,
        blockType: 'text',
        content: { body: '' },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('PUT with invalid id returns 400', async () => {
    const res = await blockIdRoute.PUT(
      jsonReq('/api/admin/site-blocks/abc', 'PUT', { content: { body: 'test' } }),
      { params: Promise.resolve({ id: 'abc' }) },
    );
    expect(res.status).toBe(400);
  });

  it('DELETE non-existent block returns 404', async () => {
    const res = await blockIdRoute.DELETE(
      new NextRequest(`${BASE}/api/admin/site-blocks/999999`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: '999999' }) },
    );
    expect(res.status).toBe(404);
  });
});
