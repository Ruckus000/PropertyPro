import { headers } from 'next/headers';
import { resolveTheme, toCssVars, toFontLinks } from '@propertypro/theme';
import type { CommunityType } from '@propertypro/shared';
import {
  getBrandingForCommunity,
  getCommunityPublicInfo,
} from '@/lib/api/branding';
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

  return (
    <>
      {fontLinks.map((href) => (
        // eslint-disable-next-line @next/next/no-page-custom-font
        <link key={href} rel="stylesheet" href={href} />
      ))}
      <div style={cssVars} className="min-h-screen flex flex-col font-body">
        <PublicSiteHeader theme={theme} />

        <main id="main-content" className="flex-1">
          {/* Hero section */}
          <section className="bg-primary px-4 py-20 text-center sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl">
              <h1 className="font-heading text-4xl font-bold text-white sm:text-5xl">
                {community.name}
              </h1>
              <p className="mt-4 text-lg text-white/80">
                Your community portal for documents, meetings, and more.
              </p>
              <div className="mt-8">
                <a
                  href="/auth/login"
                  className="inline-flex items-center rounded-md bg-white px-6 py-3 text-base font-medium text-primary shadow-e2 hover:bg-gray-50 transition-colors"
                >
                  Resident Login
                </a>
              </div>
            </div>
          </section>

          {/* Features / Quick Links */}
          <section className="bg-white px-4 py-16 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-5xl">
              <h2 className="font-heading text-2xl font-semibold text-gray-900 text-center mb-10">
                Community Resources
              </h2>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                <FeatureCard
                  title="Documents"
                  description="Access community documents, budgets, and meeting minutes."
                  icon="documents"
                />
                <FeatureCard
                  title="Meetings"
                  description="View upcoming board meetings and community events."
                  icon="meetings"
                />
                <FeatureCard
                  title="Announcements"
                  description="Stay updated with the latest community news."
                  icon="announcements"
                />
              </div>
            </div>
          </section>

          {/* CTA section */}
          <section className="bg-accent px-4 py-12 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="font-heading text-xl font-semibold text-gray-900">
                Have questions?
              </h2>
              <p className="mt-2 text-secondary">
                Contact your community management team for assistance.
              </p>
            </div>
          </section>
        </main>

        <PublicSiteFooter communityName={community.name} />
      </div>
    </>
  );
}

function FeatureCard({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: 'documents' | 'meetings' | 'announcements';
}) {
  const icons = {
    documents: (
      <svg className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    meetings: (
      <svg className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    announcements: (
      <svg className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
      </svg>
    ),
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-e1">
      <div className="mb-3">{icons[icon]}</div>
      <h3 className="font-heading text-lg font-semibold text-gray-900">{title}</h3>
      <p className="mt-1 text-sm text-secondary">{description}</p>
    </div>
  );
}
