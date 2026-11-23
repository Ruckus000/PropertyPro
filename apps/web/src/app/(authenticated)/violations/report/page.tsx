// page-template: delegated to apps/web/src/components/violations/report-violation-page.tsx
/**
 * Report a violation.
 *
 * Route: /violations/report?communityId=X
 * Auth: any community member; filing is checked by the API (violations:write).
 * Feature gate: hasViolations must be enabled for the community type
 *
 * Form by role (resolveReportMode):
 *  - Resident with a unit → report form whose unit picker offers ANY unit
 *    (neighbour complaints belong on the neighbour's unit, D1), with a link to
 *    the Mine tab on /violations, where their cases and reports are listed.
 *  - Resident without a unit → guard state, no form
 *  - Staff (property_manager / root_manager) → file-on-behalf form
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { createScopedClient } from '@propertypro/db';
import { getActorUnitIds, isResidentRole } from '@/lib/violations/common';
import { resolveReportMode } from '@/lib/violations/report-mode';
import { FeatureGate } from '@/components/billing/feature-gate';
import { ReportViolationPage } from '@/components/violations/report-violation-page';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function ViolationReportPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const rawId = Number(params['communityId']);

  if (!Number.isInteger(rawId) || rawId <= 0) {
    redirect('/dashboard?reason=invalid-selection');
  }

  const communityId = rawId;
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

  const residentUnitIds = isResidentRole(membership.role)
    ? await getActorUnitIds(createScopedClient(communityId), userId)
    : [];
  const mode = resolveReportMode(membership.role, residentUnitIds);

  return (
    <FeatureGate feature="hasViolations" communityId={communityId}>
      <ReportViolationPage communityId={communityId} mode={mode} ownUnitIds={residentUnitIds} />
    </FeatureGate>
  );
}
