import { PublicSiteHeader } from '@/components/public-site/PublicSiteHeader';
import { PublicSiteFooter } from '@/components/public-site/PublicSiteFooter';
import { blockRendererRegistry, hasRenderer } from '@/components/public-site/blocks/registry';
import type { BlockType } from '@propertypro/shared';
import type { LayoutProps, SiteBlock } from './types';

function toHeaderTheme(
  community: LayoutProps['community'],
  theme: LayoutProps['theme'],
) {
  return {
    primaryColor: theme.primaryColor,
    secondaryColor: theme.secondaryColor,
    accentColor: theme.accentColor,
    fontHeading: theme.headingFont,
    fontBody: theme.bodyFont,
    logoUrl: community.logoUrl,
    communityName: community.name,
    communityType: community.communityType,
  };
}

function hasHeroBlock(blocks: SiteBlock[]): boolean {
  return blocks.some((b) => b.blockType === 'hero');
}

function EmptyStateHero({ heading }: { heading: string }) {
  return (
    <section className="bg-surface-card px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl border-l-4 border-accent pl-6 sm:pl-8">
        <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-accent">
          Resident Access
        </p>
        <h1 className="font-heading text-4xl font-semibold text-content sm:text-5xl">
          {heading}
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-content-secondary">
          A quiet home for community notices, records, meetings, and essential updates.
        </p>
        <div className="mt-8">
          <a
            href="/auth/login"
            className="inline-flex items-center rounded-md bg-primary px-6 py-3 text-base font-medium text-content-inverse shadow-e2 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Resident Login
          </a>
        </div>
      </div>
    </section>
  );
}

export function Sable({ community, theme, blocks, footer, nav, page }: LayoutProps) {
  const ordered = [...blocks].sort((a, b) => a.blockOrder - b.blockOrder);
  // D18 — see Tidewater. A non-home page cannot own a hero block, so the
  // empty-state hero is its only <h1>; headline it with the page's own name.
  const heroHeading = page && !page.isHome ? page.name : community.name;

  return (
    <div className="min-h-screen bg-surface-card font-body text-content">
      <PublicSiteHeader theme={toHeaderTheme(community, theme)} nav={nav} />
      <main id="main-content">
        {!hasHeroBlock(ordered) && <EmptyStateHero heading={heroHeading} />}
        <div className="mx-auto max-w-6xl">
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
        </div>
      </main>
      <PublicSiteFooter
        communityName={community.name}
        associationName={footer?.associationName}
        note={footer?.note}
        showStatutoryLine={footer?.showStatutoryLine}
      />
    </div>
  );
}
