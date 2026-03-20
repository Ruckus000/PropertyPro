/**
 * E-Sign Submissions List — displays all e-sign submissions for the community.
 *
 * Route: /esign/submissions?communityId=X
 * Auth: admin roles only + hasEsign feature gate.
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { getFeaturesForCommunity, isAdminRole } from '@propertypro/shared';
import { SubmissionList } from '@/components/esign/submission-list';

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

  const features = getFeaturesForCommunity(membership.communityType);
  if (!features.hasEsign) {
    redirect('/dashboard?reason=feature-not-available');
  }

  if (!isAdminRole(membership.role)) {
    redirect('/dashboard?reason=insufficient-permissions');
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-[var(--text-primary)]">
        E-Sign Submissions
      </h1>
      <SubmissionList communityId={communityId} />
    </div>
  );
}
