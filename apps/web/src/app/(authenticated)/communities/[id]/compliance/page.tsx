/**
 * Compliance Dashboard page.
 *
 * Route: /communities/[id]/compliance
 * Auth: community membership + compliance:read permission required.
 *       Owner can read in condo/HOA; tenant cannot.
 * Feature gate: hasCompliance must be true (condo/HOA only).
 */
import { redirect } from 'next/navigation';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { checkPermission, getFeaturesForCommunity } from '@propertypro/shared';
import ComplianceDashboard from '@/components/compliance/compliance-dashboard';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CompliancePage({ params }: PageProps) {
  const { id } = await params;
  const communityId = Number(id);
  if (!Number.isFinite(communityId) || communityId <= 0) {
    redirect('/dashboard?reason=invalid-selection');
  }

  let userId: string;
  try {
    userId = await requireAuthenticatedUserId();
  } catch {
    redirect('/auth/login');
  }

  const membership = await requireCommunityMembership(communityId, userId);

  // Feature gate: compliance is condo/HOA only
  const features = getFeaturesForCommunity(membership.communityType);
  if (!features.hasCompliance) {
    redirect('/dashboard?reason=feature-not-available');
  }

  // RBAC check: owner can read in condo/HOA, tenant cannot
  if (!checkPermission(membership.role, membership.communityType, 'compliance', 'read')) {
    redirect('/dashboard?reason=insufficient-permissions');
  }

  return <ComplianceDashboard communityId={communityId} />;
}
