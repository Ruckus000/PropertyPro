/**
 * Apartment operational dashboard page — P2-36
 *
 * Only renders for apartment community types.
 * Non-apartment communities are redirected to the generic dashboard.
 *
 * [AGENTS #34] Always gates via CommunityFeatures, never via direct community_type check.
 */
import { Suspense } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { checkPermissionV2 } from '@/lib/db/access-control';
import { loadApartmentMetrics } from '@/lib/queries/apartment-metrics';
import { resolvePageCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { DashboardWelcome } from '@/components/dashboard/dashboard-welcome';
import { OnboardingChecklist } from '@/components/onboarding/onboarding-checklist';
import {
  celebrationNextStepFor,
  type CelebrationNextStep,
} from '@/lib/onboarding/celebration-next-step';
import { WebsiteLiveCard } from '@/components/website-home/website-live-card';
import { loadWebsiteLiveCard } from '@/lib/dashboard/load-website-live-card';
import { ApartmentDashboard } from '@/components/dashboard/apartment-dashboard';
import { Skeleton } from '@/components/ui/skeleton';

interface ApartmentDashboardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ApartmentDashboardPage({
  searchParams,
}: ApartmentDashboardPageProps) {
  const [resolvedSearchParams, requestHeaders] = await Promise.all([searchParams, headers()]);

  const context = resolvePageCommunityContext({
    searchParams: toUrlSearchParams(resolvedSearchParams),
    headers: requestHeaders,
  });

  if (!context.communityId) {
    redirect('/dashboard');
  }

  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(context.communityId, userId);

  // Feature gate: redirect non-apartment communities [AGENTS #34]
  const features = getFeaturesForCommunity(membership.communityType);
  if (!features.hasLeaseTracking) {
    redirect('/dashboard');
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

  const celebrationNextStep = celebrationNextStepFor({
    communityId: context.communityId,
    role: membership.role,
    communityType: membership.communityType,
    isUnitOwner: membership.isUnitOwner,
  });

  // Started (not awaited) so the metrics resolve inside the Suspense
  // boundary — the route shell flushes immediately and panels stream in.
  const metricsPromise = loadApartmentMetrics(context.communityId, userId, membership);
  // Null unless a manager's website setup is not done (D18); resolves with the page.
  const websiteCardPromise = loadWebsiteLiveCard(context.communityId, membership.role, features);

  return (
    <Suspense fallback={<ApartmentDashboardSkeleton />}>
      <ApartmentDashboardPanels
        metricsPromise={metricsPromise}
        websiteCardPromise={websiteCardPromise}
        communityId={context.communityId}
        userId={userId}
        celebrationNextStep={celebrationNextStep}
        canWriteAnnouncements={canWriteAnnouncements}
      />
    </Suspense>
  );
}

function ApartmentDashboardSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading dashboard">
      <Skeleton className="h-16 w-full rounded-md" />
      <Skeleton className="h-10 w-[200px]" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-64 w-full rounded-md" />
        <Skeleton className="h-64 w-full rounded-md" />
      </div>
    </div>
  );
}

interface ApartmentDashboardPanelsProps {
  metricsPromise: ReturnType<typeof loadApartmentMetrics>;
  websiteCardPromise: ReturnType<typeof loadWebsiteLiveCard>;
  communityId: number;
  userId: string;
  celebrationNextStep: CelebrationNextStep | null;
  canWriteAnnouncements: boolean;
}

async function ApartmentDashboardPanels({
  metricsPromise,
  websiteCardPromise,
  communityId,
  userId,
  celebrationNextStep,
  canWriteAnnouncements,
}: ApartmentDashboardPanelsProps) {
  const [metrics, websiteCard] = await Promise.all([metricsPromise, websiteCardPromise]);

  return (
    <div className="space-y-6">
      {websiteCard ? (
        <WebsiteLiveCard
          communityId={communityId}
          communityName={metrics.communityName}
          publicUrl={websiteCard.publicUrl}
        />
      ) : null}
      <OnboardingChecklist
        communityId={communityId}
        communityName={metrics.communityName}
        userId={userId}
        nextStep={celebrationNextStep}
        variant={websiteCard ? 'secondary' : 'primary'}
      />
      <DashboardWelcome firstName={metrics.firstName} communityName={metrics.communityName} />
      <ApartmentDashboard
        metrics={metrics}
        communityId={communityId}
        canWriteAnnouncements={canWriteAnnouncements}
      />
    </div>
  );
}
