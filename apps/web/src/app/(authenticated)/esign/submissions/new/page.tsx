/**
 * E-Sign submission creation page.
 *
 * Route: /esign/submissions/new?communityId=X
 * Auth: admin roles only.
 * Feature gate: hasEsign must be true.
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { getFeaturesForCommunity, isAdminRole } from '@propertypro/shared';
import { NewSubmissionForm } from '@/components/esign/new-submission-form';

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

  const features = getFeaturesForCommunity(membership.communityType);
  if (!features.hasEsign) {
    redirect('/dashboard?reason=feature-not-available');
  }

  if (!isAdminRole(membership.role)) {
    redirect('/dashboard?reason=insufficient-permissions');
  }

  return <NewSubmissionForm communityId={communityId} />;
}
