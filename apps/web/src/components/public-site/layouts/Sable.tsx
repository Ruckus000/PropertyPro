import { blockRendererRegistry, hasRenderer } from '@/components/public-site/blocks/registry';
import type { BlockType } from '@propertypro/shared';
import { SiteChrome } from './SiteChrome';
import { hasHeroBlock } from './has-hero-block';
import type { LayoutProps } from './types';

/**
 * Sable — the apartment default. Chrome in `SiteChrome`; see Tidewater.
 */
export function Sable({ community, theme, blocks, footer, nav, page }: LayoutProps) {
  const ordered = [...blocks].sort((a, b) => a.blockOrder - b.blockOrder);
  // D18 — see Tidewater. A non-home page cannot own a hero block, so the
  // empty-state hero is its only <h1>; headline it with the page's own name.
  const heroHeading = page && !page.isHome ? page.name : community.name;

  return (
    <SiteChrome
      layout="sable"
      community={community}
      theme={theme}
      footer={footer}
      nav={nav}
      emptyHeroHeading={hasHeroBlock(ordered) ? null : heroHeading}
    >
      {ordered.map((block) => {
        const blockType = block.blockType as BlockType;
        // Unknown block type — skip. Reported once per request at the page level by
        // `reportDegradedBlocks`; centralised there so all three layouts stay in sync.
        if (!hasRenderer(blockType)) return null;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const Renderer = blockRendererRegistry[blockType]!;
        return (
          <Renderer
            key={block.id}
            block={{ ...block, blockType }}
            community={community}
            theme={theme}
            layout="sable"
          />
        );
      })}
    </SiteChrome>
  );
}
