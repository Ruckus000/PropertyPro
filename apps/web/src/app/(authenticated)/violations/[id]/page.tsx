// breadcrumbs:exempt — delegated to apps/web/src/components/violations/ViolationDetailView.tsx
/**
 * Violation Detail Page — Phase 1C
 *
 * Route: /violations/:id?communityId=X
 * Auth: residents see own-unit violations only; admins see all
 * Feature gate: hasViolations must be enabled for the community type
 */
import { redirect, notFound } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { createScopedClient } from '@propertypro/db';
import { isResidentRole, getActorUnitIds } from '@/lib/violations/common';
import { getViolationForCommunity } from '@/lib/services/violations-service';
import { ViolationDetailView } from '@/components/violations/ViolationDetailView';
import { FeatureGate } from '@/components/billing/feature-gate';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}

export default async function ViolationDetailPage({ params, searchParams }: PageProps) {
  const [{ id: rawViolationId }, searchParamsResolved] = await Promise.all([
    params,
    searchParams,
  ]);
  const violationId = Number(rawViolationId);
  const rawCommunityId = Number(searchParamsResolved['communityId']);

  if (!Number.isInteger(rawCommunityId) || rawCommunityId <= 0) {
    redirect('/dashboard?reason=invalid-selection');
  }
  if (!Number.isInteger(violationId) || violationId <= 0) {
    notFound();
  }

  const communityId = rawCommunityId;
  let userId: string;

  try {
    userId = await requireAuthenticatedUserId();
  } catch {
    redirect('/auth/login');
  }

  const membership = await requireCommunityMembership(communityId, userId);

  const typeFeatures = getFeaturesForCommunity(membership.communityType);
  if (!typeFeatures.hasViolations) {
    redirect('/dashboard?reason=feature-unavailable');
  }

  // Scope to actor's units if resident
  const scoped = createScopedClient(communityId);
  const allowedUnitIds = isResidentRole(membership.role)
    ? await getActorUnitIds(scoped, userId)
    : undefined;

  let violation;
  try {
    violation = await getViolationForCommunity(communityId, violationId, allowedUnitIds);
  } catch {
    notFound();
  }

  return (
    <FeatureGate feature="hasViolations" communityId={communityId}>
    <div className="mx-auto max-w-3xl">
      <ViolationDetailView
        violation={violation}
        communityId={communityId}
        userId={userId}
        isAdmin={membership.isAdmin}
      />
    </div>
    </FeatureGate>
  );
}
