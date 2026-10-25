import { describe, expect, it } from 'vitest';
import { navForEditor, type EditorNavPage } from '@/lib/site-editor/editor-nav';

const page = (over: Partial<EditorNavPage> & Pick<EditorNavPage, 'id' | 'name' | 'slug'>): EditorNavPage => ({
  isHome: false,
  inNav: true,
  deleteStagedAt: null,
  ...over,
});

const HOME = page({ id: 1, name: 'Home', slug: '', isHome: true });
const ABOUT = page({ id: 2, name: 'About', slug: 'about' });
const HIDDEN = page({ id: 3, name: 'Board only', slug: 'board', inNav: false });
const STAGED = page({ id: 4, name: 'Old news', slug: 'old', deleteStagedAt: '2026-10-01T00:00:00Z' });

describe('navForEditor', () => {
  it('projects the page list the way the public nav does: in-nav pages, in list order', () => {
    const nav = navForEditor([HOME, ABOUT, HIDDEN], 1);
    expect(nav.items.map((i) => i.id)).toEqual([1, 2]);
    expect(nav.items[0]).toEqual({ id: 1, name: 'Home', slug: '', isHome: true });
  });

  it('drops a page staged for removal — publishing deletes it', () => {
    const nav = navForEditor([HOME, STAGED, ABOUT], 1);
    expect(nav.items.map((i) => i.id)).toEqual([1, 2]);
  });

  it('keeps an unpublished page that is in the nav — publishing puts its link there', () => {
    // No `isDraft` field is consulted at all; this pins that a draft flag on
    // the input cannot remove the page.
    const draft = { ...ABOUT, isDraft: true } as EditorNavPage & { isDraft: boolean };
    expect(navForEditor([HOME, draft], 1).items.map((i) => i.id)).toEqual([1, 2]);
  });

  it("marks the page being edited as current by its slug, '' for home or no selection", () => {
    expect(navForEditor([HOME, ABOUT], 2).currentSlug).toBe('about');
    expect(navForEditor([HOME, ABOUT], 1).currentSlug).toBe('');
    expect(navForEditor([HOME, ABOUT], null).currentSlug).toBe('');
    // A selected page that is NOT in the nav is still the current page.
    expect(navForEditor([HOME, HIDDEN], 3).currentSlug).toBe('board');
  });
});
