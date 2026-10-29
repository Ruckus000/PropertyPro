import { blockRendererRegistry, hasRenderer } from '@/components/public-site/blocks/registry';
import { sectionAnchorIds } from '@/components/public-site/blocks/page-sections';
import type { BlockType } from '@propertypro/shared';
import { SiteChrome } from './SiteChrome';
import { hasHeroBlock } from './has-hero-block';
import type { LayoutProps } from './types';

/**
 * Heritage — formal and official. The hero is drawn from `LOOK_STYLES.heritage`
 * and the page around it is its `SiteChrome` entry; this component dispatches
 * the blocks, as Tidewater does.
 */
export function Heritage({ community, theme, blocks, footer, nav, page }: LayoutProps) {
  const ordered = [...blocks].sort((a, b) => a.blockOrder - b.blockOrder);
  // Quick links' anchors and page sections — see Tidewater.
  const anchors = sectionAnchorIds(ordered);
  // D18 — see Tidewater. A non-home page cannot own a hero block, so the
  // empty-state hero is its only <h1>; headline it with the page's own name.
  const heroHeading = page && !page.isHome ? page.name : community.name;

  return (
    <SiteChrome
      layout="heritage"
      community={community}
      theme={theme}
      footer={footer}
      nav={nav}
      emptyHeroHeading={hasHeroBlock(ordered) ? null : heroHeading}
    >
      {ordered.map((block) => {
        const blockType = block.blockType as BlockType;
        // Unknown block type — skip. Reported once per request at the page level by
        // `reportDegradedBlocks`; centralised there so every layout stays in sync.
        if (!hasRenderer(blockType)) return null;
        // hasRenderer above guarantees the entry.
        const Renderer = blockRendererRegistry[blockType]!;
        return (
          <Renderer
            key={block.id}
            block={{ ...block, blockType }}
            community={community}
            theme={theme}
            layout="heritage"
            anchorId={anchors.get(block.id)}
            pageSections={ordered}
          />
        );
      })}
    </SiteChrome>
  );
}
