/**
 * The website home (website builder, Phase 4; spec C2, D7).
 *
 * Route: /pm/website?communityId=X[&published=1]
 *
 * Where a manager comes back to the association's website: its status, the
 * Florida records still missing, meetings coming up, the details it shows,
 * the look with Edit, Change look and Restore, and the transparency page.
 * The look picker lands here with `published=1` after a publish.
 *
 * ## Authorization
 *
 * The same gates as the website editor (`(site-editor)/pm/website-editor`),
 * and like it this page redirects rather than throwing: a management role in
 * the community, the `hasSiteEditor` plan feature, and an entitled
 * subscription. A resident is sent away. The routes the page calls check the
 * role and plan again for themselves.
 *
 * ## Before loading
 *
 * A condo or HOA created by a manager has no compliance checklist rows until
 * something creates them, and would read as missing nothing (spec correction
 * 6). So the checklist is initialized first, after every gate, so a refused
 * visit writes nothing. It only inserts rows that are absent.
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { resolveLifecycleState, isEntitledState } from '@propertypro/shared';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { hasRole, PM_MANAGER_ROLES } from '@/lib/api/role-guard';
import { getEffectiveFeaturesForPage } from '@/lib/middleware/plan-guard';
import { ensureTransparencyChecklistInitialized } from '@/lib/services/transparency-service';
import { loadWebsiteHome } from '@/lib/services/website-home-service';
import { PageBody } from '@/components/shared/page-body';
import { PageHeader } from '@/components/shared/page-header';
import { WebsiteHome } from '@/components/website-home/website-home';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function WebsiteHomePage({ searchParams }: PageProps) {
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

  // As with the editor, the subscription fields come from `membership` (the
  // target community's row), not the shell context, which has no community in
  // the PM portal.
  const lifecycleState = resolveLifecycleState({
    subscriptionStatus: membership.subscriptionStatus,
    subscriptionCanceledAt: membership.subscriptionCanceledAt,
    freeAccessExpiresAt: membership.freeAccessExpiresAt,
  });
  if (!isEntitledState(lifecycleState)) {
    redirect('/pm/dashboard/communities?reason=subscription-lapsed');
  }

  if (membership.communityType === 'condo_718' || membership.communityType === 'hoa_720') {
    await ensureTransparencyChecklistInitialized(communityId, membership.communityType);
  }

  const data = await loadWebsiteHome(communityId, userId!, {
    includeHistory: features.hasSitePolishBlocks,
  });

  return (
    <PageBody>
      <PageHeader title="Website" />
      <WebsiteHome
        communityId={communityId}
        data={data}
        published={params['published'] === '1'}
        now={new Date().toISOString()}
        timeZone={membership.timezone}
      />
    </PageBody>
  );
}
