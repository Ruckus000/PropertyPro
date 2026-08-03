/**
 * `blocksForPage` — the page filter that keeps a second page's edits off the
 * live home page (Phase 11b-3, D13′).
 *
 * The throw case is the point of the file. `apps/web/tsconfig.json` includes
 * only `src/**`, so nothing type-checks these fixtures: without a runtime
 * assertion a block literal that predates `pageId` would just quietly disappear
 * from the canvas, which looks exactly like the data loss this slice exists to
 * prevent.
 */
import { describe, it, expect } from 'vitest';
import { blocksForPage, type PageScopedBlock } from '@/lib/site-editor/blocks-for-page';

interface Row extends PageScopedBlock {
  blockOrder: number;
}

const row = (id: number, pageId: number | null, blockOrder = id): Row => ({
  id,
  pageId,
  blockOrder,
});

describe('blocksForPage', () => {
  it('keeps only the blocks belonging to the requested page', () => {
    const blocks = [row(1, 10), row(2, 20), row(3, 10), row(4, 30)];
    expect(blocksForPage(blocks, 10).map((b) => b.id)).toEqual([1, 3]);
    expect(blocksForPage(blocks, 20).map((b) => b.id)).toEqual([2]);
  });

  it('returns an empty list for a page that holds nothing', () => {
    expect(blocksForPage([row(1, 10)], 99)).toEqual([]);
  });

  it('preserves input order rather than re-sorting', () => {
    const blocks = [row(3, 10, 8), row(1, 10, 2), row(2, 10, 5)];
    expect(blocksForPage(blocks, 10).map((b) => b.id)).toEqual([3, 1, 2]);
  });

  it('returns the whole list unfiltered when no page is selected', () => {
    const blocks = [row(1, 10), row(2, 20), row(3, null)];
    expect(blocksForPage(blocks, null).map((b) => b.id)).toEqual([1, 2, 3]);
  });

  it('does not mutate or alias the input when unfiltered', () => {
    const blocks = [row(1, 10)];
    const result = blocksForPage(blocks, null);
    expect(result).not.toBe(blocks);
    expect(result).toEqual(blocks);
  });

  it('tolerates an absent list', () => {
    expect(blocksForPage(undefined, 10)).toEqual([]);
    expect(blocksForPage(null, null)).toEqual([]);
  });

  it('excludes an unadopted (null pageId) block from a page-scoped list', () => {
    // Folding it in would render one row on every page and let an edit made on
    // page B rewrite it — the cross-page write this slice exists to stop.
    // A page-list read adopts the row onto home, so the state is transient.
    expect(blocksForPage([row(1, null), row(2, 10)], 10).map((b) => b.id)).toEqual([2]);
  });

  it('throws on a block with an undefined pageId', () => {
    const stale = [{ id: 7, blockOrder: 3 } as unknown as Row];
    expect(() => blocksForPage(stale, 10)).toThrow(/block 7 has an undefined pageId/);
  });

  it('throws on a stale block even when no page is selected', () => {
    // Validated before the unfiltered short-circuit on purpose: a stale fixture
    // must fail on every path, not only the page-scoped ones.
    const stale = [row(1, 10), { id: 7, blockOrder: 3 } as unknown as Row];
    expect(() => blocksForPage(stale, null)).toThrow(/block 7 has an undefined pageId/);
  });
});
