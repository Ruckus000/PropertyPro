/**
 * Website builder, Phase 2B — `/api/v1/pm/site/look`.
 *
 * PATCH — draft a look (`{ lookId }`), or keep the one the site has
 *         (`{ keepCurrent: true }`). See the contract for both forms.
 *
 * Authorization is the website routes' gate, the same chain as publish, site
 * settings and the design route (`ensurePmAccess`): a management role in the
 * target community plus the `hasSiteEditor` plan feature, with a demo in its
 * grace window refused first. Resolving the community is the one step the
 * runner takes over: the contract declares `tenantScope: { in: 'body' }`, so
 * `runRoute` reconciles `body.communityId` with the middleware's `x-community-id`
 * header (a body naming another community is a 404) before the handler runs, and
 * hands the result in as `communityId`.
 *
 * Both forms are audited as an `update` of `site_look`, right after the write
 * they record; a request that fails writes no row. A switch that changes the page
 * also leaves its own `community_site` row, which the service writes inside the
 * transaction that stages the drafts.
 */
import { logAuditEvent } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { markSiteOnboardingComplete } from '@/lib/api/branding';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requireRole, PM_MANAGER_ROLES } from '@/lib/api/role-guard';
import { runRoute } from '@/lib/api/run-route';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { tryAutoComplete } from '@/lib/services/onboarding-checklist-service';
import { draftLookSwitch } from '@/lib/services/site-look-service';
import { siteLookPatchContract } from './contract';

/** The website routes' gate, minus the community step the runner has already taken. Returns the caller's id. */
async function ensurePmAccess(communityId: number): Promise<string> {
  const userId = await requireAuthenticatedUserId();
  // A demo in its grace window is read-only. Before membership, per api-patterns.md.
  await assertNotDemoGrace(communityId);
  const membership = await requireCommunityMembership(communityId, userId);
  requireRole(membership, PM_MANAGER_ROLES, 'Only property managers can change the site look');
  await requirePlanFeature(communityId, 'hasSiteEditor');
  return userId;
}

export const PATCH = withErrorHandler(
  runRoute(siteLookPatchContract, async ({ body, communityId }) => {
    const userId = await ensurePmAccess(communityId);

    if ('keepCurrent' in body) {
      await markSiteOnboardingComplete(communityId);
      await logAuditEvent({
        userId,
        communityId,
        action: 'update',
        resourceType: 'site_look',
        resourceId: String(communityId),
        newValues: { keepCurrent: true },
      });
      // Never throws: a checklist failure must not undo a decision already made.
      await tryAutoComplete(communityId, userId, 'customize_portal');
      return { ok: true as const };
    }

    const counts = await draftLookSwitch(communityId, body.lookId, { actorUserId: userId });
    await logAuditEvent({
      userId,
      communityId,
      action: 'update',
      resourceType: 'site_look',
      resourceId: String(communityId),
      newValues: { lookId: body.lookId },
    });
    return counts;
  }),
);
