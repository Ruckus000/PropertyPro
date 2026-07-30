/**
 * site-pages-service — multi-page write paths (Phase 11b).
 *
 * Harness mirrors site-blocks-service.test.ts: the drizzle surface is mocked
 * wholesale (the real `@propertypro/db` demands DATABASE_URL at module load), and
 * every export the service imports is stubbed explicitly — a missing one throws
 * at module load and reads as an unrelated component breaking.
 *
 * `.select()` dispatches on the table passed to `.from()` rather than a
 * positional queue: this service reads three tables and the call order differs
 * per function, so positional wiring would encode the implementation instead of
 * the behaviour.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@propertypro/db', () => ({
  createScopedClient: vi.fn(),
  sitePages: Symbol('sitePages'),
  sitePageRedirects: Symbol('sitePageRedirects'),
  siteBlocks: Symbol('siteBlocks'),
  complianceAuditLog: Symbol('complianceAuditLog'),
}));

vi.mock('@propertypro/db/filters', () => ({
  and: vi.fn((...args: unknown[]) => ({ __and: args })),
  asc: vi.fn((col: unknown) => ({ __asc: col })),
  desc: vi.fn((col: unknown) => ({ __desc: col })),
  eq: vi.fn((col: unknown, val: unknown) => ({ __eq: { col, val } })),
  isNull: vi.fn((col: unknown) => ({ __isNull: col })),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      __sql: { strings: [...strings], values },
    }),
    {},
  ),
}));

const {
  createUnscopedClientMock,
  txExecuteMock,
  txInsertMock,
  txAuditValuesMock,
  txUpdateMock,
  getUpdateCalls,
  resetUpdateCalls,
  setRows,
} = vi.hoisted(() => {
  const txExecuteMock = vi.fn().mockResolvedValue(undefined);
  const txAuditValuesMock = vi.fn().mockResolvedValue(undefined);
  const txInsertMock = vi.fn(() => ({ values: txAuditValuesMock }));

  // Rows served per table, keyed by the Symbol's description.
  let rowsByTable: Record<string, unknown[]> = {};

  /**
   * Pulls the `eq(...)` operand VALUES out of a mocked where clause.
   *
   * The mocked table is a Symbol, so `sitePages.slug` is `undefined` and columns
   * cannot be identified by name. The values can be — and that is enough to make
   * the `site_pages` reads behave like real filters instead of returning every row
   * to every query, which would make the slug-uniqueness check unfalsifiable.
   */
  function eqValues(clause: unknown): unknown[] {
    if (clause === null || typeof clause !== 'object') return [];
    const node = clause as Record<string, unknown>;
    if ('__eq' in node) return [(node['__eq'] as { val: unknown }).val];
    if ('__and' in node) return (node['__and'] as unknown[]).flatMap(eqValues);
    if ('__or' in node) return (node['__or'] as unknown[]).flatMap(eqValues);
    return [];
  }

  const txSelectMock = vi.fn((projection: Record<string, unknown>) => {
    const chain: Record<string, unknown> = {};
    const projected = Object.keys(projection ?? {});
    let table = '';
    let where: unknown;
    const resolveRows = (): unknown[] => {
      if (table.includes('sitePageRedirects')) {
        const redirects = (rowsByTable['redirects'] ?? []) as Record<string, unknown>[];
        // Filtered on the slug, for the same reason the pages branch is: the
        // service asks "is a redirect holding THIS slug", and an unconditional
        // return would let that query silently lose its `fromSlug` predicate —
        // becoming "does this community have any retired slug at all" — with
        // every test still passing.
        const slug = eqValues(where).find((v) => typeof v === 'string');
        if (slug === undefined) return redirects;
        return redirects.filter((r) => r['fromSlug'] === slug);
      }
      if (table.includes('siteBlocks')) return rowsByTable['blocks'] ?? [];
      if (!table.includes('sitePages')) return [];

      const pages = (rowsByTable['pages'] ?? []) as Record<string, unknown>[];
      // `select({ sortOrder }) … orderBy(desc(sortOrder)).limit(1)` — the
      // next-free-nav-slot probe. Identified by its projection because the mocked
      // columns are indistinguishable, and sorted here because the real query
      // relies on ORDER BY for correctness: returning rows unsorted would make a
      // new page land on top of an existing one's nav position.
      if (projected.length === 1 && projected[0] === 'sortOrder') {
        return [...pages].sort(
          (a, b) => (b['sortOrder'] as number) - (a['sortOrder'] as number),
        );
      }
      const values = eqValues(where);
      // `eq(isHome, true)` — the home-page lookup.
      if (values.includes(true)) return pages.filter((p) => p['isHome'] === true);
      // `eq(slug, '…')` — the slug-uniqueness check.
      const slug = values.find((v) => typeof v === 'string');
      if (slug !== undefined) return pages.filter((p) => p['slug'] === slug);
      // `eq(id, n)` — loadPage. communityId is also a number, so match either.
      const numbers = values.filter((v): v is number => typeof v === 'number');
      const byId = pages.filter((p) => numbers.includes(p['id'] as number));
      if (byId.length > 0) return byId;
      return pages;
    };
    chain.from = (t: unknown) => { table = String(t); return chain; };
    chain.where = (w: unknown) => { where = w; return chain; };
    chain.orderBy = () => chain;
    chain.limit = () => Promise.resolve(resolveRows());
    chain.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(resolveRows()).then(resolve, reject);
    return chain;
  });

  interface UpdateCall { table?: unknown; set?: Record<string, unknown> }
  const updateCalls: UpdateCall[] = [];
  const txUpdateMock = vi.fn((table: unknown) => {
    const call: UpdateCall = { table };
    updateCalls.push(call);
    const chain: Record<string, unknown> = {};
    chain.set = (s: Record<string, unknown>) => { call.set = s; return chain; };
    chain.where = () => chain;
    chain.returning = () => Promise.resolve([]);
    chain.then = (resolve: (v: unknown) => void) => Promise.resolve([]).then(resolve);
    return chain;
  });

  const tx = {
    execute: txExecuteMock,
    select: txSelectMock,
    insert: txInsertMock,
    update: txUpdateMock,
  };

  return {
    createUnscopedClientMock: vi.fn(() => ({
      transaction: async (cb: (t: typeof tx) => unknown) => cb(tx),
    })),
    txExecuteMock,
    txSelectMock,
    txInsertMock,
    txAuditValuesMock,
    txUpdateMock,
    getUpdateCalls: () => updateCalls,
    resetUpdateCalls: () => { updateCalls.length = 0; },
    setRows: (rows: Record<string, unknown[]>) => { rowsByTable = rows; },
  };
});

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: createUnscopedClientMock,
}));

import {
  createSitePage,
  ensureHomePage,
  reorderSitePages,
  stageSitePageDelete,
  unstageSitePageDelete,
  updateSitePage,
} from '@/lib/services/site-pages-service';
import { createScopedClient } from '@propertypro/db';
import { NotFoundError, ValidationError } from '@/lib/api/errors';

const createScopedClientMock = vi.mocked(createScopedClient);

const HOME = {
  id: 1,
  name: 'Home',
  slug: '',
  inNav: true,
  sortOrder: 0,
  isHome: true,
  isDraft: false,
  publishedAt: new Date('2026-06-01T00:00:00Z'),
  deleteStagedAt: null,
};
const ABOUT = {
  id: 2,
  name: 'About',
  slug: 'about',
  inNav: true,
  sortOrder: 1,
  isHome: false,
  isDraft: false,
  publishedAt: new Date('2026-06-01T00:00:00Z'),
  deleteStagedAt: null,
};

function buildScoped() {
  return {
    insert: vi.fn().mockResolvedValue([{ ...ABOUT, id: 3 }]),
    update: vi.fn().mockResolvedValue(undefined),
    softDelete: vi.fn().mockResolvedValue(undefined),
  };
}

let scoped: ReturnType<typeof buildScoped>;

beforeEach(() => {
  vi.clearAllMocks();
  resetUpdateCalls();
  scoped = buildScoped();
  createScopedClientMock.mockReturnValue(scoped as never);
  setRows({ pages: [HOME], redirects: [], blocks: [] });
});

describe('ensureHomePage', () => {
  it('returns the existing home page without inserting', async () => {
    const id = await ensureHomePage(42);
    expect(id).toBe(1);
    expect(scoped.insert).not.toHaveBeenCalled();
  });

  it('adopts page-less blocks so 11c can set page_id NOT NULL', async () => {
    // The self-healing half: rows written by the pre-11b deploy (or the admin
    // app's raw SQL) carry no page. Every NULL left behind is a failed 11c
    // migration, so resolving the home page also claims them.
    await ensureHomePage(42);
    const blockUpdate = getUpdateCalls().find((c) => String(c.table).includes('siteBlocks'));
    expect(blockUpdate?.set).toMatchObject({ pageId: 1 });
  });

  it('creates a DRAFT home page for a community with no blocks', async () => {
    setRows({ pages: [], redirects: [], blocks: [] });
    await ensureHomePage(42);
    expect(scoped.insert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ isHome: true, slug: '', isDraft: true, publishedAt: null }),
    );
  });

  it('creates a PUBLISHED home page when the community already has published blocks', async () => {
    // Derived exactly as migration 0046's backfill derived it — otherwise a
    // community whose blocks are live would get a draft page that anon RLS hides,
    // taking its public site down.
    const stamp = new Date('2026-05-01T00:00:00Z');
    setRows({ pages: [], redirects: [], blocks: [{ publishedAt: stamp }] });
    await ensureHomePage(42);
    expect(scoped.insert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ isDraft: false, publishedAt: stamp }),
    );
  });

  it('honours an explicit publishedAt (the starter-pack path)', async () => {
    const now = new Date('2026-07-01T00:00:00Z');
    setRows({ pages: [], redirects: [], blocks: [] });
    await ensureHomePage(42, undefined, { publishedAt: now });
    expect(scoped.insert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ isDraft: false, publishedAt: now }),
    );
  });
});

describe('createSitePage', () => {
  it('creates an unpublished page after the last one in nav order', async () => {
    setRows({ pages: [HOME, ABOUT], redirects: [], blocks: [] });
    await createSitePage({ communityId: 42, actorUserId: 'u1', name: 'Rules', slug: 'rules' });
    expect(scoped.insert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ slug: 'rules', isDraft: true, isHome: false, sortOrder: 2 }),
    );
  });

  it('rejects a slug reserved by an application route', async () => {
    // `/documents` is an app route on the community subdomain, so a public page
    // there would be shadowed forever. Sourced from isReservedPublicSlug, never
    // re-listed.
    await expect(
      createSitePage({ communityId: 42, actorUserId: 'u1', name: 'Docs', slug: 'documents' }),
    ).rejects.toThrow(ValidationError);
  });

  it('rejects a malformed slug before it reaches the database CHECK', async () => {
    for (const slug of ['Docs', 'has space', '..', '-leading']) {
      await expect(
        createSitePage({ communityId: 42, actorUserId: 'u1', name: 'X', slug }),
      ).rejects.toThrow(ValidationError);
    }
  });

  it('rejects a slug another live page already uses', async () => {
    setRows({ pages: [HOME, ABOUT], redirects: [], blocks: [] });
    await expect(
      createSitePage({ communityId: 42, actorUserId: 'u1', name: 'About 2', slug: 'about' }),
    ).rejects.toThrow(/already uses/);
  });

  it('rejects a slug a retired redirect still holds', async () => {
    setRows({ pages: [HOME], redirects: [{ id: 5, pageId: 9, fromSlug: 'old' }], blocks: [] });
    await expect(
      createSitePage({ communityId: 42, actorUserId: 'u1', name: 'Old', slug: 'old' }),
    ).rejects.toThrow(/used to live/);
  });

  it('rejects an empty name', async () => {
    await expect(
      createSitePage({ communityId: 42, actorUserId: 'u1', name: '   ', slug: 'ok' }),
    ).rejects.toThrow(ValidationError);
  });

  it('takes the community lock before writing', async () => {
    await createSitePage({ communityId: 42, actorUserId: 'u1', name: 'Rules', slug: 'rules' });
    const sqlText = (txExecuteMock.mock.calls[0]![0] as { __sql: { strings: string[] } }).__sql.strings.join('');
    expect(sqlText).toContain('FOR UPDATE');
  });

  it('writes an audit row inside the same transaction', async () => {
    await createSitePage({ communityId: 42, actorUserId: 'u1', name: 'Rules', slug: 'rules' });
    expect(txAuditValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'create', resourceType: 'site_page', communityId: 42 }),
    );
  });
});

describe('updateSitePage', () => {
  it('mints a permanent redirect when a PUBLISHED page changes address', async () => {
    // Association URLs get printed in mailed notices, so a rename must not break
    // an old link. There is no toggle.
    setRows({ pages: [ABOUT], redirects: [], blocks: [] });
    const result = await updateSitePage({
      communityId: 42, actorUserId: 'u1', pageId: 2, slug: 'about-us',
    });
    expect(result.redirectedFrom).toBe('about');
    expect(scoped.insert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ fromSlug: 'about', pageId: 2 }),
    );
  });

  it('does NOT mint a redirect for a page that has never been published', async () => {
    // Nothing ever pointed at that address, so a redirect would only reserve a
    // slug nobody used.
    setRows({ pages: [{ ...ABOUT, isDraft: true, publishedAt: null }], redirects: [], blocks: [] });
    const result = await updateSitePage({
      communityId: 42, actorUserId: 'u1', pageId: 2, slug: 'about-us',
    });
    expect(result.redirectedFrom).toBeNull();
    expect(scoped.insert).not.toHaveBeenCalled();
  });

  it('lets a page reclaim its own former address, dropping the redirect', async () => {
    // The redirect holding `about-old` belongs to THIS page, so reclaiming it is
    // an undo rather than a hijack — and the row has to go, or the page and a
    // redirect would both answer for the same slug.
    setRows({ pages: [ABOUT], redirects: [{ id: 5, pageId: 2, fromSlug: 'about-old' }], blocks: [] });
    await updateSitePage({ communityId: 42, actorUserId: 'u1', pageId: 2, slug: 'about-old' });
    expect(scoped.softDelete).toHaveBeenCalled();
  });

  it('refuses an address a redirect holds for a DIFFERENT page', async () => {
    setRows({ pages: [ABOUT], redirects: [{ id: 5, pageId: 9, fromSlug: 'taken' }], blocks: [] });
    await expect(
      updateSitePage({ communityId: 42, actorUserId: 'u1', pageId: 2, slug: 'taken' }),
    ).rejects.toThrow(/used to live/);
  });

  it('refuses to move the home page off the site root', async () => {
    await expect(
      updateSitePage({ communityId: 42, actorUserId: 'u1', pageId: 1, slug: 'welcome' }),
    ).rejects.toThrow(/site root/);
  });

  it('allows RENAMING the home page — the name is its nav label', async () => {
    const result = await updateSitePage({
      communityId: 42, actorUserId: 'u1', pageId: 1, name: 'Welcome',
    });
    expect(result.redirectedFrom).toBeNull();
    expect(scoped.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'Welcome' }),
      expect.anything(),
    );
  });

  it('rejects an update that changes nothing', async () => {
    await expect(
      updateSitePage({ communityId: 42, actorUserId: 'u1', pageId: 1 }),
    ).rejects.toThrow(ValidationError);
  });

  it('404s for a page in another community', async () => {
    setRows({ pages: [], redirects: [], blocks: [] });
    await expect(
      updateSitePage({ communityId: 42, actorUserId: 'u1', pageId: 999, name: 'X' }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('stageSitePageDelete', () => {
  it('STAGES the removal of a published page rather than taking it off the live site', async () => {
    setRows({ pages: [ABOUT], redirects: [], blocks: [] });
    const result = await stageSitePageDelete({ communityId: 42, actorUserId: 'u1', pageId: 2 });
    expect(result).toEqual({ staged: true });
    expect(scoped.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ deleteStagedAt: expect.any(Date) }),
      expect.anything(),
    );
    expect(scoped.softDelete).not.toHaveBeenCalled();
  });

  it('deletes an unpublished page outright, with its blocks', async () => {
    // Nothing live to protect. Blocks are soft-deleted EXPLICITLY — the composite
    // FK cascade only fires on a hard delete.
    setRows({ pages: [{ ...ABOUT, isDraft: true, publishedAt: null }], redirects: [], blocks: [] });
    const result = await stageSitePageDelete({ communityId: 42, actorUserId: 'u1', pageId: 2 });
    expect(result).toEqual({ staged: false });
    expect(scoped.softDelete).toHaveBeenCalledTimes(2);
  });

  it('refuses to remove the home page', async () => {
    await expect(
      stageSitePageDelete({ communityId: 42, actorUserId: 'u1', pageId: 1 }),
    ).rejects.toThrow(/home page cannot be removed/);
  });
});

describe('unstageSitePageDelete', () => {
  it('clears the staged stamp', async () => {
    setRows({ pages: [{ ...ABOUT, deleteStagedAt: new Date() }], redirects: [], blocks: [] });
    await unstageSitePageDelete({ communityId: 42, actorUserId: 'u1', pageId: 2 });
    expect(scoped.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ deleteStagedAt: null }),
      expect.anything(),
    );
  });

  it('rejects a page that is not staged for removal', async () => {
    setRows({ pages: [ABOUT], redirects: [], blocks: [] });
    await expect(
      unstageSitePageDelete({ communityId: 42, actorUserId: 'u1', pageId: 2 }),
    ).rejects.toThrow(/not staged/);
  });
});

describe('reorderSitePages', () => {
  it('renumbers from 1, leaving home pinned at 0', async () => {
    setRows({ pages: [HOME, ABOUT, { ...ABOUT, id: 3 }], redirects: [], blocks: [] });
    await reorderSitePages({ communityId: 42, actorUserId: 'u1', orderedPageIds: [3, 2] });
    expect(scoped.update).toHaveBeenNthCalledWith(
      1, expect.anything(), { sortOrder: 1 }, expect.anything(),
    );
    expect(scoped.update).toHaveBeenNthCalledWith(
      2, expect.anything(), { sortOrder: 2 }, expect.anything(),
    );
  });

  it('rejects a partial list rather than renumbering pages the client never mentioned', async () => {
    setRows({ pages: [HOME, ABOUT, { ...ABOUT, id: 3 }], redirects: [], blocks: [] });
    await expect(
      reorderSitePages({ communityId: 42, actorUserId: 'u1', orderedPageIds: [2] }),
    ).rejects.toThrow(/out of date/);
  });

  it('rejects a list containing a duplicate', async () => {
    setRows({ pages: [HOME, ABOUT, { ...ABOUT, id: 3 }], redirects: [], blocks: [] });
    await expect(
      reorderSitePages({ communityId: 42, actorUserId: 'u1', orderedPageIds: [2, 2] }),
    ).rejects.toThrow(/out of date/);
  });

  it('rejects a list that includes the home page', async () => {
    setRows({ pages: [HOME, ABOUT], redirects: [], blocks: [] });
    await expect(
      reorderSitePages({ communityId: 42, actorUserId: 'u1', orderedPageIds: [1, 2] }),
    ).rejects.toThrow(/out of date/);
  });
});
