/**
 * Apartment operational dashboard page — P2-36
 *
 * Only renders for apartment community types.
 * Non-apartment communities are redirected to the generic dashboard.
 *
 * [AGENTS #34] Always gates via CommunityFeatures, never via direct community_type check.
 */
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { loadApartmentMetrics } from '@/lib/queries/apartment-metrics';
import { loadWizardState } from '@/lib/queries/wizard-state';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { DashboardWelcome } from '@/components/dashboard/dashboard-welcome';
import { ApartmentDashboard } from '@/components/dashboard/apartment-dashboard';

interface ApartmentDashboardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ApartmentDashboardPage({
  searchParams,
}: ApartmentDashboardPageProps) {
  const [resolvedSearchParams, requestHeaders] = await Promise.all([searchParams, headers()]);

  const context = resolveCommunityContext({
    searchParams: toUrlSearchParams(resolvedSearchParams),
    host: requestHeaders.get('host'),
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

  // Redirect to onboarding if wizard is not completed [P2-38]
  const wizardState = await loadWizardState(context.communityId);
  if (!wizardState || wizardState.status === 'in_progress') {
    redirect(`/onboarding/apartment?communityId=${context.communityId}`);
  }

  const metrics = await loadApartmentMetrics(context.communityId, userId);

  return (
    <div className="space-y-6">
      <DashboardWelcome firstName={metrics.firstName} communityName={metrics.communityName} />
      <ApartmentDashboard metrics={metrics} communityId={context.communityId} />
    </div>
  );
}
