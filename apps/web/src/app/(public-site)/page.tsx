import { headers } from 'next/headers';
import { createScopedClient, siteBlocks } from '@propertypro/db';
import { asc, eq } from '@propertypro/db/filters';
import { resolveTheme, toCssVars, toFontLinks } from '@propertypro/theme';
import type { CommunityType, BlockType } from '@propertypro/shared';
import {
  getBrandingForCommunity,
  getCommunityPublicInfo,
} from '@/lib/api/branding';
import { BLOCK_RENDERERS } from '@/components/public-site/blocks';
import { PublicSiteHeader } from '@/components/public-site/PublicSiteHeader';
import { PublicSiteFooter } from '@/components/public-site/PublicSiteFooter';

/**
 * Resolve community ID from middleware-injected headers.
 */
async function resolveCommunityId(): Promise<number | null> {
  const requestHeaders = await headers();
  const communityIdStr = requestHeaders.get('x-community-id');
  if (!communityIdStr) return null;

  const communityId = Number(communityIdStr);
  if (!Number.isInteger(communityId) || communityId <= 0) return null;

  return communityId;
}

/**
 * Fetch published, visible site blocks for a community, ordered by block_order.
 * Uses createScopedClient since site_blocks has a communityId column.
 */
async function fetchPublishedBlocks(communityId: number) {
  const scoped = createScopedClient(communityId);

  return scoped.selectFrom(
    siteBlocks,
    {
      id: siteBlocks.id,
      blockType: siteBlocks.blockType,
      blockOrder: siteBlocks.blockOrder,
      content: siteBlocks.content,
    },
    eq(siteBlocks.isVisible, true),
  ) as unknown as Promise<
    Array<{
      id: number;
      blockType: string;
      blockOrder: number;
      content: Record<string, unknown>;
    }>
  >;
}

/**
 * Coming Soon page shown when the community has not published their public site.
 */
function ComingSoon({ communityName }: { communityName: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <h1 className="text-3xl font-bold text-gray-900 mb-4">{communityName}</h1>
      <p className="text-lg text-gray-600 max-w-md">
        Our community website is coming soon. Please check back later.
      </p>
      <div className="mt-8">
        <a
          href="/auth/login"
          className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors"
        >
          Resident Login
        </a>
      </div>
    </div>
  );
}

export default async function PublicSitePage() {
  const communityId = await resolveCommunityId();
  if (!communityId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Community not found.</p>
      </div>
    );
  }

  const community = await getCommunityPublicInfo(communityId);
  if (!community) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Community not found.</p>
      </div>
    );
  }

  // Resolve theme from branding settings
  const branding = await getBrandingForCommunity(community.id);
  const theme = resolveTheme(
    branding,
    community.name,
    community.communityType as CommunityType,
  );
  const cssVars = toCssVars(theme);
  const fontLinks = toFontLinks(theme);

  // If the site has not been published, show Coming Soon
  if (!community.sitePublishedAt) {
    return (
      <>
        {fontLinks.map((href) => (
          // eslint-disable-next-line @next/next/no-page-custom-font
          <link key={href} rel="stylesheet" href={href} />
        ))}
        <div style={cssVars}>
          <PublicSiteHeader theme={theme} />
          <main id="main-content" className="flex-1">
            <ComingSoon communityName={community.name} />
          </main>
          <PublicSiteFooter communityName={community.name} />
        </div>
      </>
    );
  }

  // Fetch and render published blocks
  const blocks = await fetchPublishedBlocks(community.id);

  // Sort blocks by blockOrder for consistent rendering
  const sortedBlocks = [...blocks].sort((a, b) => a.blockOrder - b.blockOrder);

  return (
    <>
      {fontLinks.map((href) => (
        // eslint-disable-next-line @next/next/no-page-custom-font
        <link key={href} rel="stylesheet" href={href} />
      ))}
      <div style={cssVars}>
        <PublicSiteHeader theme={theme} />
        <main id="main-content" className="flex-1">
          {sortedBlocks.length === 0 ? (
            <ComingSoon communityName={community.name} />
          ) : (
            sortedBlocks.map((block) => {
              const Renderer =
                BLOCK_RENDERERS[block.blockType as BlockType];
              if (!Renderer) return null;
              return (
                <Renderer
                  key={block.id}
                  content={block.content}
                  communityId={community.id}
                  theme={theme}
                />
              );
            })
          )}
        </main>
        <PublicSiteFooter communityName={community.name} />
      </div>
    </>
  );
}
