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

export interface LayoutProps {
  community: PublicCommunity;
  theme: ResolvedTheme;
  blocks: SiteBlock[];
}

export type LayoutComponent = (
  props: LayoutProps,
) => Promise<ReactNode> | ReactNode;
