import { heroBlockSchema } from '@propertypro/shared';
import type { SiteBlock } from './types';

/**
 * Whether the page's block list carries a hero that will actually RENDER.
 *
 * Mirrors HeroBlock's own validation. If a hero row exists but its content
 * fails the schema, HeroBlock returns null — so a presence-only check would
 * suppress the layout's empty-state hero AND render nothing, leaving the page
 * without an `<h1>` (the heading-hierarchy invariant in layouts/README.md).
 *
 * One function for all three layouts. Boulevard and Sable used to test presence
 * only, so a malformed hero cost them their `<h1>` while Tidewater kept its own.
 */
export function hasHeroBlock(blocks: readonly SiteBlock[]): boolean {
  return blocks.some(
    (b) => b.blockType === 'hero' && heroBlockSchema.safeParse(b.content).success,
  );
}
