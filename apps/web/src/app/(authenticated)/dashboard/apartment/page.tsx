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
import {
  createApartmentDashboardTrace,
  loadApartmentMetrics,
  type ApartmentDashboardTrace,
} from '@/lib/queries/apartment-metrics';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { DashboardWelcome } from '@/components/dashboard/dashboard-welcome';
import { OnboardingChecklist } from '@/components/onboarding/onboarding-checklist';
import { ApartmentDashboard } from '@/components/dashboard/apartment-dashboard';
import { Skeleton } from '@/components/ui/skeleton';

interface ApartmentDashboardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ApartmentDashboardPage({
  searchParams,
}: ApartmentDashboardPageProps) {
  // TEMPORARY DIAGNOSTIC — see createApartmentDashboardTrace.
  const pageTrace = createApartmentDashboardTrace('page', null);
  const [resolvedSearchParams, requestHeaders] = await pageTrace.time(
    'page:params-headers',
    Promise.all([searchParams, headers()]),
  );

  const context = resolveCommunityContext({
    searchParams: toUrlSearchParams(resolvedSearchParams),
    host: requestHeaders.get('host'),
  });

  if (!context.communityId) {
    redirect('/dashboard');
  }

  const trace = createApartmentDashboardTrace('page', context.communityId);
  const userId = await trace.time('page:auth', requireAuthenticatedUserId());
  const membership = await trace.time(
    'page:membership',
    requireCommunityMembership(context.communityId, userId),
  );

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

  // Started (not awaited) so the metrics resolve inside the Suspense
  // boundary — the route shell flushes immediately and panels stream in.
  const metricsPromise = loadApartmentMetrics(context.communityId, userId, membership, trace);
  trace.log('page:returning-shell');

  return (
    <Suspense fallback={<ApartmentDashboardSkeleton />}>
      <ApartmentDashboardPanels
        metricsPromise={metricsPromise}
        communityId={context.communityId}
        canWriteAnnouncements={canWriteAnnouncements}
        trace={trace}
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
  communityId: number;
  canWriteAnnouncements: boolean;
  trace: ApartmentDashboardTrace;
}

async function ApartmentDashboardPanels({
  metricsPromise,
  communityId,
  canWriteAnnouncements,
  trace,
}: ApartmentDashboardPanelsProps) {
  const metrics = await trace.time('panels:await-metrics', metricsPromise);
  trace.log('panels:rendering');

  return (
    <div className="space-y-6">
      <OnboardingChecklist communityId={communityId} communityName={metrics.communityName} />
      <DashboardWelcome firstName={metrics.firstName} communityName={metrics.communityName} />
      <ApartmentDashboard
        metrics={metrics}
        communityId={communityId}
        canWriteAnnouncements={canWriteAnnouncements}
      />
    </div>
  );
}
