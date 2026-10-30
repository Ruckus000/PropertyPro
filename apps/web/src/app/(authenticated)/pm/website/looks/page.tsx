/**
 * The look picker (website builder, Phase 4; spec C1, D7, D9).
 *
 * Route: /pm/website/looks?communityId=X
 *
 * The site is already live from the day the community was created; this page
 * is the one choice onboarding asks for. Choosing a card drafts that look and
 * Publish this look makes it live in one click (`LookPicker`).
 *
 * ## Authorization
 *
 * The same gates as the website editor (`(site-editor)/pm/website-editor`), and
 * like it this page redirects rather than throwing: a management role in the
 * community, the `hasSiteEditor` plan feature, and an entitled subscription.
 * The routes the picker calls check the role and plan again for themselves.
 *
 * Visiting the page completes the "Customize your portal" checklist item
 * (spec C0): the site is already live, so seeing the choice is the step.
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { resolveLifecycleState, isEntitledState } from '@propertypro/shared';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { hasRole, PM_MANAGER_ROLES } from '@/lib/api/role-guard';
import { getEffectiveFeaturesForPage } from '@/lib/middleware/plan-guard';
import { tryAutoComplete } from '@/lib/services/onboarding-checklist-service';
import { loadSiteFacts } from '@/lib/services/website-home-service';
import { PageBody } from '@/components/shared/page-body';
import { PageHeader } from '@/components/shared/page-header';
import { LookPicker } from '@/components/website-home/look-picker';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function LookPickerPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const rawId = Number(params['communityId']);
  if (!Number.isInteger(rawId) || rawId <= 0) {
    redirect('/pm/dashboard/communities?reason=invalid-selection');
  }
  const communityId = rawId;

  let userId: string;
  try {
    userId = await requireAuthenticatedUserId();
  } catch {
    redirect('/auth/login');
  }

  const membership = await requireCommunityMembership(communityId, userId!);
  if (!hasRole(membership, PM_MANAGER_ROLES)) {
    redirect('/pm/dashboard/communities?reason=invalid-selection');
  }

  const features = await getEffectiveFeaturesForPage(communityId, membership.communityType);
  if (!features.hasSiteEditor) {
    redirect('/pm/dashboard/communities?reason=feature-unavailable');
  }

  // A lapsed community never reaches the picker, as with the editor. The
  // subscription fields come from `membership` (the target community's row),
  // not the shell context, which has no community in the PM portal.
  const lifecycleState = resolveLifecycleState({
    subscriptionStatus: membership.subscriptionStatus,
    subscriptionCanceledAt: membership.subscriptionCanceledAt,
    freeAccessExpiresAt: membership.freeAccessExpiresAt,
  });
  if (!isEntitledState(lifecycleState)) {
    redirect('/pm/dashboard/communities?reason=subscription-lapsed');
  }

  // After every gate, so a refused visit ticks nothing. Never throws.
  const [facts] = await Promise.all([
    loadSiteFacts(communityId),
    tryAutoComplete(communityId, userId!, 'customize_portal'),
  ]);

  return (
    <PageBody>
      <PageHeader title="Pick a look" />
      <LookPicker communityId={communityId} facts={facts} />
    </PageBody>
  );
}
