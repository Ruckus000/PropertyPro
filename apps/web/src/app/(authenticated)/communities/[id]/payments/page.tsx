import { redirect } from 'next/navigation';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { getEffectiveFeaturesForPage } from '@/lib/middleware/plan-guard';
import { PaymentPortal } from '@/components/finance/payment-portal';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Owner Payment Portal — view balance, upcoming assessments, make payments.
 *
 * Route: /communities/[id]/payments
 * Auth: any community member (owners see their own unit, staff sees all).
 * Non-owner roles must provide ?unitId= to specify which unit to view.
 */
export default async function PaymentsPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const communityId = Number(id);

  if (!Number.isFinite(communityId) || communityId <= 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold text-content">Payments</h1>
        <p className="mt-2 text-sm text-status-danger">Invalid community ID</p>
      </div>
    );
  }

  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, userId);

  const features = await getEffectiveFeaturesForPage(communityId, membership.communityType);
  if (!features.hasFinance) {
    redirect('/dashboard?reason=feature-not-available');
  }

  const resolved = await searchParams;
  const rawUnitId = typeof resolved['unitId'] === 'string' ? resolved['unitId'] : undefined;
  const parsedUnitId = rawUnitId ? Number(rawUnitId) : undefined;
  const unitId = parsedUnitId !== undefined && Number.isFinite(parsedUnitId) && parsedUnitId > 0
    ? parsedUnitId
    : undefined;

  return (
    <PaymentPortal
      communityId={communityId}
      userId={userId}
      userRole={membership.role}
      isUnitOwner={membership.isUnitOwner}
      unitId={unitId}
    />
  );
}
