import { redirect } from 'next/navigation';
import { resolveTheme, toCssVars, toFontLinks } from '@propertypro/theme';
import type { CommunityType } from '@propertypro/shared';
import {
  getBrandingForCommunity,
  getCommunityPublicInfo,
} from '@/lib/api/branding';
import { PublicSiteHeader } from '@/components/public-site/PublicSiteHeader';
import { PublicSiteFooter } from '@/components/public-site/PublicSiteFooter';

/**
 * Dev-only preview route for testing community branding.
 *
 * Usage: /_site/preview?communityId=1
 *
 * Renders the public site template with the specified community's branding.
 * Only available in development mode.
 */
export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ communityId?: string }>;
}) {
  if (process.env.NODE_ENV !== 'development') {
    redirect('/');
  }

  const params = await searchParams;
  const communityId = Number(params.communityId);
  if (!communityId || !Number.isInteger(communityId) || communityId <= 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface-page">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-content mb-2">Preview Mode</h1>
          <p className="text-content-secondary mb-4">
            Add <code className="bg-surface-muted px-2 py-0.5 rounded text-sm">?communityId=X</code> to preview a community&apos;s branding.
          </p>
        </div>
      </div>
    );
  }

  const community = await getCommunityPublicInfo(communityId);
  if (!community) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-content-secondary">Community {communityId} not found.</p>
      </div>
    );
  }

  const branding = await getBrandingForCommunity(community.id);
  const theme = resolveTheme(
    branding,
    community.name,
    community.communityType as CommunityType,
  );
  const cssVars = toCssVars(theme);
  const fontLinks = toFontLinks(theme);

  return (
    <>
      {fontLinks.map((href) => (
        // eslint-disable-next-line @next/next/no-page-custom-font
        <link key={href} rel="stylesheet" href={href} />
      ))}
      <div style={cssVars} className="min-h-screen flex flex-col font-body">
        {/* Dev banner */}
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 text-center text-xs text-yellow-800">
          Preview Mode — Community: <strong>{community.name}</strong> (ID: {community.id})
          {branding ? (
            <span className="ml-2">
              Primary: <span className="font-mono">{branding.primaryColor}</span>
              {' · '}Font: {branding.fontHeading ?? 'default'}
            </span>
          ) : (
            <span className="ml-2 text-yellow-600">(no custom branding set — using defaults)</span>
          )}
        </div>

        <PublicSiteHeader theme={theme} />

        <main id="main-content" className="flex-1">
          {/* Hero section */}
          <section className="bg-primary px-4 py-20 text-center sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl">
              <h1 className="font-heading text-4xl font-bold text-content-inverse sm:text-5xl">
                {community.name}
              </h1>
              <p className="mt-4 text-lg text-content-inverse/80">
                Your community portal for documents, meetings, and more.
              </p>
              <div className="mt-8">
                <a
                  href="/auth/login"
                  className="inline-flex items-center rounded-md bg-surface-card px-6 py-3 text-base font-medium text-primary shadow-e2 hover:bg-surface-hover transition-colors"
                >
                  Resident Login
                </a>
              </div>
            </div>
          </section>

          {/* Sample content to show branding tokens in action */}
          <section className="bg-surface-card px-4 py-16 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-5xl">
              <h2 className="font-heading text-2xl font-semibold text-content text-center mb-10">
                Community Resources
              </h2>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {['Documents', 'Meetings', 'Announcements'].map((title) => (
                  <div key={title} className="rounded-md border border-edge bg-surface-card p-6 shadow-e1">
                    <div className="mb-3 h-8 w-8 rounded bg-primary-light flex items-center justify-center">
                      <div className="h-4 w-4 rounded-sm bg-primary" />
                    </div>
                    <h3 className="font-heading text-lg font-semibold text-content">{title}</h3>
                    <p className="mt-1 text-sm text-secondary">
                      Sample content using semantic branding tokens.
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="bg-accent px-4 py-12 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="font-heading text-xl font-semibold text-content">
                Accent Section
              </h2>
              <p className="mt-2 text-secondary">
                This section uses <code className="bg-white/50 px-1 rounded text-xs">bg-accent</code> and <code className="bg-white/50 px-1 rounded text-xs">text-secondary</code>.
              </p>
            </div>
          </section>
        </main>

        <PublicSiteFooter communityName={community.name} />
      </div>
    </>
  );
}
