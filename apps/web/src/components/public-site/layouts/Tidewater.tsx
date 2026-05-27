import { PublicSiteHeader } from '@/components/public-site/PublicSiteHeader';
import { PublicSiteFooter } from '@/components/public-site/PublicSiteFooter';
import { blockRendererRegistry } from '@/components/public-site/blocks/registry';
import type { LayoutProps, SiteBlock } from './types';

/**
 * Build the CommunityTheme shape that PublicSiteHeader expects from the
 * LayoutProps' separate community + ResolvedTheme objects.
 *
 * PublicSiteHeader takes CommunityTheme (from @propertypro/theme) whose field
 * names differ from ResolvedTheme:
 *   ResolvedTheme.headingFont → CommunityTheme.fontHeading
 *   ResolvedTheme.bodyFont    → CommunityTheme.fontBody
 *   (logoUrl and communityName come from the community object)
 */
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
    logoUrl: null,
    communityName: community.name,
    communityType: community.communityType,
  };
}

function hasHeroBlock(blocks: SiteBlock[]): boolean {
  return blocks.some((b) => b.blockType === 'hero');
}

function EmptyStateHero({ communityName }: { communityName: string }) {
  return (
    <section className="bg-primary px-4 py-20 text-center sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-heading text-4xl font-bold text-content-inverse sm:text-5xl">
          {communityName}
        </h1>
        <p className="mt-4 text-lg text-content-inverse/80">
          Your community portal for documents, meetings, and more.
        </p>
        <div className="mt-8">
          <a
            href="/auth/login"
            className="inline-flex items-center rounded-md bg-surface-card px-6 py-3 text-base font-medium text-primary shadow-e2 hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-content-inverse"
          >
            Resident Login
          </a>
        </div>
      </div>
    </section>
  );
}

export function Tidewater({ community, theme, blocks }: LayoutProps) {
  const ordered = [...blocks].sort((a, b) => a.blockOrder - b.blockOrder);

  return (
    <div className="min-h-screen flex flex-col font-body">
      <PublicSiteHeader theme={toHeaderTheme(community, theme)} />
      <main id="main-content" className="flex-1">
        {!hasHeroBlock(ordered) && <EmptyStateHero communityName={community.name} />}
        {ordered.map((block) => {
          const Renderer =
            blockRendererRegistry[block.blockType as keyof typeof blockRendererRegistry];
          if (!Renderer) {
            // Unknown block type — skip silently (logged at the page level).
            return null;
          }
          return (
            <Renderer
              key={block.id}
              block={block}
              community={community}
              theme={theme}
              layout="tidewater"
            />
          );
        })}
      </main>
      <PublicSiteFooter communityName={community.name} />
    </div>
  );
}
