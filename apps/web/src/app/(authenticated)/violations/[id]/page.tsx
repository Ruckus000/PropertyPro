// breadcrumbs:exempt — delegated to apps/web/src/components/violations/ViolationDetailView.tsx
// page-template: delegated to apps/web/src/components/violations/ViolationDetailView.tsx
/**
 * Violation Detail Page — Phase 1C
 *
 * Route: /violations/:id?communityId=X
 * Auth: residents see own-unit violations only, minus a neighbour's report still
 * awaiting review, and never the reporter's identity; managers and board seats
 * see all and get the actions (getViolationReadUnitIds,
 * residentVisibleViolationsWhere, redactViolationReporter, canActAsBoard)
 * Feature gate: hasViolations must be enabled for the community type
 */
import { redirect, notFound } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { createScopedClient } from '@propertypro/db';
import {
  getViolationReadUnitIds,
  redactViolationReporter,
  residentVisibleViolationsWhere,
} from '@/lib/violations/common';
import { canActAsBoard } from '@/lib/db/access-control';
import { getViolationForCommunity } from '@/lib/services/violations-service';
import { hydrateReportedByRole } from '@/lib/violations/hydrate-reporter-role';
import { ViolationDetailView } from '@/components/violations/ViolationDetailView';
import { FeatureGate } from '@/components/billing/feature-gate';
import { withUnitLabel } from '@/lib/units/unit-labels';

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

  const scoped = createScopedClient(communityId);
  const allowedUnitIds = await getViolationReadUnitIds(scoped, membership, userId);

  let violation;
  try {
    violation = await withUnitLabel(
      scoped,
      redactViolationReporter(
        await getViolationForCommunity(
          communityId,
          violationId,
          allowedUnitIds,
          residentVisibleViolationsWhere(membership, userId),
        ),
        membership,
        userId,
      ),
    );
  } catch {
    notFound();
  }

  // The Details panel names the reporter's standing ("A resident" / "Staff"),
  // the same words the list uses. Only viewers who get the panel (managers and
  // board seats) pay for the lookup; the helper applies the reporter redaction
  // again before it reads anything.
  const canManage = canActAsBoard(membership);
  const reportedByRole = canManage
    ? ((await hydrateReportedByRole(scoped, [violation], { membership, userId }))[0]
        ?.reportedByRole ?? null)
    : null;

  return (
    <FeatureGate feature="hasViolations" communityId={communityId}>
      <ViolationDetailView
        violation={violation}
        communityId={communityId}
        communityTimezone={membership.timezone}
        userId={userId}
        canManage={canManage}
        finesEnabled={membership.violationFinesEnabled}
        reportedByRole={reportedByRole}
      />
    </FeatureGate>
  );
}
