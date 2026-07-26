/**
 * Block VIEW registry — the client-safe counterpart to `./registry.ts`.
 *
 * `blockRendererRegistry` maps a block type to the component the *public site*
 * renders. Four of those entries are async server components that query the DB
 * inside themselves (announcements, documents, meetings, contact), so that
 * registry cannot be used from the editor canvas, which is a client tree that
 * re-renders on every keystroke.
 *
 * This registry maps the same block types to their **pure, synchronous view**:
 *
 *   - the four system-of-record types resolve to the `*BlockView` component
 *     extracted in Phase 2a, which takes its rows as a prop;
 *   - the six authored types (hero, text, image, faq, gallery, amenities) were
 *     already pure and resolve to the very same component the public site uses.
 *
 * So there is exactly one presentational component per block type. The canvas
 * and the public site cannot drift, because there is nothing to drift from.
 *
 * ## Rules for anything reachable from here
 *
 * 1. **No `async`.** A component in this registry is rendered synchronously.
 * 2. **No data access.** Rows arrive as props; the canvas supplies them.
 * 3. **No Node built-ins, directly or transitively.** This is the one that
 *    bites silently: `@/lib/site-assets/storage-paths` imports `node:crypto`,
 *    so importing it from a view passes typecheck AND tests and then fails at
 *    `next build`. Use `@/lib/site-assets/public-url` instead — it exists for
 *    exactly this reason.
 *
 * Breaking any of these leaves the public site working while breaking the
 * editor, so the symptom appears far from the change that caused it.
 */
import type { BlockType } from '@propertypro/shared';
import type { ComponentType } from 'react';

import { HeroBlock } from './HeroBlock';
import { TextBlock } from './TextBlock';
import { ImageBlock } from './ImageBlock';
import { FaqBlock } from './FaqBlock';
import { GalleryBlock } from './GalleryBlock';
import { AmenitiesBlock } from './AmenitiesBlock';

import { AnnouncementsBlockView } from './AnnouncementsBlockView';
import { DocumentsBlockView } from './DocumentsBlockView';
import { MeetingsBlockView } from './MeetingsBlockView';
import { ContactBlockView } from './ContactBlockView';

/**
 * Which shape a block type's view expects.
 *
 * `renderer` views take the full `BlockRendererProps` (block/community/theme/
 * layout) — they are the original components. `view` views take
 * `BlockViewProps` (blockId/content/data/community) and need data supplied.
 * The canvas branches on this rather than guessing from the block type.
 */
export const BLOCK_VIEW_KINDS = {
  hero: 'renderer',
  text: 'renderer',
  image: 'renderer',
  faq: 'renderer',
  gallery: 'renderer',
  amenities: 'renderer',
  announcements: 'view',
  documents: 'view',
  meetings: 'view',
  contact: 'view',
} as const satisfies Partial<Record<BlockType, 'renderer' | 'view'>>;

export type BlockViewKind = (typeof BLOCK_VIEW_KINDS)[keyof typeof BLOCK_VIEW_KINDS];

/** True when this block type needs system-of-record rows supplied to its view. */
export function isDataDrivenBlock(
  blockType: BlockType,
): blockType is keyof typeof BLOCK_VIEW_KINDS {
  return BLOCK_VIEW_KINDS[blockType as keyof typeof BLOCK_VIEW_KINDS] === 'view';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const blockViewRegistry: Partial<Record<BlockType, ComponentType<any>>> = {
  hero: HeroBlock,
  text: TextBlock,
  image: ImageBlock,
  faq: FaqBlock,
  gallery: GalleryBlock,
  amenities: AmenitiesBlock,
  announcements: AnnouncementsBlockView,
  documents: DocumentsBlockView,
  meetings: MeetingsBlockView,
  contact: ContactBlockView,
};

/** Whether the canvas can render this block type at all. */
export function hasView(blockType: BlockType): boolean {
  return blockViewRegistry[blockType] !== undefined;
}
