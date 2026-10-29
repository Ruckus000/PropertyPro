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
  /** Everyday form of `name` for headlines; null when the community has not set one. */
  shortName: string | null;
  logoUrl: string | null;
  communityType: 'condo_718' | 'hoa_720' | 'apartment';
  city: string | null;
  state: string | null;
  /**
   * Units (condo) or parcels (HOA). Null is "not known", never zero; only a
   * positive whole number resolves `{{units}}`.
   */
  unitCount: number | null;
  timezone: string;
}

export interface ResolvedTheme {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  headingFont: string;
  bodyFont: string;
}

/**
 * The three legacy layouts, then the four looks (D2: a look's id is its layout's
 * id). How a look draws itself is `LOOK_STYLES` in `../layouts/look-styles`.
 */
export const LAYOUT_IDS = [
  'tidewater',
  'boulevard',
  'sable',
  'bayfront',
  'heritage',
  'palm-grove',
  'plain-simple',
] as const;
export type LayoutId = (typeof LAYOUT_IDS)[number];

/** One section of the page being rendered, as the layouts hand it to each block. */
export interface PageSection {
  id: number;
  blockType: string;
  content: unknown;
}

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
  /**
   * The id this section's root element takes, so a Quick links link can land
   * on it (`#meetings`). Set by the layouts on the first section of each data
   * type only, so an id never repeats on a page (see `./page-sections`). The
   * editor canvas never sets it: it renders no anchors.
   */
  anchorId?: string;
  /**
   * Every section on this page, in the order visitors see them. Set by the
   * layouts; Quick links reads it to tell which of its links have a section to
   * land on. Absent anywhere else, where Quick links shows only Owner documents.
   */
  pageSections?: readonly PageSection[];
}

/** A block renderer is a React server component. */
export type BlockRenderer<TContent = unknown> = (
  props: BlockRendererProps<TContent>,
) => Promise<ReactNode> | ReactNode;

/**
 * Props for a presentational block *view*.
 *
 * The data-driven blocks (announcements, documents, meetings, contact, quick
 * links, board members) are split in two: an async server shell that validates
 * content and fetches, and a pure view that renders what it is given. The split exists so
 * the editor canvas can render the real published markup — a view is a plain
 * synchronous component, an async server component is not renderable inside a
 * client tree that updates on every keystroke.
 *
 * **Views must stay hook-free, synchronous and prop-driven.** Adding data
 * access, `async`, or a hook to a view silently breaks the editor canvas while
 * leaving the public site working, so the failure shows up nowhere near the
 * change. The authored blocks (hero, text, image, faq, gallery, amenities) are
 * already pure and need no split.
 */
export interface BlockViewProps<TContent, TData> {
  /** Used for the heading id that `aria-labelledby` points at. */
  blockId: number;
  content: TContent;
  data: TData;
  community: PublicCommunity;
  /** The root `<section>`'s id on the public site; see `BlockRendererProps.anchorId`. */
  anchorId?: string;
}
