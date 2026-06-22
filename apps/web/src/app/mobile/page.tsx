export const dynamic = 'force-dynamic';

/**
 * Mobile home/dashboard page — hub-and-spoke navigation center.
 *
 * Renders community header, role-based feature card, and navigation list.
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { loadDashboardData } from '@/lib/dashboard/load-dashboard-data';
import { getBrandingForCommunity, getCommunityPublicInfo } from '@/lib/api/branding';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { MobileHomeContent } from '@/components/mobile/MobileHomeContent';
import { TenantDashboardMockup } from '@/components/mobile/TenantDashboardMockup';

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

  // PR #9d — JSX mobile-template render branch retired. Mobile sessions
  // now always render the real dashboard for authed users and the
  // branded mockup for preview, matching the public site's exclusively-
  // block-model render contract.
  // No published template — preview shows branded mockup, auth'd shows real dashboard
  if (isPreview) {
    const [branding, community] = await Promise.all([
      getBrandingForCommunity(communityId),
      getCommunityPublicInfo(communityId),
    ]);
    return (
      <TenantDashboardMockup
        communityName={community?.name ?? 'Community'}
        primaryColor={branding?.primaryColor ?? '#2563EB'}
        secondaryColor={branding?.secondaryColor ?? '#1E40AF'}
        accentColor={branding?.accentColor ?? '#DBEAFE'}
        fontHeading={branding?.fontHeading ?? 'Inter'}
        fontBody={branding?.fontBody ?? 'Inter'}
      />
    );
  }

  const data = await loadDashboardData(communityId, userId!, membership!);
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
      hasCompliance={features.hasCompliance}
      hasFinance={features.hasFinance}
      hasMaintenanceRequests={features.hasMaintenanceRequests}
      hasMeetings={features.hasMeetings}
      announcementCount={data.announcements.length}
      openMaintenanceCount={data.openMaintenanceCount}
      nextMeetingDate={nextMeeting?.startsAt ?? null}
    />
  );
}
