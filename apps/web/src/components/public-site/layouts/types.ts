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
}

export type LayoutComponent = (
  props: LayoutProps,
) => Promise<ReactNode> | ReactNode;
