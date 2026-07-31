/**
 * The shared change model.
 *
 * The assertions here are about the things a component test reads straight
 * past: that "never published" is expressed as `null` rather than an empty
 * snapshot (an empty one reports the wrong `firstPublish`), that a still-loading
 * query yields an empty diff rather than a spurious one, and — Phase 11b-3 —
 * that page-level changes are merged in and every change is filed under the
 * page it is actually about.
 *
 * `@/hooks/use-content-blocks` and `@/hooks/use-site-pages` are mocked
 * COMPLETELY — a partial factory fails only at module load for whichever
 * component reaches the missing export, and reads as an unrelated component
 * breaking. `diffSite`/`diffPages`/`toSnapshot` are the REAL implementations:
 * mocking them would leave nothing under test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSiteDiff } from '@/components/pm/site-editor-v3/use-site-diff';
import type { SiteBlockSummary } from '@/hooks/use-content-blocks';
import type { SitePageSummary } from '@/hooks/use-site-pages';

const HOME_PAGE_ID = 1;
const SECOND_PAGE_ID = 2;

function block(overrides: Partial<SiteBlockSummary> = {}): SiteBlockSummary {
  return {
    id: 1,
    pageId: HOME_PAGE_ID,
    blockType: 'text',
    blockOrder: 2,
    content: { heading: 'Pool rules', body: 'No glass by the pool, please.' },
    isDraft: false,
    publishedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

const hero = (overrides: Partial<SiteBlockSummary> = {}): SiteBlockSummary =>
  block({
    id: 100,
    blockType: 'hero',
    blockOrder: 1,
    content: { headline: 'Sunset Condos', subtitle: 'Miami Beach' },
    ...overrides,
  });

function page(overrides: Partial<SitePageSummary> = {}): SitePageSummary {
  return {
    id: HOME_PAGE_ID,
    name: 'Home',
    slug: '',
    inNav: true,
    sortOrder: 0,
    isHome: true,
    isDraft: false,
    publishedAt: '2026-07-01T00:00:00.000Z',
    deleteStagedAt: null,
    ...overrides,
  };
}

const HOME_PAGE = page();
const CONTACT_PAGE = page({
  id: SECOND_PAGE_ID,
  name: 'Contact',
  slug: 'contact',
  sortOrder: 1,
  isHome: false,
});

const queries = vi.hoisted(() => ({
  draft: [] as SiteBlockSummary[],
  published: [] as SiteBlockSummary[],
  pages: [] as SitePageSummary[],
  isPending: false,
  isError: false,
  error: null as Error | null,
  pagesPending: false,
  pagesError: false,
  pagesErrorValue: null as Error | null,
}));

const draftRefetch = vi.hoisted(() => vi.fn());
const publishedRefetch = vi.hoisted(() => vi.fn());
const pagesRefetch = vi.hoisted(() => vi.fn());

function base() {
  return {
    isPending: queries.isPending,
    isError: queries.isError,
    error: queries.error,
  };
}

vi.mock('@/hooks/use-content-blocks', () => ({
  useContentBlocks: () => ({
    ...base(),
    data: queries.isPending || queries.isError ? undefined : queries.draft,
    refetch: draftRefetch,
  }),
  usePublishedBlocks: () => ({
    ...base(),
    data: queries.isPending || queries.isError ? undefined : queries.published,
    refetch: publishedRefetch,
  }),
  useSitePublishToken: () => ({ ...base(), data: null, refetch: vi.fn() }),
  useUpsertContentBlock: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDeleteContentBlock: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDiscardDrafts: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useReorderBlocks: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/use-site-pages', () => ({
  sitePagesKey: (communityId: number) => ['pm', 'site', 'pages', communityId],
  applyPageOrder: (pages: unknown) => pages,
  useSitePages: () => ({
    data: queries.pagesPending || queries.pagesError ? undefined : queries.pages,
    isPending: queries.pagesPending,
    isError: queries.pagesError,
    error: queries.pagesErrorValue,
    refetch: pagesRefetch,
  }),
  useCreateSitePage: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useUpdateSitePage: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useReorderSitePages: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDeleteSitePage: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useUnstageSitePageDelete: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  queries.draft = [];
  queries.published = [];
  queries.pages = [HOME_PAGE];
  queries.isPending = false;
  queries.isError = false;
  queries.error = null;
  queries.pagesPending = false;
  queries.pagesError = false;
  queries.pagesErrorValue = null;
});

describe('useSiteDiff — never-published sites', () => {
  it('treats zero published rows as never-published, not as an empty site', () => {
    // The distinction `diffSite` can only draw from the argument it is given:
    // an empty snapshot would report firstPublish false and hide the fact that
    // everything on the page is new.
    queries.published = [];
    queries.draft = [hero({ isDraft: true, publishedAt: null })];

    const { result } = renderHook(() => useSiteDiff(42));

    expect(result.current.diff.firstPublish).toBe(true);
    expect(result.current.diff.changes.length).toBeGreaterThan(0);
  });

  it('reports a published site as not-first-publish', () => {
    queries.published = [hero(), block()];
    queries.draft = [hero(), block()];

    const { result } = renderHook(() => useSiteDiff(42));

    expect(result.current.diff.firstPublish).toBe(false);
  });
});

describe('useSiteDiff — change detection', () => {
  it('counts an edited section', () => {
    queries.published = [hero(), block({ id: 1 })];
    queries.draft = [
      hero(),
      block({
        id: 2,
        isDraft: true,
        publishedAt: null,
        content: { heading: 'Pool rules', body: 'No glass, and no diving.' },
      }),
    ];

    const { result } = renderHook(() => useSiteDiff(42));

    expect(result.current.diff.changes).toHaveLength(1);
  });

  it('reports no changes when the draft matches what is published', () => {
    // Row ids and `isDraft` differ; the CONTENT does not. A draft row that
    // says the same thing as the published row is not a change — this is the
    // case a naive `blocks.filter(b => b.isDraft).length` gets wrong.
    queries.published = [hero(), block({ id: 1 })];
    queries.draft = [hero(), block({ id: 2, isDraft: true, publishedAt: null })];

    const { result } = renderHook(() => useSiteDiff(42));

    expect(result.current.diff.changes).toHaveLength(0);
  });
});

// ── page-level changes (Phase 11b-3) ───────────────────────────────────────

describe('useSiteDiff — page changes', () => {
  it('reports a page that has never been published as added', () => {
    queries.published = [hero(), block({ id: 1 })];
    queries.draft = [hero(), block({ id: 1 })];
    queries.pages = [HOME_PAGE, { ...CONTACT_PAGE, isDraft: true, publishedAt: null }];

    const { result } = renderHook(() => useSiteDiff(42));

    const pageChanges = result.current.diff.changes.filter((c) => c.key.startsWith('page:'));
    expect(pageChanges).toHaveLength(1);
    expect(pageChanges[0]).toMatchObject({
      key: `page:${SECOND_PAGE_ID}`,
      kind: 'added',
      group: String(SECOND_PAGE_ID),
      title: 'Contact page',
    });
  });

  it('ignores the lazily-created draft home page on a never-published site', () => {
    // `ensureHomePage` creates home as a draft for any community that has never
    // published, and the RSC now calls `listSitePages` on every editor load —
    // so this row exists for a PM who has done nothing at all.
    //
    // `publishedPageBaseline` drops every draft page, so without the server's
    // exclusion this home reads as `added`: an untouched empty site claims one
    // pending change, `canOpenPublish` goes true, and the publish then throws
    // `NothingToPublishRollback` — "nothing left to publish" on the very click
    // the editor invited. The server has excluded it deliberately since
    // site-blocks-service.ts:677; this is the client saying the same thing.
    //
    // Every other home fixture in this file is `isDraft: false`, which is
    // exactly why nothing caught it.
    queries.published = [];
    queries.draft = [];
    queries.pages = [{ ...HOME_PAGE, isDraft: true, publishedAt: null }];

    const { result } = renderHook(() => useSiteDiff(42));

    expect(result.current.diff.changes.filter((c) => c.key.startsWith('page:'))).toHaveLength(0);
  });

  it('reports nothing for a draft home that is also staged for removal', () => {
    // Belt and braces from two independent directions, which is why the
    // exclusion above does not need a `deleteStaged` arm of its own: the filter
    // drops this row, and `diffPages` would ALSO treat it as a net non-event
    // (never published, already staged — publishing it neither creates nor
    // destroys anything a visitor could have seen). Pinned so that removing
    // either one does not silently start reporting a phantom change.
    queries.published = [];
    queries.draft = [];
    queries.pages = [
      { ...HOME_PAGE, isDraft: true, publishedAt: null, deleteStagedAt: '2026-07-30T09:00:00.000Z' },
    ];

    const { result } = renderHook(() => useSiteDiff(42));

    expect(result.current.diff.changes.filter((c) => c.key.startsWith('page:'))).toHaveLength(0);
  });

  it('reports a staged page removal, carrying the flag the undo affordance keys on', () => {
    queries.published = [hero(), block({ id: 1 })];
    queries.draft = [hero(), block({ id: 1 })];
    queries.pages = [HOME_PAGE, { ...CONTACT_PAGE, deleteStagedAt: '2026-07-30T09:00:00.000Z' }];

    const { result } = renderHook(() => useSiteDiff(42));

    const removal = result.current.diff.changes.find((c) => c.key === `page:${SECOND_PAGE_ID}`);
    expect(removal).toMatchObject({ kind: 'removed', group: String(SECOND_PAGE_ID) });
    expect(removal?.page?.deleteStaged).toBe(true);
    expect(removal?.page?.slug).toBe('contact');
  });

  it('keeps `keys` in step with the merged change list', () => {
    // Derived from the merged changes rather than concatenated from two key
    // arrays — the only form in which the two cannot disagree.
    //
    // The page change here is a genuinely NEW second page. This case previously
    // used a draft HOME page, which produced a `page:` key only because the
    // client diff was missing the server's draft-home exclusion — so it was
    // asserting the phantom change as though it were the feature. The property
    // under test is keys/changes agreement, and it needs a real page change, not
    // that particular one.
    queries.published = [];
    queries.draft = [hero({ isDraft: true, publishedAt: null })];
    queries.pages = [HOME_PAGE, { ...CONTACT_PAGE, isDraft: true, publishedAt: null }];

    const { result } = renderHook(() => useSiteDiff(42));

    expect(result.current.diff.keys).toEqual(result.current.diff.changes.map((c) => c.key));
    expect(result.current.diff.keys).toContain(`page:${SECOND_PAGE_ID}`);
  });

  it('exposes a label and a nav rank for each page group', () => {
    // `sortOrder: 7`, deliberately NOT 1. The rank is documented as the ARRAY
    // INDEX — the list already arrives home-first in nav order, so re-sorting
    // by the number the server already used would be redundant. With
    // `sortOrder` equal to the index (as every other fixture here has it), a
    // `sortOrder`-derived implementation passes this case unchanged, and the
    // decision the comment records goes unpinned.
    queries.pages = [HOME_PAGE, { ...CONTACT_PAGE, sortOrder: 7 }];

    const { result } = renderHook(() => useSiteDiff(42));

    expect(result.current.pageLabels.get(String(SECOND_PAGE_ID))).toBe('Contact');
    expect(result.current.pageRank.get(String(HOME_PAGE_ID))).toBe(0);
    expect(result.current.pageRank.get(String(SECOND_PAGE_ID))).toBe(1);
  });
});

// ── grouping ───────────────────────────────────────────────────────────────

describe('useSiteDiff — grouping changes by page', () => {
  it('files an added section under the page it was added to', () => {
    queries.published = [hero(), block({ id: 1 })];
    queries.draft = [
      hero(),
      block({ id: 1 }),
      block({
        id: 7,
        pageId: SECOND_PAGE_ID,
        blockOrder: 3,
        isDraft: true,
        publishedAt: null,
        content: { heading: 'Reach us', body: 'Front desk, 9-5.' },
      }),
    ];
    queries.pages = [HOME_PAGE, CONTACT_PAGE];

    const { result } = renderHook(() => useSiteDiff(42));

    const added = result.current.diff.changes.find((c) => c.kind === 'added');
    expect(added?.group).toBe(String(SECOND_PAGE_ID));
  });

  it('files a REMOVED section under its page, which only the published side knows', () => {
    // The regression guard for the union map. A removed section has no draft
    // row at all, so a slot→page map built from the draft list alone cannot see
    // it and would file the removal under the site-wide group — burying the one
    // change kind where "which page is losing this?" is the actual question.
    queries.published = [
      hero(),
      block({ id: 1 }),
      block({
        id: 8,
        pageId: SECOND_PAGE_ID,
        blockOrder: 3,
        content: { heading: 'Reach us', body: 'Front desk, 9-5.' },
      }),
    ];
    queries.draft = [hero(), block({ id: 1 })];
    queries.pages = [HOME_PAGE, CONTACT_PAGE];

    const { result } = renderHook(() => useSiteDiff(42));

    const removed = result.current.diff.changes.find((c) => c.kind === 'removed');
    expect(removed?.fromSlot).toBe(3);
    expect(removed?.group).toBe(String(SECOND_PAGE_ID));
  });

  it('falls back to the site-wide group for a block no page has claimed', () => {
    // `pageId: null` is a real server value — a pre-11b row no write path has
    // adopted yet. It must not throw and must not be attributed to a page.
    queries.published = [hero()];
    queries.draft = [
      hero(),
      block({ id: 9, pageId: null, blockOrder: 4, isDraft: true, publishedAt: null }),
    ];

    const { result } = renderHook(() => useSiteDiff(42));

    const added = result.current.diff.changes.find((c) => c.kind === 'added');
    expect(added?.group).toBe('site');
  });
});

describe('useSiteDiff — query states', () => {
  it('reports an empty diff while loading rather than a spurious one', () => {
    queries.isPending = true;

    const { result } = renderHook(() => useSiteDiff(42));

    expect(result.current.isPending).toBe(true);
    expect(result.current.diff.changes).toHaveLength(0);
  });

  it('surfaces the query error', () => {
    queries.isError = true;
    queries.error = new Error('Network is down');

    const { result } = renderHook(() => useSiteDiff(42));

    expect(result.current.isError).toBe(true);
    expect(result.current.error?.message).toBe('Network is down');
  });

  it('gates on the pages query too, rather than reviewing a publish without it', () => {
    // A staged page removal shows up NOWHERE else in the diff. Rendering the
    // sheet while the page list is missing would under-report an irreversible
    // action, which is worse than making the PM wait.
    queries.pagesPending = true;

    const { result } = renderHook(() => useSiteDiff(42));

    expect(result.current.isPending).toBe(true);
  });

  it('surfaces a pages-query failure instead of silently omitting page changes', () => {
    queries.pagesError = true;
    queries.pagesErrorValue = new Error('Pages unavailable');

    const { result } = renderHook(() => useSiteDiff(42));

    expect(result.current.isError).toBe(true);
    expect(result.current.error?.message).toBe('Pages unavailable');
  });

  it('refetches every side of the diff', () => {
    const { result } = renderHook(() => useSiteDiff(42));

    result.current.refetch();

    expect(draftRefetch).toHaveBeenCalledTimes(1);
    expect(publishedRefetch).toHaveBeenCalledTimes(1);
    expect(pagesRefetch).toHaveBeenCalledTimes(1);
  });
});
