export const dynamic = 'force-dynamic';

/**
 * Mobile home/dashboard page — hub-and-spoke navigation center.
 *
 * Renders community header, role-based feature card, and navigation list.
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { loadDashboardData } from '@/lib/dashboard/load-dashboard-data';
import { getPublishedTemplate } from '@/lib/api/site-template';
import { getBrandingForCommunity, getCommunityPublicInfo } from '@/lib/api/branding';
import { resolveTheme, toCssVars, toFontLinks } from '@propertypro/theme';
import { getFeaturesForCommunity, type CommunityType } from '@propertypro/shared';
import { MobileHomeContent } from '@/components/mobile/MobileHomeContent';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function MobileHomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const communityId = Number(params['communityId']);
  const isPreview = params['preview'] === 'true';

  // Auth — skip in preview mode (demo iframe from admin app on different origin)
  let userId: string | undefined;
  let membership: Awaited<ReturnType<typeof requireCommunityMembership>> | undefined;

  if (!isPreview) {
    try {
      userId = await requireAuthenticatedUserId();
    } catch {
      redirect('/auth/login');
    }

    try {
      membership = await requireCommunityMembership(communityId, userId!);
    } catch {
      redirect('/auth/login');
    }
  } else if (!Number.isInteger(communityId) || communityId <= 0) {
    return <div className="p-4 text-content-secondary">Community not found.</div>;
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
        <p className="text-content-secondary">No mobile template published yet. Use the edit drawer to create one.</p>
      </div>
    );
  }

  const data = await loadDashboardData(communityId, userId!);
  const features = getFeaturesForCommunity(membership!.communityType);
  const nextMeeting = data.meetings[0] ?? null;

  return (
    <MobileHomeContent
      userName={data.firstName}
      communityName={data.communityName}
      communityId={communityId}
      city={membership!.city}
      state={membership!.state}
      timezone={data.timezone}
      role={membership!.role}
      presetKey={membership!.presetKey}
      hasCompliance={features.hasCompliance}
      hasMeetings={features.hasMeetings}
      announcementCount={data.announcements.length}
      openMaintenanceCount={data.openMaintenanceCount}
      nextMeetingDate={nextMeeting?.startsAt ?? null}
    />
  );
}
