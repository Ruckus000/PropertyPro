/**
 * Block renderer registry — maps BlockType to its React server component.
 *
 * Empty in PR #1a. Populated incrementally:
 *   - PR #1b: hero
 *   - PR #2: text, image
 *   - PR #3: announcements
 *   - PR #4: documents, meetings, contact
 *
 * Once a block type has both a schema entry AND a renderer entry, it is
 * "live" — the page renderer in PR #1b+ uses the registry to dispatch.
 *
 * Unknown block types in a community's site_blocks row are skipped at
 * render time with a Sentry warning (block-type-missing-renderer).
 */
import type { BlockType } from '@propertypro/shared';
import type { BlockRenderer } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const blockRendererRegistry: Partial<Record<BlockType, BlockRenderer<any>>> = {
  // populated in PR #1b and beyond
};

/**
 * Returns true if a renderer is registered for the given block type.
 */
export function hasRenderer(blockType: BlockType): boolean {
  return blockType in blockRendererRegistry;
}
