/**
 * Layout component prop types and the LayoutId union.
 *
 * A layout component owns the page chrome (header, footer, hero treatment,
 * section spacing, typography rhythm) and renders an ordered list of blocks
 * via the block renderer registry.
 */
import type { ReactNode } from 'react';
import type { PublicCommunity, ResolvedTheme, LayoutId } from '../blocks/types';
import { LAYOUT_IDS } from '../blocks/types';

export { LAYOUT_IDS };
export type { LayoutId };

export interface SiteBlock {
  id: number;
  blockType: string;
  blockOrder: number;
  content: unknown;
}

/**
 * Website editor v3, Phase 8 — PM-authored footer fields.
 *
 * Structurally identical to `SiteFooterSettings` in
 * `@/lib/site-editor/site-settings`, restated here so this module stays a pure
 * prop-type declaration with no dependency on the settings layer — the same
 * reason `PublicCommunity` and `ResolvedTheme` are declared rather than
 * imported from the services that produce them.
 */
export interface SiteFooter {
  associationName: string | null;
  note: string | null;
  showStatutoryLine: boolean;
}

/**
 * Website editor v3, Phase 11b-2 — one entry in the public page nav.
 *
 * Structurally identical to `PublicNavPage` in `@/lib/db/public-community-reader`,
 * restated here for the same reason `SiteFooter` and `PublicCommunity` are: this
 * module stays a pure prop-type declaration with no dependency on the data layer
 * that produces the values.
 *
 * `slug` is `''` for the home page.
 */
export interface SiteNavItem {
  id: number;
  name: string;
  slug: string;
  isHome: boolean;
}

/**
 * The public page nav plus which page is being rendered.
 *
 * `currentSlug` is `''` on the home page, so it compares directly against
 * `SiteNavItem.slug` — there is no separate "is home" comparison to get wrong.
 */
export interface SiteNav {
  items: SiteNavItem[];
  currentSlug: string;
}

/**
 * Which page is being rendered (Phase 11b-2).
 *
 * Only supplied for a NON-home page: the home render path never loads the page
 * row (it only needs the id, via `getHomePageId`). Layouts use this for the
 * empty-state `<h1>` — a sub-page cannot own a hero block (block_order is
 * community-wide until 11c, so slot 1 belongs to home), and without this the
 * empty-state hero would headline every sub-page with the community's name.
 */
export interface SitePageContext {
  name: string;
  isHome: boolean;
}

export interface LayoutProps {
  community: PublicCommunity;
  theme: ResolvedTheme;
  blocks: SiteBlock[];
  /**
   * Optional: a caller with no branding to hand gets the pre-Phase-8 footer.
   * Kept optional deliberately — test files are outside the typecheck scope
   * (`apps/web/tsconfig.json` includes only `src/**`), so a required prop would
   * surface as a runtime failure in the layout tests rather than a type error.
   */
  footer?: SiteFooter;
  /**
   * Optional for the same reason `footer` is — see above. Absent means "no page
   * nav", which is also the correct render for every community that exists
   * today (exactly one page each).
   */
  nav?: SiteNav;
  /** Optional; absent means the home page. See `SitePageContext`. */
  page?: SitePageContext;
}

export type LayoutComponent = (
  props: LayoutProps,
) => Promise<ReactNode> | ReactNode;
