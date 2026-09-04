import { getEffectiveFeatures, resolvePlanId } from '@propertypro/shared';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { checkPermissionV2 } from '@/lib/db/access-control';
import { DocumentLibrary } from '@/components/documents/document-library';
import { PageHeader } from '@/components/shared/page-header';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}

export default async function DocumentsPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { q } = await searchParams;
  const communityId = Number(id);

  if (!Number.isFinite(communityId) || communityId <= 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Documents" />
        <p className="mt-2 text-sm text-status-danger">Invalid community ID</p>
      </div>
    );
  }

  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, userId);

  const features = getEffectiveFeatures(
    membership.communityType,
    resolvePlanId(membership.subscriptionPlan),
  );

  // Resolved here, not in the client: the checklist request 403s without BOTH
  // `hasCompliance` (condo/HOA only) and `compliance:read` (a TENANT does not
  // have it), and a 403 on mount would break the screen for those viewers.
  const canReadCompliance = checkPermissionV2(
    membership.role,
    membership.communityType,
    'compliance',
    'read',
    { isUnitOwner: membership.isUnitOwner },
  );

  return (
    <DocumentLibrary
      communityId={communityId}
      communityType={membership.communityType}
      userRole={membership.role}
      isUnitOwner={membership.isUnitOwner}
      hasEsign={features.hasEsign}
      hasCompliance={features.hasCompliance}
      canReadCompliance={canReadCompliance}
      initialSearchQuery={q}
    />
  );
}
