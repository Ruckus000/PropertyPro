/**
 * E-Sign landing page.
 *
 * Route: /esign?communityId=X
 * Auth: admin roles only.
 * Feature gate: hasEsign must be true.
 *
 * Two tabs: "Documents" (submissions) | "Templates" (links to templates page).
 * Primary CTA: "Send Document".
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { getFeaturesForCommunity, isAdminRole } from '@propertypro/shared';
import { EsignPageShell } from '@/components/esign/esign-page-shell';
import { FeatureGate } from '@/components/billing/feature-gate';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function EsignPage({ searchParams }: PageProps) {
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

  // Type-gate first (community type doesn't support e-sign at all → redirect).
  // Plan-gate is delegated to <FeatureGate> for the marketing surface.
  const typeFeatures = getFeaturesForCommunity(membership.communityType);
  if (!typeFeatures.hasEsign) {
    redirect('/dashboard?reason=feature-not-available');
  }

  if (!isAdminRole(membership.role)) {
    redirect('/dashboard?reason=insufficient-permissions');
  }

  return (
    <FeatureGate feature="hasEsign" communityId={communityId}>
      <EsignPageShell communityId={communityId} />
    </FeatureGate>
  );
}
