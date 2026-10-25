/**
 * The page nav the editor canvas shows, from the editor's own page list.
 *
 * The public nav is a projection of the pages: `listNavPages` keeps rows that
 * are published, `in_nav`, and not deleted (`public-community-reader.ts`). The
 * canvas shows the site as the next publish will make it, so it projects the
 * same way with two deliberate differences:
 *
 *  - a page that has never been published is INCLUDED when it is in the nav.
 *    Publishing promotes its blocks and the page with them, so that is where
 *    the link will be once the PM publishes — which is what the canvas claims
 *    to show. (The Pages panel's own copy is about the LIVE site and says the
 *    opposite, correctly, for its purpose.)
 *  - a page staged for removal is EXCLUDED, because publishing deletes it.
 *
 * Order is the list's order: home first, then nav order — `listSitePages` and
 * `listNavPages` sort identically, by design.
 */
import type { SiteNav } from '@/components/public-site/layouts/types';

export interface EditorNavPage {
  id: number;
  name: string;
  /** `''` for the home page. */
  slug: string;
  isHome: boolean;
  inNav: boolean;
  deleteStagedAt: string | null;
}

export function navForEditor(
  pages: readonly EditorNavPage[],
  selectedPageId: number | null,
): SiteNav {
  const items = pages
    .filter((page) => page.inNav && page.deleteStagedAt === null)
    .map(({ id, name, slug, isHome }) => ({ id, name, slug, isHome }));
  const current = selectedPageId === null ? undefined : pages.find((p) => p.id === selectedPageId);
  return { items, currentSlug: current?.slug ?? '' };
}
