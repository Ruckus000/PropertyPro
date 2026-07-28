/**
 * Block renderer registry — maps BlockType to its React server component.
 *
 * Empty in PR #1a. Populated incrementally:
 *   - PR #1b: hero
 *   - PR #2: text, image
 *   - PR #3: announcements
 *   - PR #4: documents, meetings, contact
 *   - PR #10b: faq, gallery, amenities (Pro+ polish blocks)
 *
 * Once a block type has both a schema entry AND a renderer entry, it is
 * "live" — the page renderer in PR #1b+ uses the registry to dispatch.
 *
 * Unknown block types in a community's site_blocks row are skipped at render
 * time by each layout's `hasRenderer` guard. That skip is silent by itself —
 * the reporting lives one level up, in `reportDegradedBlocks`
 * (`@/lib/telemetry/site-block-render`), which the public-site page calls once
 * per request with the whole block list and which emits a single
 * `public_site_blocks_degraded` warning covering both unrenderable types and
 * content that fails its schema.
 *
 * Until 2026-07 this comment claimed the skip itself emitted a Sentry warning
 * named `block-type-missing-renderer`. It did not: no such call, and no such
 * string, existed anywhere in the repo. If you move the reporting, fix this
 * paragraph with it — a comment describing observability that isn't there is
 * worse than no comment, because it stops anyone from looking.
 */
import type { BlockType } from '@propertypro/shared';
import type { BlockRenderer } from './types';
import { HeroBlock } from './HeroBlock';
import { TextBlock } from './TextBlock';
import { ImageBlock } from './ImageBlock';
import { AnnouncementsBlock } from './AnnouncementsBlock';
import { DocumentsBlock } from './DocumentsBlock';
import { MeetingsBlock } from './MeetingsBlock';
import { ContactBlock } from './ContactBlock';
import { FaqBlock } from './FaqBlock';
import { GalleryBlock } from './GalleryBlock';
import { AmenitiesBlock } from './AmenitiesBlock';
import { PaymentsBlock } from './PaymentsBlock';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const blockRendererRegistry: Partial<Record<BlockType, BlockRenderer<any>>> = {
  hero: HeroBlock,
  text: TextBlock,
  image: ImageBlock,
  announcements: AnnouncementsBlock,
  documents: DocumentsBlock,
  meetings: MeetingsBlock,
  contact: ContactBlock,
  faq: FaqBlock,
  gallery: GalleryBlock,
  amenities: AmenitiesBlock,
  payments: PaymentsBlock,
};

/**
 * Takes `string`, not `BlockType`, on purpose.
 *
 * `site_blocks.block_type` is a `text` column guarded by a CHECK constraint,
 * not a pgEnum, and the rows predate several of the current types. The whole
 * job of this function is to answer "is this value one we can render?" — so
 * narrowing the parameter to `BlockType` would assume the answer at the type
 * level and make the unrenderable case, the only case worth asking about,
 * unrepresentable.
 */
export function hasRenderer(blockType: string): boolean {
  return blockType in blockRendererRegistry;
}
