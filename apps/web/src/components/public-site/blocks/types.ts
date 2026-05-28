/**
 * Block renderer prop types. Each block renderer is a server component
 * accepting these props and returning JSX.
 *
 * The block.content type is widened to unknown here — the registry consumer
 * narrows it per-renderer via the schema registry's safeParse before passing
 * the validated content into the renderer.
 */
import type { ReactNode } from 'react';
import type { BlockType } from '@propertypro/shared';

export interface PublicCommunity {
  id: number;
  slug: string;
  name: string;
  logoUrl: string | null;
  communityType: 'condo_718' | 'hoa_720' | 'apartment';
  city: string | null;
  state: string | null;
  timezone: string;
}

export interface ResolvedTheme {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  headingFont: string;
  bodyFont: string;
}

export const LAYOUT_IDS = ['tidewater', 'boulevard', 'sable'] as const;
export type LayoutId = (typeof LAYOUT_IDS)[number];

export interface BlockRendererProps<TContent = unknown> {
  block: {
    id: number;
    blockType: BlockType;
    blockOrder: number;
    content: TContent;
  };
  community: PublicCommunity;
  theme: ResolvedTheme;
  layout: LayoutId;
}

/** A block renderer is a React server component. */
export type BlockRenderer<TContent = unknown> = (
  props: BlockRendererProps<TContent>,
) => Promise<ReactNode> | ReactNode;
