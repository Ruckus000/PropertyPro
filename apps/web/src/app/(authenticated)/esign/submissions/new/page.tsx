// breadcrumbs:exempt — delegated to apps/web/src/components/esign/new-submission-form.tsx
/**
 * E-Sign submission creation page.
 *
 * Route: /esign/submissions/new?communityId=X
 * Auth: admin roles only.
 * Feature gate: hasEsign must be true.
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { isAdminRole, getFeaturesForCommunity } from '@propertypro/shared';
import { NewSubmissionForm } from '@/components/esign/new-submission-form';
import { FeatureGate } from '@/components/billing/feature-gate';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function NewSubmissionPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const rawId = Number(params['communityId']);

  if (!Number.isInteger(rawId) || rawId <= 0) {
    redirect('/dashboard?reason=invalid-selection');
  }

  const communityId = rawId;
  let userId: string;

  try {
    userId = await requireAuthenticatedUserId();
  } catch {
    redirect('/auth/login');
  }

  const membership = await requireCommunityMembership(communityId, userId);

  const typeFeatures = getFeaturesForCommunity(membership.communityType);
  if (!typeFeatures.hasEsign) {
    redirect('/dashboard?reason=feature-not-available');
  }

  if (!isAdminRole(membership.role)) {
    redirect('/dashboard?reason=insufficient-permissions');
  }

  return (
    <FeatureGate feature="hasEsign" communityId={communityId}>
      <NewSubmissionForm communityId={communityId} />
    </FeatureGate>
  );
}
