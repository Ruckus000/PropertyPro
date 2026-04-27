import { redirect } from 'next/navigation';
import { createScopedClient, units } from '@propertypro/db';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { FeatureGate } from '@/components/billing/feature-gate';
import { PaymentPortal } from '@/components/finance/payment-portal';
import { listActorUnitIds } from '@/lib/units/actor-units';

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

  const typeFeatures = getFeaturesForCommunity(membership.communityType);
  if (!typeFeatures.hasFinance) {
    redirect('/dashboard?reason=feature-not-available');
  }

  const resolved = await searchParams;
  const rawUnitId = typeof resolved['unitId'] === 'string' ? resolved['unitId'] : undefined;
  const parsedUnitId = rawUnitId ? Number(rawUnitId) : undefined;
  const queryUnitId = parsedUnitId !== undefined && Number.isFinite(parsedUnitId) && parsedUnitId > 0
    ? parsedUnitId
    : undefined;

  // Staff / manager roles: community-wide dashboard. Skip the per-resident
  // unit-picker flow entirely — PaymentPortal fetches aggregated data.
  if (membership.role !== 'resident') {
    return (
      <FeatureGate feature="hasFinance" communityId={communityId}>
        <PaymentPortal
          communityId={communityId}
          userRole={membership.role}
          mode="community"
        />
      </FeatureGate>
    );
  }

  // Resident path — resolve the actor's visible unit(s) and decide whether to
  // auto-select a single unit, require explicit selection, or pass through.
  let unitId = queryUnitId;
  let actorUnits: Array<{ id: number; label: string }> = [];
  let requiresExplicitUnitSelection = false;

  const scoped = createScopedClient(communityId);
  const actorUnitIds = await listActorUnitIds(scoped, userId);
  const unitRows = await scoped.query(units);
  const visibleUnitIdSet = new Set(actorUnitIds);

  actorUnits = (unitRows as Array<{ id: number; unitNumber: string }>)
    .filter((unit) => visibleUnitIdSet.has(unit.id))
    .map((unit) => ({ id: unit.id, label: `Unit ${unit.unitNumber}` }))
    .sort((a, b) => a.label.localeCompare(b.label));

  if (actorUnits.length === 1) {
    unitId = actorUnits[0]?.id;
  } else if (actorUnits.length > 1) {
    const hasValidSelection = unitId !== undefined && visibleUnitIdSet.has(unitId);
    requiresExplicitUnitSelection = !hasValidSelection;
    if (!hasValidSelection) {
      unitId = undefined;
    }
  }

  return (
    <FeatureGate feature="hasFinance" communityId={communityId}>
      <PaymentPortal
        communityId={communityId}
        userRole={membership.role}
        mode="unit"
        unitId={unitId}
        actorUnits={actorUnits}
        requiresExplicitUnitSelection={requiresExplicitUnitSelection}
      />
    </FeatureGate>
  );
}
