import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { PublicHome } from '@/components/public/public-home';
import { resolvePublicCommunity } from '@/lib/tenant/community-resolution';
import { getPublishedTemplate } from '@/lib/api/site-template';
import { getBrandingForCommunity } from '@/lib/api/branding';
import { resolveTheme, toCssVars, toFontLinks } from '@propertypro/theme';
import type { CommunityType } from '@propertypro/shared';

interface PublicCommunityPageProps {
  params: Promise<{ subdomain: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PublicCommunityPage({
  params,
  searchParams,
}: PublicCommunityPageProps) {
  const [{ subdomain }, resolvedSearchParams, requestHeaders] = await Promise.all([
    params,
    searchParams,
    headers(),
  ]);

  const community = await resolvePublicCommunity(
    resolvedSearchParams,
    subdomain,
    requestHeaders.get('host'),
  );

  if (!community) {
    notFound();
  }

  // Check for a published JSX template
  const compiledHtml = await getPublishedTemplate(community.id);

  if (compiledHtml) {
    const branding = await getBrandingForCommunity(community.id);
    const theme = resolveTheme(
      branding,
      community.name,
      community.communityType as CommunityType,
    );
    const cssVars = toCssVars(theme);
    const fontLinks = toFontLinks(theme);
    // Template JSX uses --pp-* aliases alongside --theme-* vars
    const templateVars: Record<string, string> = {
      ...cssVars,
      '--pp-primary': theme.primaryColor,
      '--pp-secondary': theme.secondaryColor,
      '--pp-accent': theme.accentColor,
    };

    return (
      <>
        {fontLinks.map((href) => (
          // eslint-disable-next-line @next/next/no-page-custom-font
          <link key={href} rel="stylesheet" href={href} />
        ))}
        {/* eslint-disable-next-line @next/next/no-before-interactive-script-outside-document */}
        <script src="/assets/tailwind.min.js" async />
        <div style={templateVars} className="font-body">
          <div dangerouslySetInnerHTML={{ __html: compiledHtml }} />
        </div>
      </>
    );
  }

  return <PublicHome community={community} />;
}
