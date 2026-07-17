import { Suspense } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Skeleton } from '@/components/ui/skeleton';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getFeaturesForCommunity, resolvePlanId } from '@propertypro/shared';
import { getCommunityPublicInfo } from '@/lib/api/branding';
import { FoundingAhaPanel } from '@/components/onboarding/founding-aha-panel';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { checkPermissionV2 } from '@/lib/db/access-control';
import { loadDashboardData } from '@/lib/dashboard/load-dashboard-data';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { loadWizardState } from '@/lib/queries/wizard-state';
import { getAuthorizedCommunityIds } from '@/lib/queries/cross-community';
import { DashboardWelcome } from '@/components/dashboard/dashboard-welcome';
import { OnboardingChecklist } from '@/components/onboarding/onboarding-checklist';
import { DashboardAnnouncements } from '@/components/dashboard/dashboard-announcements';
import { DashboardMeetings } from '@/components/dashboard/dashboard-meetings';
import { DashboardViolations } from '@/components/dashboard/dashboard-violations';
import { DashboardEsignPending } from '@/components/dashboard/dashboard-esign-pending';
import { ClaimRootBanner } from '@/components/dashboard/ClaimRootBanner';
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-16 w-full rounded-md" />
      <Skeleton className="h-10 w-[200px]" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-64 w-full rounded-md" />
        <Skeleton className="h-64 w-full rounded-md" />
      </div>
    </div>
  );
}

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

  const userId = await requireAuthenticatedUserId();

  if (!context.communityId) {
    // Multi-community users see the unified overview; single-community
    // users use the community picker.
    const communityIds = await getAuthorizedCommunityIds(userId);
    if (communityIds.length >= 2) {
      redirect('/dashboard/overview');
    }
    redirect('/select-community');
  }
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

  const canWriteAnnouncements = checkPermissionV2(
    membership.role,
    membership.communityType,
    'announcements',
    'write',
    {
      isUnitOwner: membership.isUnitOwner,
    },
  );

  const planId = resolvePlanId(membership.subscriptionPlan);
  const showFoundingAha =
    membership.role === 'root_manager' &&
    planId === 'essentials' &&
    features.hasCompliance;

  // Start the heavy loads WITHOUT awaiting — they resolve inside the
  // Suspense boundary below, so the shell + skeleton flush to the browser
  // immediately and the panels stream in when the data arrives.
  const dataPromise = loadDashboardData(context.communityId, userId, membership);
  const publicInfoPromise = showFoundingAha
    ? getCommunityPublicInfo(context.communityId)
    : Promise.resolve(null);

  return (
    <ErrorBoundary>
      <div className="space-y-6">
        <ClaimRootBanner isAdmin={membership.isAdmin} />
        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardPanels
            dataPromise={dataPromise}
            publicInfoPromise={publicInfoPromise}
            communityId={context.communityId}
            isAdmin={membership.isAdmin}
            hasViolations={features.hasViolations}
            hasEsign={features.hasEsign}
            canWriteAnnouncements={canWriteAnnouncements}
            showFoundingAha={showFoundingAha}
          />
        </Suspense>
      </div>
    </ErrorBoundary>
  );
}

interface DashboardPanelsProps {
  dataPromise: ReturnType<typeof loadDashboardData>;
  publicInfoPromise: Promise<Awaited<ReturnType<typeof getCommunityPublicInfo>> | null>;
  communityId: number;
  isAdmin: boolean;
  hasViolations: boolean;
  hasEsign: boolean;
  canWriteAnnouncements: boolean;
  showFoundingAha: boolean;
}

async function DashboardPanels({
  dataPromise,
  publicInfoPromise,
  communityId,
  isAdmin,
  hasViolations,
  hasEsign,
  canWriteAnnouncements,
  showFoundingAha,
}: DashboardPanelsProps) {
  const [data, publicInfo] = await Promise.all([dataPromise, publicInfoPromise]);

  return (
    <div className="space-y-6">
      {showFoundingAha && publicInfo ? (
        <FoundingAhaPanel
          communityId={communityId}
          communitySlug={publicInfo.slug}
          communityName={data.communityName}
        />
      ) : null}
      <OnboardingChecklist
        communityId={communityId}
        communityName={data.communityName}
        variant={showFoundingAha ? 'secondary' : 'primary'}
      />
      <DashboardWelcome firstName={data.firstName} communityName={data.communityName} />
      <div className="grid gap-6 lg:grid-cols-2">
        <DashboardAnnouncements
          items={data.announcements}
          communityId={communityId}
          canWriteAnnouncements={canWriteAnnouncements}
        />
        <DashboardMeetings items={data.meetings} timezone={data.timezone} />
        {hasViolations && data.violationSummary && (
          <DashboardViolations
            summary={data.violationSummary}
            communityId={communityId}
            isAdmin={isAdmin}
          />
        )}
        {hasEsign && data.pendingSigners.length > 0 && (
          <DashboardEsignPending items={data.pendingSigners} />
        )}
      </div>
    </div>
  );
}
