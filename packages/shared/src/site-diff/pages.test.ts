/**
 * `pageIssues` — the cross-page publish gate (Phase 11b).
 *
 * These are the rules that no single page can see on its own, which is why they
 * live outside `siteIssues`. The security-relevant one is RESERVED: a community
 * subdomain also serves the authenticated app, so a page at `/documents` is
 * shadowed by the app route forever.
 */
import { describe, expect, it } from 'vitest';
import { pageIssues } from './pages';
import { publishBlocked } from './validate';

const home = { pageId: '1', name: 'Home', slug: '', isHome: true, isDraft: false };
const about = { pageId: '2', name: 'About', slug: 'about', isHome: false, isDraft: false };

/** Stand-in for `isReservedPublicSlug`, which lives in apps/web. */
const isReserved = (slug: string) => slug === 'documents' || slug === 'dashboard';

describe('pageIssues', () => {
  it('accepts a well-formed page set', () => {
    expect(pageIssues({ pages: [home, about], isReserved })).toEqual([]);
  });

  it('errors when there is no home page', () => {
    const issues = pageIssues({ pages: [about], isReserved });
    expect(publishBlocked(issues)).toBe(true);
    expect(issues[0]?.field).toBe('pages.home');
  });

  it('errors when two pages both claim to be home', () => {
    const issues = pageIssues({
      pages: [home, { ...about, isHome: true, slug: '' }],
      isReserved,
    });
    expect(publishBlocked(issues)).toBe(true);
    expect(issues.some((i) => i.field === 'pages.home')).toBe(true);
  });

  it('errors when a page claims a slug reserved by an app route', () => {
    const issues = pageIssues({
      pages: [home, { ...about, slug: 'documents' }],
      isReserved,
    });
    expect(publishBlocked(issues)).toBe(true);
    expect(issues.some((i) => i.message.includes('resident portal'))).toBe(true);
  });

  it('skips the reserved check when no predicate is supplied', () => {
    // The editor may not hold the list; the SERVER-side gate always passes it,
    // and that is the one that matters. Silently passing here beats importing a
    // duplicate list into this package.
    expect(pageIssues({ pages: [home, { ...about, slug: 'documents' }] })).toEqual([]);
  });

  it('errors on two pages at the same address', () => {
    const issues = pageIssues({
      pages: [home, about, { ...about, pageId: '3' }],
      isReserved,
    });
    expect(publishBlocked(issues)).toBe(true);
    expect(issues.some((i) => i.message.includes('already uses "/about"'))).toBe(true);
  });

  it('errors on two pages with the same name, case-insensitively', () => {
    // Names are the nav labels, so two identical ones are indistinguishable to a
    // visitor even when the addresses differ.
    const issues = pageIssues({
      pages: [home, about, { pageId: '3', name: 'ABOUT', slug: 'about-us', isHome: false }],
      isReserved,
    });
    expect(issues.some((i) => i.field === 'page:3.name')).toBe(true);
  });

  it('errors on a malformed slug', () => {
    for (const slug of ['..', 'Docs', 'has space', 'trailing/slash', '-leading']) {
      const issues = pageIssues({
        pages: [home, { ...about, slug }],
        isReserved,
      });
      expect(publishBlocked(issues), `slug ${JSON.stringify(slug)} should be rejected`).toBe(true);
    }
  });

  it('errors when a page claims an address a redirect still holds for ANOTHER page', () => {
    const issues = pageIssues({
      pages: [home, about],
      retiredSlugs: [{ slug: 'about', pageId: '9' }],
      isReserved,
    });
    expect(publishBlocked(issues)).toBe(true);
    expect(issues.some((i) => i.message.includes('used to live at "/about"'))).toBe(true);
  });

  it('ALLOWS a page reclaiming its own former address', () => {
    // Rename `/about` → `/about-us`, then change your mind. The redirect being
    // reclaimed is the one this page itself left behind, so this is an undo, not
    // a hijack — and treating it as an error would make the undo permanently
    // impossible AND block every subsequent publish.
    expect(
      pageIssues({
        pages: [home, about],
        retiredSlugs: [{ slug: 'about', pageId: '2' }],
        isReserved,
      }),
    ).toEqual([]);
  });

  it('ignores a page staged for removal', () => {
    // It is about to stop existing; holding the publish on its address would
    // make a broken page impossible to delete.
    const issues = pageIssues({
      pages: [home, { ...about, slug: 'documents', deleteStaged: true }],
      isReserved,
    });
    expect(issues).toEqual([]);
  });

  describe('a staged page and its address (reserveStagedSlugs)', () => {
    const stagedAbout = { ...about, deleteStaged: true };
    const replacement = {
      pageId: '3',
      name: 'About us',
      slug: 'about',
      isHome: false,
      isDraft: true,
    };

    it('by default leaves the address free — the publish gate, where the page is leaving', () => {
      // Unchanged behaviour, pinned. `publishCommunitySite` asks whether the
      // set about to go live is valid, and a staged page is not in it.
      expect(pageIssues({ pages: [home, stagedAbout, replacement], isReserved })).toEqual([]);
    });

    it('reserves the address when asked — an editor form, where the row is still live', () => {
      // `site_pages_community_slug_partial` is unique on
      // `(community_id, slug) WHERE deleted_at IS NULL`, and a staged page has
      // `deleted_at` still NULL. So the server refuses this slug, and a form
      // that said otherwise would enable a Save that 400s.
      const issues = pageIssues({
        pages: [home, stagedAbout, replacement],
        isReserved,
        reserveStagedSlugs: true,
      });
      expect(issues).toHaveLength(1);
      expect(issues[0]?.pageId).toBe('3');
      expect(issues[0]?.field).toBe('page:3.slug');
      expect(issues[0]?.message).toMatch(/staged for removal/);
    });

    it('does not accuse the staged page of clashing with itself', () => {
      expect(
        pageIssues({ pages: [home, stagedAbout], isReserved, reserveStagedSlugs: true }),
      ).toEqual([]);
    });

    it('still does not VALIDATE the staged page, even while reserving its address', () => {
      // The two concerns stay separate: a page with a reserved slug must remain
      // deletable, so reserving its address must not resurrect its own errors.
      expect(
        pageIssues({
          pages: [home, { ...about, slug: 'documents', deleteStaged: true }],
          isReserved,
          reserveStagedSlugs: true,
        }),
      ).toEqual([]);
    });

    it('leaves the staged page NAME free — names have no unique index', () => {
      // The asymmetry with slugs is deliberate. `assertNameAvailable` skips
      // staged pages on the server, so the form must not invent a clash.
      expect(
        pageIssues({
          pages: [home, stagedAbout, { ...replacement, slug: 'about-us', name: 'About' }],
          isReserved,
          reserveStagedSlugs: true,
        }),
      ).toEqual([]);
    });
  });

  it('carries pageId on every page-specific issue so the review sheet can group', () => {
    const issues = pageIssues({
      pages: [home, { ...about, slug: 'documents' }],
      isReserved,
    });
    expect(issues[0]?.pageId).toBe('2');
    expect(issues[0]?.field.startsWith('page:2.')).toBe(true);
  });

  it('does not complain about the home page having an empty slug', () => {
    // The root address is empty BY DESIGN; the non-home rules must not fire on it.
    expect(pageIssues({ pages: [home], isReserved })).toEqual([]);
  });

  it('errors when the home page is not at the root', () => {
    const issues = pageIssues({
      pages: [{ ...home, slug: 'welcome' }],
      isReserved,
    });
    expect(publishBlocked(issues)).toBe(true);
    expect(issues.some((i) => i.message.includes('site root'))).toBe(true);
  });
});
