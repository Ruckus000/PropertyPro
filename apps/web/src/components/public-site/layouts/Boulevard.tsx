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

function EmptyStateHero({ communityName }: { communityName: string }) {
  return (
    <section className="border-y border-edge bg-secondary px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-[1.2fr_0.8fr] md:items-end">
        <div>
          <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-primary">
            Community Portal
          </p>
          <h1 className="font-heading text-4xl font-semibold text-content sm:text-5xl">
            {communityName}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-content-secondary">
            Documents, meetings, announcements, and resident resources in one place.
          </p>
        </div>
        <div className="md:text-right">
          <a
            href="/auth/login"
            className="inline-flex items-center rounded-md bg-primary px-6 py-3 text-base font-medium text-content-inverse shadow-e2 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
          >
            Resident Login
          </a>
        </div>
      </div>
    </section>
  );
}

export function Boulevard({ community, theme, blocks, footer }: LayoutProps) {
  const ordered = [...blocks].sort((a, b) => a.blockOrder - b.blockOrder);

  return (
    <div className="min-h-screen bg-secondary font-body text-content">
      <PublicSiteHeader theme={toHeaderTheme(community, theme)} />
      <main id="main-content">
        {!hasHeroBlock(ordered) && <EmptyStateHero communityName={community.name} />}
        <div className="divide-y divide-edge">
          {ordered.map((block) => {
            const blockType = block.blockType as BlockType;
            if (!hasRenderer(blockType)) return null;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const Renderer = blockRendererRegistry[blockType]!;
            return (
              <Renderer
                key={block.id}
                block={{ ...block, blockType }}
                community={community}
                theme={theme}
                layout="boulevard"
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
