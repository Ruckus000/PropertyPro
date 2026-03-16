export const dynamic = 'force-dynamic';

/**
 * P3-48/49: Mobile home/dashboard page.
 *
 * Renders recent announcements and upcoming meetings in compact card layout.
 * Data reuses the same loadDashboardData helper as the desktop portal.
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { loadDashboardData } from '@/lib/dashboard/load-dashboard-data';
import { getPublishedTemplate } from '@/lib/api/site-template';
import { getBrandingForCommunity, getCommunityPublicInfo } from '@/lib/api/branding';
import { resolveTheme, toCssVars, toFontLinks } from '@propertypro/theme';
import type { CommunityType } from '@propertypro/shared';
import { CompactCard } from '@/components/mobile/CompactCard';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function MobileHomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const communityId = Number(params['communityId']);
  const isPreview = params['preview'] === 'true';

  // Auth — skip in preview mode (demo iframe from admin app on different origin)
  let userId: string | undefined;
  if (!isPreview) {
    try {
      userId = await requireAuthenticatedUserId();
    } catch {
      redirect('/auth/login');
    }

    try {
      await requireCommunityMembership(communityId, userId!);
    } catch {
      redirect('/auth/login');
    }
  } else if (!Number.isInteger(communityId) || communityId <= 0) {
    return <div className="p-4 text-gray-500">Community not found.</div>;
  }

  // If a custom mobile template has been published, render it with branding
  const mobileHtml = await getPublishedTemplate(communityId, 'mobile');
  if (mobileHtml) {
    const [branding, community] = await Promise.all([
      getBrandingForCommunity(communityId),
      getCommunityPublicInfo(communityId),
    ]);
    const theme = resolveTheme(
      branding,
      community?.name ?? 'Community',
      (community?.communityType ?? 'condo_718') as CommunityType,
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
          <div dangerouslySetInnerHTML={{ __html: mobileHtml }} />
        </div>
      </>
    );
  }

  // No published template — preview shows placeholder, auth'd shows dashboard
  if (isPreview) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">No mobile template published yet. Use the edit drawer to create one.</p>
      </div>
    );
  }

  const data = await loadDashboardData(communityId, userId!);

  return (
    <div>
      {/* Recent announcements */}
      <div className="mt-1">
        <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Announcements
        </div>
        {data.announcements.length === 0 ? (
          <p className="mobile-empty">No recent announcements</p>
        ) : (
          data.announcements.map((a) => (
            <CompactCard
              key={a.id}
              title={a.title}
              subtitle={a.isPinned ? 'Pinned' : undefined}
              meta={new Date(a.publishedAt).toLocaleDateString('en-US', { timeZone: data.timezone })}
              href={`/mobile/announcements/${a.id}?communityId=${communityId}`}
            />
          ))
        )}
      </div>

      {/* Upcoming meetings */}
      {data.meetings.length > 0 && (
        <div className="mt-2">
          <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Upcoming Meetings
          </div>
          {data.meetings.map((m) => (
            <CompactCard
              key={m.id}
              title={m.title}
              subtitle={m.meetingType}
              meta={new Date(m.startsAt).toLocaleDateString('en-US', { timeZone: data.timezone })}
              href={`/mobile/meetings?communityId=${communityId}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
