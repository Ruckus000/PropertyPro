/**
 * Reserve-transparency register page (Wave 1 differentiation).
 *
 * Route: /communities/[id]/reserves
 * Auth: any community member. READ IS DELIBERATELY OPEN — the entire point of
 *       reserve transparency is that every owner sees the factual register and
 *       the remaining-useful-life countdown. Management controls are additive
 *       for admin-tier roles (see `canManage`).
 * Feature gate: hasReserveTransparency (condo/HOA only). Ships DARK — enablement
 *       is gated on attorney-reviewed copy plus the per-community flag.
 *
 * COMPLIANCE POSTURE: factual data only. This register is NOT a reserve study
 * and NOT an assessment of reserve adequacy; PropertyPro does not provide
 * engineering, financial, or legal advice.
 *
 * The `[id]` path segment is the authoritative tenant id for this route.
 */
import { redirect } from 'next/navigation';
import { isAdminRole } from '@propertypro/shared';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { getEffectiveFeaturesForPage } from '@/lib/middleware/plan-guard';
import { PageHeader } from '@/components/shared/page-header';
import { ReserveTransparencySection } from '@/components/reserves/reserve-transparency-section';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ReservesPage({ params }: PageProps) {
  const { id } = await params;
  const communityId = Number(id);

  if (!Number.isInteger(communityId) || communityId <= 0) {
    redirect('/dashboard?reason=invalid-selection');
  }

  let userId: string;
  try {
    userId = await requireAuthenticatedUserId();
  } catch {
    redirect('/auth/login');
  }

  const membership = await requireCommunityMembership(communityId, userId);

  const features = await getEffectiveFeaturesForPage(communityId, membership.communityType);
  if (!features.hasReserveTransparency) {
    redirect('/dashboard?reason=feature-not-available');
  }

  return (
    <>
      <PageHeader
        title="Reserve Register"
        description="Your association's major components with a remaining-useful-life countdown. This shows the data the association entered — it is not a reserve study or an assessment of whether reserves are adequate."
      />

      <div className="mt-8">
        <ReserveTransparencySection communityId={communityId} canManage={isAdminRole(membership.role)} />
      </div>
    </>
  );
}
