import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.importActual cannot be used here because the real @propertypro/db
// requires DATABASE_URL at module load. This is the established pattern
// across the test suite — see site-blocks-service.test.ts.
//
// Guard: every export consumed by the service is explicitly stubbed.
vi.mock('@propertypro/db', () => ({
  createScopedClient: vi.fn(),
  siteBlocks: Symbol('siteBlocks'),
  // Phase 8: publishCommunitySite now stamps communities.site_published_at.
  communities: Symbol('communities'),
  siteStarterPacks: Symbol('siteStarterPacks'),
  // Phase 11b multi-page — reached through site-pages-service.
  sitePages: Symbol('sitePages'),
  sitePageRedirects: Symbol('sitePageRedirects'),
  complianceAuditLog: Symbol('complianceAuditLog'),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: vi.fn(),
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ __eq: { col, val } })),
  and: vi.fn((...args: unknown[]) => ({ __and: args })),
  asc: vi.fn((col: unknown) => ({ __asc: col })),
  desc: vi.fn((col: unknown) => ({ __desc: col })),
  isNull: vi.fn((col: unknown) => ({ __isNull: col })),
  or: vi.fn((...args: unknown[]) => ({ __or: args })),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      __sql: { strings: [...strings], values },
    }),
    { raw: (v: string) => ({ __raw: v }) },
  ),
}));

// Phase 11b: the starter pack now creates the community's home page and stamps
// `page_id` on every block it inserts. Mocked rather than exercised — this file
// is about pack selection and idempotency, and `ensureHomePage` has its own
// coverage.
vi.mock('@/lib/services/site-pages-service', () => ({
  ensureHomePage: vi.fn(async () => 77),
}));

import { applyStarterPackToCommunity } from '@/lib/services/starter-pack-service';
import { createScopedClient } from '@propertypro/db';
// AUTHZ: test file — mocks createUnscopedClient from @propertypro/db/unsafe; no real DB access occurs.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { ensureHomePage } from '@/lib/services/site-pages-service';

const createScopedClientMock = vi.mocked(createScopedClient);
const createUnscopedClientMock = vi.mocked(createUnscopedClient);

/** The id `ensureHomePage` is mocked to return, asserted on every insert. */
const HOME_PAGE_ID = 77;

const HERO_BLOCK = { blockType: 'hero', blockOrder: 1, content: { headline: 'Welcome' } };
const TEXT_BLOCK = { blockType: 'text', blockOrder: 2, content: { body: 'About us.' } };

function buildScopedClient(existingBlocks: unknown[] = []) {
  return {
    queryWhere: vi.fn().mockResolvedValue(existingBlocks),
    insert: vi.fn().mockResolvedValue([{ id: 1 }]),
  };
}

function buildUnscopedClient(packBlocks: unknown[] | null, slug = 'florida-condo-v1') {
  const rows = packBlocks !== null ? [{ slug, blocks: packBlocks }] : [];
  return buildUnscopedClientFromRows(rows);
}

// Capture the `.where()` predicate (and `.orderBy()` args) so tests can assert
// the catalog query is data-driven (community_type + is_archived) rather than
// slug-hardcoded, AND that it orders "latest wins" (version desc, id desc). The
// chain is select().from().where().orderBy().limit().
function buildUnscopedClientFromRows(rows: unknown[]) {
  const limitMock = vi.fn().mockResolvedValue(rows);
  const orderByMock = vi.fn((..._clauses: unknown[]) => ({ limit: limitMock }));
  const whereMock = vi.fn((_predicate?: unknown) => ({ orderBy: orderByMock, limit: limitMock }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));
  return {
    select: selectMock,
    getWhereArg: () => whereMock.mock.calls[0]?.[0],
    getOrderByArgs: () => orderByMock.mock.calls[0] ?? [],
  };
}

describe('applyStarterPackToCommunity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts each block from the selected pack via scoped.insert', async () => {
    const scopedClient = buildScopedClient([]);
    createScopedClientMock.mockReturnValue(scopedClient as never);
    const unscopedClient = buildUnscopedClient([HERO_BLOCK, TEXT_BLOCK]);
    createUnscopedClientMock.mockReturnValue(unscopedClient as never);

    const result = await applyStarterPackToCommunity(10, 'condo_718');

    expect(result).toEqual({ applied: true, blockCount: 2, packSlug: 'florida-condo-v1' });
    expect(scopedClient.insert).toHaveBeenCalledTimes(2);
    expect(scopedClient.insert).toHaveBeenNthCalledWith(
      1,
      expect.anything(), // siteBlocks table ref
      expect.objectContaining({
        communityId: 10,
        pageId: HOME_PAGE_ID,
        blockType: 'hero',
        blockOrder: 1,
        isDraft: false,
        content: { headline: 'Welcome' },
      }),
    );
    expect(scopedClient.insert).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({
        pageId: HOME_PAGE_ID,
        blockType: 'text',
        blockOrder: 2,
      }),
    );
  });

  it('creates the home page as PUBLISHED, stamped with the blocks own timestamp', async () => {
    // A starter pack is live immediately. A draft home page carrying published
    // blocks would be hidden by anon RLS while its own content was served —
    // which is why `ensureHomePage` takes an explicit `publishedAt` here rather
    // than deriving published-ness from blocks that do not exist yet.
    const scopedClient = buildScopedClient([]);
    createScopedClientMock.mockReturnValue(scopedClient as never);
    const unscopedClient = buildUnscopedClient([HERO_BLOCK], 'florida-condo-v1');
    createUnscopedClientMock.mockReturnValue(unscopedClient as never);

    await applyStarterPackToCommunity(10, 'condo_718');

    expect(ensureHomePage).toHaveBeenCalledWith(
      10,
      undefined,
      expect.objectContaining({ publishedAt: expect.any(Date) }),
    );
  });

  it('resolves with the slug of the selected hoa_720 pack', async () => {
    const scopedClient = buildScopedClient([]);
    createScopedClientMock.mockReturnValue(scopedClient as never);
    const unscopedClient = buildUnscopedClient([HERO_BLOCK], 'florida-hoa-v1');
    createUnscopedClientMock.mockReturnValue(unscopedClient as never);

    const result = await applyStarterPackToCommunity(20, 'hoa_720');

    expect(result.packSlug).toBe('florida-hoa-v1');
    expect(result.applied).toBe(true);
    expect(result.blockCount).toBe(1);
  });

  it('resolves with the slug of the selected apartment pack', async () => {
    const scopedClient = buildScopedClient([]);
    createScopedClientMock.mockReturnValue(scopedClient as never);
    const unscopedClient = buildUnscopedClient([HERO_BLOCK], 'apartment-v1');
    createUnscopedClientMock.mockReturnValue(unscopedClient as never);

    const result = await applyStarterPackToCommunity(30, 'apartment');

    expect(result.packSlug).toBe('apartment-v1');
    expect(result.applied).toBe(true);
    expect(result.blockCount).toBe(1);
    // Unscoped DB should NOT be called because there are no existing blocks
    // and the pack was fetched; scoped insert should have been called.
    expect(scopedClient.insert).toHaveBeenCalledTimes(1);
  });

  it('skips apply (applied:false) when community already has published site_blocks', async () => {
    const scopedClient = buildScopedClient([{ id: 99, isDraft: false }]);
    createScopedClientMock.mockReturnValue(scopedClient as never);

    const result = await applyStarterPackToCommunity(10, 'condo_718');

    expect(result).toEqual({ applied: false, blockCount: 0, packSlug: null });
    // createUnscopedClient should never be called — we bailed out before the pack lookup
    expect(createUnscopedClientMock).not.toHaveBeenCalled();
    expect(scopedClient.insert).not.toHaveBeenCalled();
  });

  it('returns applied:false when the pack row does not exist in the catalog', async () => {
    const scopedClient = buildScopedClient([]);
    createScopedClientMock.mockReturnValue(scopedClient as never);
    // Empty rows — no pack found
    const unscopedClient = buildUnscopedClient(null);
    createUnscopedClientMock.mockReturnValue(unscopedClient as never);

    const result = await applyStarterPackToCommunity(10, 'condo_718');

    expect(result).toEqual({ applied: false, blockCount: 0, packSlug: null });
    expect(scopedClient.insert).not.toHaveBeenCalled();
  });

  it('selects the highest-version non-archived pack for the community type', async () => {
    const scopedClient = buildScopedClient([]); // no published blocks yet → not idempotent-skipped
    createScopedClientMock.mockReturnValue(scopedClient as never);
    // The catalog query resolves to the latest pack's blocks.
    const unscopedClient = buildUnscopedClientFromRows([
      { slug: 'florida-condo-v2', blocks: [{ blockType: 'hero', blockOrder: 1, content: { headline: 'v2' } }] },
    ]);
    createUnscopedClientMock.mockReturnValue(unscopedClient as never);

    const res = await applyStarterPackToCommunity(42, 'condo_718');

    expect(res.applied).toBe(true);
    expect(res.blockCount).toBe(1);
    // The where predicate must include community_type and is_archived=false (no hardcoded slug).
    const serialized = JSON.stringify(unscopedClient.getWhereArg());
    expect(serialized).toContain('condo_718');
    expect(serialized).not.toContain('florida-condo-v1');
    // The ordering IS the "latest wins" contract: orderBy(version desc, id desc).
    // Limitation: siteStarterPacks is a single Symbol mock, so its `.version`
    // and `.id` property accesses both yield `undefined` — the two columns are
    // not distinguishable here. Asserting exactly two `__desc` clauses still
    // catches "ordering dropped" and "wrong number of sort keys" regressions.
    const orderByArgs = unscopedClient.getOrderByArgs();
    expect(orderByArgs).toHaveLength(2);
    expect(orderByArgs[0]).toHaveProperty('__desc');
    expect(orderByArgs[1]).toHaveProperty('__desc');
  });

  it('no-ops when every pack for the type is archived (no row returned)', async () => {
    const scopedClient = buildScopedClient([]);
    createScopedClientMock.mockReturnValue(scopedClient as never);
    const unscopedClient = buildUnscopedClientFromRows([]); // query returns nothing
    createUnscopedClientMock.mockReturnValue(unscopedClient as never);

    const res = await applyStarterPackToCommunity(42, 'condo_718');

    expect(res).toEqual({ applied: false, blockCount: 0, packSlug: null });
  });
});
