/**
 * E-Sign submission detail page.
 *
 * Route: /esign/submissions/[id]?communityId=X
 * Auth: admin roles only.
 * Feature gate: hasEsign must be true.
 *
 * Two-column layout: PDF preview (left), status/signer cards/timeline (right).
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { getFeaturesForCommunity, isAdminRole } from '@propertypro/shared';
import { SubmissionDetail } from '@/components/esign/submission-detail';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}

export default async function SubmissionDetailPage({
  params,
  searchParams,
}: PageProps) {
  const [resolvedParams, resolvedSearch] = await Promise.all([
    params,
    searchParams,
  ]);
  const rawId = Number(resolvedSearch['communityId']);
  const submissionId = Number(resolvedParams.id);

  if (!Number.isInteger(rawId) || rawId <= 0) {
    redirect('/dashboard?reason=invalid-selection');
  }
  if (!Number.isInteger(submissionId) || submissionId <= 0) {
    redirect('/esign?reason=invalid-submission');
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
    <SubmissionDetail
      communityId={communityId}
      submissionId={submissionId}
    />
  );
}
