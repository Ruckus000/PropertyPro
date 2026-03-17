import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { PaymentPortal } from '@/components/finance/payment-portal';

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Owner Payment Portal — view balance, upcoming assessments, make payments.
 *
 * Route: /communities/[id]/payments
 * Auth: any community member (owners see their own unit, staff sees all).
 */
export default async function PaymentsPage({ params }: PageProps) {
  const { id } = await params;
  const communityId = Number(id);

  if (!Number.isFinite(communityId) || communityId <= 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold text-gray-900">Payments</h1>
        <p className="mt-2 text-sm text-red-600">Invalid community ID</p>
      </div>
    );
  }

  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, userId);

  return (
    <PaymentPortal
      communityId={communityId}
      userId={userId}
      userRole={membership.role}
      isUnitOwner={membership.isUnitOwner}
    />
  );
}
