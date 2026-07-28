/**
 * The shared change model.
 *
 * The assertions here are about the two things a component test reads straight
 * past: that "never published" is expressed as `null` rather than an empty
 * snapshot (an empty one reports the wrong `firstPublish`), and that a
 * still-loading query yields an empty diff rather than a spurious one.
 *
 * `@/hooks/use-content-blocks` is mocked COMPLETELY — a partial factory fails
 * only at module load for whichever component reaches the missing export, and
 * reads as an unrelated component breaking. `diffSite`/`toSnapshot` are the
 * REAL implementations: mocking them would leave nothing under test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSiteDiff } from '@/components/pm/site-editor-v3/use-site-diff';
import type { SiteBlockSummary } from '@/hooks/use-content-blocks';

function block(overrides: Partial<SiteBlockSummary> = {}): SiteBlockSummary {
  return {
    id: 1,
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

const queries = vi.hoisted(() => ({
  draft: [] as SiteBlockSummary[],
  published: [] as SiteBlockSummary[],
  isPending: false,
  isError: false,
  error: null as Error | null,
}));

const draftRefetch = vi.hoisted(() => vi.fn());
const publishedRefetch = vi.hoisted(() => vi.fn());

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

beforeEach(() => {
  vi.clearAllMocks();
  queries.draft = [];
  queries.published = [];
  queries.isPending = false;
  queries.isError = false;
  queries.error = null;
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

  it('refetches both sides of the diff', () => {
    const { result } = renderHook(() => useSiteDiff(42));

    result.current.refetch();

    expect(draftRefetch).toHaveBeenCalledTimes(1);
    expect(publishedRefetch).toHaveBeenCalledTimes(1);
  });
});
