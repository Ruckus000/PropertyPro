/**
 * Compliance page.
 *
 * Route: /communities/[id]/compliance
 * Auth: community membership + compliance:read permission required.
 * Feature gate: hasCompliance must be true (condo/HOA only).
 *
 * Renders ComplianceCommandCenter (the redesigned layout) for all visitors.
 */
import { redirect } from 'next/navigation';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { checkPermission, getFeaturesForCommunity } from '@propertypro/shared';
import ComplianceCommandCenter from '@/components/compliance/compliance-command-center';

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

  const features = getFeaturesForCommunity(membership.communityType);
  if (!features.hasCompliance) {
    redirect('/dashboard?reason=feature-not-available');
  }

  const opts = { isUnitOwner: membership.isUnitOwner, permissions: membership.permissions };
  if (!checkPermission(membership.role, membership.communityType, 'compliance', 'read', opts)) {
    redirect('/dashboard?reason=insufficient-permissions');
  }

  const canWrite = checkPermission(
    membership.role, membership.communityType, 'compliance', 'write', opts,
  );
  return (
    <ComplianceCommandCenter
      communityId={communityId}
      role={membership.role}
      canWrite={canWrite}
    />
  );
}
