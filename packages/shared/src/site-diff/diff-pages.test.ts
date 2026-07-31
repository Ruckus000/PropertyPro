/**
 * `diffPages` — the page-level half of the publish diff (Phase 11b-3).
 *
 * The cases that matter are the ones where set membership is NOT the answer: a
 * staged removal is present on both sides and is only visible through the flag,
 * and a page reorder is present on both sides and must stay invisible because
 * it is already live.
 */
import { describe, expect, it } from 'vitest';
import { diffPages, pageTitle, publishedPageBaseline } from './diff-pages';
import type { SitePageRow, SitePageSnapshot } from './types';

const home: SitePageSnapshot = {
  pageId: '1',
  name: 'Home',
  slug: '',
  isHome: true,
  inNav: true,
};
const about: SitePageSnapshot = {
  pageId: '2',
  name: 'About',
  slug: 'about',
  isHome: false,
  inNav: true,
};
const docs: SitePageSnapshot = {
  pageId: '3',
  name: 'Governing Documents',
  slug: 'governing-documents',
  isHome: false,
  inNav: true,
};

const row = (page: SitePageSnapshot, isDraft: boolean): SitePageRow => ({
  ...page,
  isDraft,
});

describe('diffPages', () => {
  it('reports nothing when the page set is unchanged', () => {
    expect(diffPages([home, about], [home, about])).toEqual([]);
  });

  it('reports a never-published page as added', () => {
    const changes = diffPages([home], [home, about]);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      key: 'page:2',
      kind: 'added',
      group: '2',
      title: 'About page',
      blockType: null,
      fromSlot: null,
      toSlot: null,
    });
    expect(changes[0]?.page).toEqual(about);
  });

  it('reports a staged removal, which is present on BOTH sides', () => {
    // The row still exists and is still live — `delete_staged_at` is the only
    // signal there is, so a membership-based diff would report nothing.
    const staged = { ...about, deleteStaged: true };
    const changes = diffPages([home, about], [home, staged]);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ key: 'page:2', kind: 'removed', group: '2' });
  });

  it('reports a published page that disappeared from the next side as removed', () => {
    const changes = diffPages([home, about], [home]);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ key: 'page:2', kind: 'removed' });
  });

  it('reports nothing for a never-published page that is also staged for removal', () => {
    // Publishing it neither creates nor destroys anything a visitor could see,
    // so naming it as a removal would name a page that never existed publicly.
    const changes = diffPages([home], [home, { ...about, deleteStaged: true }]);
    expect(changes).toEqual([]);
  });

  it('ignores deleteStaged on the published side', () => {
    // Staging is a pending change. A caller that leaked the flag onto the
    // baseline must not thereby report a removal that is not pending.
    const changes = diffPages([home, { ...about, deleteStaged: true }], [home, about]);
    expect(changes).toEqual([]);
  });

  it('does not report a page reorder — page sort order is live-immediate', () => {
    // Same set, different array order. Reporting this would tell the PM a
    // publish is pending for something that already went live when they saved.
    expect(diffPages([home, about, docs], [docs, about, home])).toEqual([]);
  });

  it('reports a changed name, slug, home flag or nav flag as an edit', () => {
    expect(diffPages([about], [{ ...about, name: 'About Us' }])[0]).toMatchObject({
      key: 'page:2',
      kind: 'edited',
    });
    expect(diffPages([about], [{ ...about, slug: 'about-us' }])[0]).toMatchObject({
      kind: 'edited',
    });
    expect(diffPages([about], [{ ...about, isHome: true }])[0]).toMatchObject({
      kind: 'edited',
    });
    expect(diffPages([about], [{ ...about, inNav: false }])[0]).toMatchObject({
      kind: 'edited',
    });
  });

  it('prefers a staged removal over an edit for the same page', () => {
    const changes = diffPages([about], [{ ...about, name: 'Renamed', deleteStaged: true }]);
    expect(changes).toHaveLength(1);
    expect(changes[0]?.kind).toBe('removed');
  });

  it('treats an empty published side as a first publish of every page', () => {
    const changes = diffPages([], [home, about]);
    expect(changes.map((c) => c.kind)).toEqual(['added', 'added']);
  });

  it('emits changes in next order, with next-side-absent removals last', () => {
    const changes = diffPages([home, about], [home, docs]);
    expect(changes.map((c) => c.key)).toEqual(['page:3', 'page:2']);
  });

  it('keys and groups a page change by its page id', () => {
    // The review sheet groups by `group`; a page's own creation must land in
    // that page's bucket, not in a separate site-wide one.
    const changes = diffPages([], [about]);
    expect(changes[0]?.key).toBe(`page:${about.pageId}`);
    expect(changes[0]?.group).toBe(about.pageId);
  });
});

describe('publishedPageBaseline', () => {
  it('keeps only the published rows', () => {
    const baseline = publishedPageBaseline([row(home, false), row(about, true)]);
    expect(baseline).toEqual([home]);
  });

  it('strips deleteStaged so a staged page is still on the published side', () => {
    const baseline = publishedPageBaseline([
      { ...row(about, false), deleteStaged: true },
    ]);
    expect(baseline[0]).toEqual(about);
    expect(baseline[0]).not.toHaveProperty('deleteStaged');
  });

  it('round-trips with diffPages to report exactly the staged and draft pages', () => {
    // The end-to-end shape S7 consumes: one live page, one brand-new page, one
    // live page staged for removal.
    const rows: SitePageRow[] = [
      row(home, false),
      row(about, true),
      { ...row(docs, false), deleteStaged: true },
    ];
    const changes = diffPages(publishedPageBaseline(rows), rows);
    expect(changes.map((c) => [c.key, c.kind])).toEqual([
      ['page:2', 'added'],
      ['page:3', 'removed'],
    ]);
  });
});

describe('pageTitle', () => {
  it('uses the page name', () => {
    expect(pageTitle(about)).toBe('About');
  });

  it('falls back to something identifiable when the name is blank', () => {
    // An empty name is a publish-blocking error, and the row reporting it is
    // the one row a PM must be able to find.
    expect(pageTitle({ ...home, name: '   ' })).toBe('Home');
    expect(pageTitle({ ...about, name: '' })).toBe('/about');
    expect(pageTitle({ name: '', slug: '', isHome: false })).toBe('Untitled page');
  });
});
