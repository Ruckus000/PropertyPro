import { headers } from 'next/headers';
import { getEffectiveFeatures, isEntitledState, resolveLifecycleState, resolvePlanId } from '@propertypro/shared';
import { SUPPORT_SESSION_HEADER } from '@/lib/request/forwarded-headers';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { checkPermissionV2 } from '@/lib/db/access-control';
import { DocumentLibrary } from '@/components/documents/document-library';
import { ensureTransparencyChecklistInitialized } from '@/lib/services/transparency-service';
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

  // The setup guide draws one slot per statutory record, so a condo/HOA must
  // have its record list. It is created with the community, best-effort; this
  // fills any gap for a manager, as the website home does (idempotent: inserts
  // only missing rows, and a new row's 30-day clock starts now, as there).
  // Not for a lapsed community (the checklist read is refused anyway) and not
  // in a support session, which must not write. A failure must not take the
  // page down.
  // ponytail: one extra read per manager page load. Trigger: documents p95 regresses.
  const isSupportSession = (await headers()).get(SUPPORT_SESSION_HEADER) === '1';
  const entitled = isEntitledState(
    resolveLifecycleState({
      subscriptionStatus: membership.subscriptionStatus,
      subscriptionCanceledAt: membership.subscriptionCanceledAt,
      freeAccessExpiresAt: membership.freeAccessExpiresAt,
    }),
  );
  if (
    membership.isAdmin &&
    entitled &&
    !isSupportSession &&
    (membership.communityType === 'condo_718' || membership.communityType === 'hoa_720')
  ) {
    try {
      await ensureTransparencyChecklistInitialized(communityId, membership.communityType);
    } catch (err) {
      console.error('[documents] ensureTransparencyChecklistInitialized failed', { communityId, err });
    }
  }

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
