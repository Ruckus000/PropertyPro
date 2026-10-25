import { blockRendererRegistry, hasRenderer } from '@/components/public-site/blocks/registry';
import type { BlockType } from '@propertypro/shared';
import { SiteChrome } from './SiteChrome';
import { hasHeroBlock } from './has-hero-block';
import type { LayoutProps } from './types';

/**
 * Tidewater — the condo default. Its chrome (header, empty-state hero, footer,
 * block-list treatment) lives in `SiteChrome`, shared with the editor canvas so
 * the canvas shows this layout rather than a bare stack of blocks.
 */
export function Tidewater({ community, theme, blocks, footer, nav, page }: LayoutProps) {
  const ordered = [...blocks].sort((a, b) => a.blockOrder - b.blockOrder);
  // D18 — a non-home page cannot own a hero block (block_order is
  // community-wide until 11c, so slot 1 belongs to the home page), which means
  // the empty-state hero is the only <h1> a sub-page gets. Headline it with the
  // page's own name rather than the community's.
  const heroHeading = page && !page.isHome ? page.name : community.name;

  return (
    <SiteChrome
      layout="tidewater"
      community={community}
      theme={theme}
      footer={footer}
      nav={nav}
      emptyHeroHeading={hasHeroBlock(ordered) ? null : heroHeading}
    >
      {ordered.map((block) => {
        const blockType = block.blockType as BlockType;
        if (!hasRenderer(blockType)) {
          // Unknown block type — skip. Reported at the page level by
          // `reportDegradedBlocks`, which sees the whole block list and emits
          // one `public_site_blocks_degraded` warning per request. Keep the
          // reporting there rather than adding a capture here: all three
          // layouts have this same branch, and one event per request beats
          // three copies of the same call drifting apart.
          return null;
        }
        // hasRenderer guard above ensures this entry exists.
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const Renderer = blockRendererRegistry[blockType]!;
        return (
          <Renderer
            key={block.id}
            block={{ ...block, blockType }}
            community={community}
            theme={theme}
            layout="tidewater"
          />
        );
      })}
    </SiteChrome>
  );
}
