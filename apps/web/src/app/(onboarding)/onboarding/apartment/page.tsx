/**
 * Apartment Onboarding Page — P2-38 closeout
 */

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { loadWizardState } from '@/lib/queries/wizard-state';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { ApartmentWizard } from '@/components/onboarding/apartment-wizard';

interface OnboardingPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
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

  const features = getFeaturesForCommunity(membership.communityType);
  if (!features.hasLeaseTracking) {
    redirect('/dashboard');
  }

  const wizardState = await loadWizardState(context.communityId);

  if (wizardState?.status === 'completed' || wizardState?.status === 'skipped') {
    redirect(`/dashboard/apartment?communityId=${context.communityId}`);
  }

  return (
    <main className="min-h-screen bg-[var(--surface-page)] text-[var(--color-text)]">
      <ApartmentWizard
        communityId={context.communityId}
        initialState={wizardState ?? undefined}
      />
    </main>
  );
}
