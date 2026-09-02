/**
 * E-Sign Submissions List — displays all e-sign submissions for the community.
 *
 * Route: /esign/submissions?communityId=X
 * Auth: admin roles only + hasEsign feature gate.
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { isAdminRole, getFeaturesForCommunity } from '@propertypro/shared';
import { SubmissionList } from '@/components/esign/submission-list';
import { FeatureGate } from '@/components/billing/feature-gate';
import { PageHeader } from '@/components/shared/page-header';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function EsignSubmissionsPage({ searchParams }: PageProps) {
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
    <div>
      <PageHeader title="E-Sign Submissions" />
      <SubmissionList communityId={communityId} />
    </div>
    </FeatureGate>
  );
}
