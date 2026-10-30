/**
 * P4-58: Compliance lifecycle integration test.
 *
 * Verifies the full compliance flow:
 *   1. Generate compliance checklist for a condo community → items created
 *   2. Idempotent re-generation returns existing items
 *   3. GET returns items with calculated status (unsatisfied initially)
 *   4. Feature gate: apartment community → 403
 *   5. Role gate: tenant cannot generate checklist
 *   6. One file fills one record; a record's file is replaced only on purpose
 */
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MULTI_TENANT_COMMUNITIES } from '../fixtures/multi-tenant-communities';
import { MULTI_TENANT_USERS, type MultiTenantUserKey } from '../fixtures/multi-tenant-users';
import {
  type TestKitState,
  initTestKit,
  seedCommunities,
  seedUsers,
  teardownTestKit,
  requireCommunity,
  setActor,
  apiUrl,
  jsonRequest,
  parseJson,
  requireDatabaseUrlInCI,
  getDescribeDb,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('Compliance lifecycle integration tests');

const describeDb = getDescribeDb();

// No file-local mocks: setup-integration.ts's shared providers supply the
// session (keyed on the kit's current actor) and capture the outbound side
// effects (notification email queue, announcement fan-out, PDF extraction).
// Membership, permissions and tenant scoping are the real code.

// ---------------------------------------------------------------------------
// Route types
// ---------------------------------------------------------------------------

type ComplianceRouteModule = typeof import('../../src/app/api/v1/compliance/route');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let state: TestKitState | null = null;
let complianceRoute: ComplianceRouteModule | null = null;

function requireState(): TestKitState {
  if (!state) throw new Error('Test state not initialized');
  return state;
}

function requireRoute(): ComplianceRouteModule {
  if (!complianceRoute) throw new Error('Route not loaded');
  return complianceRoute;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describeDb('P4-58: compliance lifecycle (db-backed integration)', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;

    state = await initTestKit();

    // Seed communityA (condo_718) and communityC (apartment)
    const communityA = MULTI_TENANT_COMMUNITIES.find((c) => c.key === 'communityA');
    const communityC = MULTI_TENANT_COMMUNITIES.find((c) => c.key === 'communityC');
    if (!communityA || !communityC) throw new Error('Required community fixtures not found');
    await seedCommunities(state, [communityA, communityC]);

    // Seed actorA (board_president, communityA), tenantA (tenant, communityA), actorC (pm_admin, communityC)
    const neededUsers: MultiTenantUserKey[] = ['actorA', 'tenantA', 'actorC'];
    const userFixtures = MULTI_TENANT_USERS.filter((u) => neededUsers.includes(u.key));
    await seedUsers(state, userFixtures);

    complianceRoute = await import('../../src/app/api/v1/compliance/route');
  });

  beforeEach(() => {
    const kit = requireState();
    setActor(kit, 'actorA');
  });

  afterAll(async () => {
    if (state) await teardownTestKit(state);
  });

  // =========================================================================
  // 1. Generate checklist for condo community
  // =========================================================================

  it('POST generates compliance checklist items for condo_718 community', async () => {
    const kit = requireState();
    const route = requireRoute();
    const communityA = requireCommunity(kit, 'communityA');

    const response = await route.POST(
      jsonRequest(apiUrl('/api/v1/compliance'), 'POST', {
        communityId: communityA.id,
      }),
    );

    expect(response.status).toBe(200);
    const json = await parseJson<{ data: Array<Record<string, unknown>> }>(response);
    expect(json.data.length).toBeGreaterThan(0);

    // Each item should have expected fields
    const firstItem = json.data[0]!;
    expect(firstItem).toHaveProperty('templateKey');
    expect(typeof firstItem['templateKey']).toBe('string');
    expect(firstItem).toHaveProperty('title');
    expect(typeof firstItem['title']).toBe('string');
    expect(firstItem).toHaveProperty('statuteReference');
    expect(typeof firstItem['statuteReference']).toBe('string');
    expect(firstItem).toHaveProperty('documentId');
    expect(firstItem['documentId']).toBeNull();
  });

  // =========================================================================
  // 2. Idempotent re-generation
  // =========================================================================

  it('POST re-generation returns existing items with alreadyGenerated flag', async () => {
    const kit = requireState();
    const route = requireRoute();
    const communityA = requireCommunity(kit, 'communityA');

    const response = await route.POST(
      jsonRequest(apiUrl('/api/v1/compliance'), 'POST', {
        communityId: communityA.id,
      }),
    );

    expect(response.status).toBe(200);
    const json = await parseJson<{
      data: {
        data: Array<Record<string, unknown>>;
        meta: { alreadyGenerated: boolean };
      };
    }>(response);
    expect(json.data.meta.alreadyGenerated).toBe(true);
    expect(json.data.data.length).toBeGreaterThan(0);
  });

  // =========================================================================
  // 3. GET returns items with computed compliance status
  // =========================================================================

  it('GET returns checklist items with computed status', async () => {
    const kit = requireState();
    const route = requireRoute();
    const communityA = requireCommunity(kit, 'communityA');

    const response = await route.GET(
      new NextRequest(apiUrl(`/api/v1/compliance?communityId=${communityA.id}`)),
    );

    expect(response.status).toBe(200);
    const json = await parseJson<{ data: Array<Record<string, unknown>> }>(response);
    expect(json.data.length).toBeGreaterThan(0);

    // Items without documents should be unsatisfied or overdue
    for (const item of json.data) {
      expect(item).toHaveProperty('status');
      // Since no documents have been linked, status should indicate unsatisfied
      expect(['unsatisfied', 'overdue', 'not_applicable']).toContain(item['status']);
    }
  });

  // =========================================================================
  // 4. Feature gate: apartment community → 403
  // =========================================================================

  it('GET on apartment community returns 403', async () => {
    const kit = requireState();
    const route = requireRoute();
    const communityC = requireCommunity(kit, 'communityC');

    setActor(kit, 'actorC');
    const response = await route.GET(
      new NextRequest(apiUrl(`/api/v1/compliance?communityId=${communityC.id}`)),
    );

    expect(response.status).toBe(403);
  });

  it('POST on apartment community returns 403', async () => {
    const kit = requireState();
    const route = requireRoute();
    const communityC = requireCommunity(kit, 'communityC');

    setActor(kit, 'actorC');
    const response = await route.POST(
      jsonRequest(apiUrl('/api/v1/compliance'), 'POST', {
        communityId: communityC.id,
      }),
    );

    expect(response.status).toBe(403);
  });

  // =========================================================================
  // 5. Role gate: tenant cannot generate checklist
  // =========================================================================

  it('tenant cannot POST to generate compliance checklist', async () => {
    const kit = requireState();
    const route = requireRoute();
    const communityA = requireCommunity(kit, 'communityA');

    setActor(kit, 'tenantA');
    const response = await route.POST(
      jsonRequest(apiUrl('/api/v1/compliance'), 'POST', {
        communityId: communityA.id,
      }),
    );

    expect(response.status).toBe(403);
  });
  // =========================================================================
  // 6. One file fills one record (manual links)
  // =========================================================================

  it('PATCH link_document refuses a file already posted as another record, and a record that already has a file unless replace', async () => {
    const kit = requireState();
    const route = requireRoute();
    const communityA = requireCommunity(kit, 'communityA');
    const { documents, complianceChecklistItems } = kit.dbModule;

    async function postDocument(title: string): Promise<number> {
      const [row] = await kit.db
        .insert(documents)
        .values({
          communityId: communityA.id,
          title: `${title} ${kit.runSuffix}`,
          filePath: `communities/${communityA.id}/documents/${title.toLowerCase().replace(/\s+/g, '-')}-${kit.runSuffix}.pdf`,
          fileName: `${title.toLowerCase().replace(/\s+/g, '-')}.pdf`,
          fileSize: 1024,
          mimeType: 'application/pdf',
          postedAt: new Date(),
        })
        .returning({ id: documents.id });
      if (!row) throw new Error(`Failed to post "${title}"`);
      return row.id;
    }
    function link(itemId: number, documentId: number, extra: Record<string, unknown> = {}) {
      return route.PATCH(
        jsonRequest(apiUrl('/api/v1/compliance'), 'PATCH', {
          id: itemId,
          communityId: communityA.id,
          action: 'link_document',
          documentId,
          ...extra,
        }),
      );
    }
    async function documentOf(itemId: number): Promise<number | null> {
      const rows = await kit.db.select({ id: complianceChecklistItems.id, documentId: complianceChecklistItems.documentId })
        .from(complianceChecklistItems);
      return rows.find((row) => row.id === itemId)?.documentId ?? null;
    }

    const list = await route.GET(new NextRequest(apiUrl(`/api/v1/compliance?communityId=${communityA.id}`)));
    const items = (await parseJson<{ data: Array<{ id: number; documentId: number | null }> }>(list)).data
      .filter((item) => item.documentId === null);
    const [first, second] = items;
    if (!first || !second) throw new Error('Expected two unlinked checklist items');
    const budget = await postDocument('Budget');
    const replacement = await postDocument('Budget revised');

    expect((await link(first.id, budget)).status).toBe(200);

    // The same file for a second record.
    const twice = await link(second.id, budget);
    expect(twice.status).toBe(409);
    expect(JSON.stringify(await twice.json())).toContain('This file is already posted as another record.');
    expect(await documentOf(second.id)).toBeNull();

    // A different file for a record that already has one.
    const swap = await link(first.id, replacement);
    expect(swap.status).toBe(409);
    expect(JSON.stringify(await swap.json())).toContain('This record already has a file. Remove it first to replace it.');
    expect(await documentOf(first.id)).toBe(budget);

    // Linking the same file again is not a conflict, and replacing on purpose works.
    expect((await link(first.id, budget)).status).toBe(200);
    expect((await link(first.id, replacement, { replace: true })).status).toBe(200);
    expect(await documentOf(first.id)).toBe(replacement);
  });

  it('PATCH link_document with replace puts a new file over a stale one, but never gives one file to two records', async () => {
    const kit = requireState();
    const route = requireRoute();
    const communityA = requireCommunity(kit, 'communityA');
    const { documents, complianceChecklistItems } = kit.dbModule;

    async function postDocument(title: string, postedAt: Date): Promise<number> {
      const slug = `${title.toLowerCase().replace(/\s+/g, '-')}-${kit.runSuffix}`;
      const [row] = await kit.db
        .insert(documents)
        .values({
          communityId: communityA.id,
          title: `${title} ${kit.runSuffix}`,
          filePath: `communities/${communityA.id}/documents/${slug}.pdf`,
          fileName: `${slug}.pdf`,
          fileSize: 1024,
          mimeType: 'application/pdf',
          postedAt,
        })
        .returning({ id: documents.id });
      if (!row) throw new Error(`Failed to post "${title}"`);
      return row.id;
    }
    function link(itemId: number, documentId: number, extra: Record<string, unknown> = {}) {
      return route.PATCH(
        jsonRequest(apiUrl('/api/v1/compliance'), 'PATCH', {
          id: itemId,
          communityId: communityA.id,
          action: 'link_document',
          documentId,
          ...extra,
        }),
      );
    }
    async function documentOf(itemId: number): Promise<number | null> {
      const rows = await kit.db
        .select({ id: complianceChecklistItems.id, documentId: complianceChecklistItems.documentId })
        .from(complianceChecklistItems);
      return rows.find((row) => row.id === itemId)?.documentId ?? null;
    }

    const list = await route.GET(new NextRequest(apiUrl(`/api/v1/compliance?communityId=${communityA.id}`)));
    const [stale, other] = (await parseJson<{ data: Array<{ id: number; documentId: number | null }> }>(list)).data
      .filter((item) => item.documentId === null);
    if (!stale || !other) throw new Error('Expected two unlinked checklist items');

    // Last year's file, then this year's posted over it on purpose.
    const lastYear = await postDocument('Budget last year', new Date('2025-01-15T00:00:00Z'));
    const thisYear = await postDocument('Budget this year', new Date());
    expect((await link(stale.id, lastYear)).status).toBe(200);
    expect((await link(stale.id, thisYear, { replace: true })).status).toBe(200);
    expect(await documentOf(stale.id)).toBe(thisYear);

    // replace never lets one file fill two records.
    const twice = await link(other.id, thisYear, { replace: true });
    expect(twice.status).toBe(409);
    expect(JSON.stringify(await twice.json())).toContain('This file is already posted as another record.');
    expect(await documentOf(other.id)).toBeNull();
  });
});
