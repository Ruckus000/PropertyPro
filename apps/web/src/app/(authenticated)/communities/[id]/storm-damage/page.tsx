/**
 * Storm-damage intake page (Wave 1 differentiation).
 *
 * Route: /communities/[id]/storm-damage
 * Auth: any community member. Every resident can file a report and see their
 *       own; management additionally sees all and controls status.
 * Feature gate: hasStormTools (per-community; ships dark until enabled).
 *
 * This RECORDS damage for the association — it is NOT an insurance claim and
 * PropertyPro is not a public adjuster (§626.854). See
 * `@/lib/constants/storm-disclaimers` for the attorney-gated copy.
 *
 * The `[id]` path segment is the authoritative tenant id; this page is not a
 * `[param]/page.tsx` leaf, so it mirrors the sibling insurance page and renders
 * a plain PageHeader (no breadcrumb) — consistent with guard:breadcrumbs scope.
 */
import { redirect } from 'next/navigation';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { getEffectiveFeaturesForPage } from '@/lib/middleware/plan-guard';
import { PageHeader } from '@/components/shared/page-header';
import { StormDamageSection } from '@/components/storm-damage/storm-damage-section';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function StormDamagePage({ params }: PageProps) {
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
  if (!features.hasStormTools) {
    redirect('/dashboard?reason=feature-not-available');
  }

  return (
    <>
      <PageHeader
        title="Storm Damage"
        description="Record post-storm damage to your building and common areas so your association has it on file. These are records for the association's reference — submitting one does not start an insurance claim."
      />

      <div className="mt-8">
        <StormDamageSection communityId={communityId} canManage={membership.isAdmin} />
      </div>
    </>
  );
}
