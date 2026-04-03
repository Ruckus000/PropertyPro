import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { loadDashboardData } from '@/lib/dashboard/load-dashboard-data';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { loadWizardState } from '@/lib/queries/wizard-state';
import { DashboardWelcome } from '@/components/dashboard/dashboard-welcome';
import { OnboardingChecklist } from '@/components/onboarding/onboarding-checklist';
import { DashboardAnnouncements } from '@/components/dashboard/dashboard-announcements';
import { DashboardMeetings } from '@/components/dashboard/dashboard-meetings';
import { DashboardViolations } from '@/components/dashboard/dashboard-violations';
import { DashboardEsignPending } from '@/components/dashboard/dashboard-esign-pending';
interface DashboardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const [resolvedSearchParams, requestHeaders] = await Promise.all([
    searchParams,
    headers(),
  ]);
  const context = resolveCommunityContext({
    searchParams: toUrlSearchParams(resolvedSearchParams),
    host: requestHeaders.get('host'),
  });

  if (!context.communityId) {
    redirect('/select-community');
  }

  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(context.communityId, userId);

  // Redirect apartment communities to specialized dashboard [P2-38]
  const features = getFeaturesForCommunity(membership.communityType);
  if (features.hasLeaseTracking) {
    redirect(`/dashboard/apartment?communityId=${context.communityId}`);
  }

  // Redirect condo communities to onboarding if wizard is not completed [P2-39]
  if (features.hasCompliance) {
    const wizardState = await loadWizardState(context.communityId, 'condo');
    if (!wizardState || wizardState.status === 'in_progress') {
      redirect(`/onboarding/condo?communityId=${context.communityId}`);
    }
  }

  const data = await loadDashboardData(context.communityId, userId);

  return (
    <div className="space-y-6">
      <OnboardingChecklist
        communityId={context.communityId}
        communityName={data.communityName}
      />
      <DashboardWelcome firstName={data.firstName} communityName={data.communityName} />
      <div className="grid gap-6 lg:grid-cols-2">
        <DashboardAnnouncements items={data.announcements} />
        <DashboardMeetings items={data.meetings} timezone={data.timezone} />
        {features.hasViolations && data.violationSummary && (
          <DashboardViolations
            summary={data.violationSummary}
            communityId={context.communityId}
            isAdmin={membership.isAdmin}
          />
        )}
        {features.hasEsign && data.pendingSigners.length > 0 && (
          <DashboardEsignPending items={data.pendingSigners} />
        )}
      </div>
    </div>
  );
}
