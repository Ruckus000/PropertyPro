/**
 * Website builder, Phase 2B — `/api/v1/pm/site/look`.
 *
 * PATCH — draft a look (`{ lookId }`), or keep the one the site has
 *         (`{ keepCurrent: true }`). See the contract for both forms.
 * POST  — publish a look in one click (the look picker's Publish this look).
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
 * Every form is audited as an `update` of `site_look`, right after the write
 * it records; a request that fails writes no row. A switch that changes the page
 * also leaves its own `community_site` row, which the service writes inside the
 * transaction that stages the drafts.
 */
import { captureException } from '@sentry/nextjs';
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
import { draftLookSwitch, withdrawDraftedLook } from '@/lib/services/site-look-service';
import { publishCommunitySite } from '@/lib/services/site-blocks-service';
import { siteLookPatchContract, siteLookPostContract } from './contract';

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
      // First, so the site is never marked as keeping a look that is still
      // drafted to replace it. It audits its own write when it withdraws one.
      if (body.withdrawDraftedLook) await withdrawDraftedLook(communityId, { actorUserId: userId });
      await markSiteOnboardingComplete(communityId);
      await logAuditEvent({
        userId,
        communityId,
        action: 'update',
        resourceType: 'site_look',
        resourceId: String(communityId),
        newValues: body.withdrawDraftedLook ? { keepCurrent: true, withdrawDraftedLook: true } : { keepCurrent: true },
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

/**
 * Publish this look (D9), in this order:
 *   1. `draftLookSwitch`: the look as a draft. When the picker's card already
 *      drafted it, this changes nothing, so edits made since are kept.
 *   2. `publishCommunitySite`: the site's drafts go live, this look and any
 *      other pending edit alike. A stale `expectedPublishedAt` is its 409, and
 *      nothing below runs.
 *   3. `markSiteOnboardingComplete`: the moment the manager first chose a look
 *      (stamped once). It and the audit row run after the publish has
 *      committed, so a failure in either is reported to Sentry, not returned.
 *   4. `tryAutoComplete(…, 'customize_portal')`: the checklist item.
 *
 * Publishing never emails residents or owners: that is the website home's own
 * **Email owners** action, so `notifyResidentsOfSitePublish` is not called here.
 *
 * Choosing the live look with nothing else pending publishes nothing (the
 * picker disables the button then, so only a race reaches it). It still counts
 * as the manager's choice, so onboarding and the checklist item are marked, and
 * it answers `publishedAt: null`.
 */
/** Runs a step that follows a committed publish; a failure goes to Sentry instead of the response. */
async function afterPublish(step: string, communityId: number, work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch (err) {
    captureException(err, { tags: { site_look_after_publish: step }, extra: { communityId } });
  }
}

export const POST = withErrorHandler(
  runRoute(siteLookPostContract, async ({ body, communityId }) => {
    const userId = await ensurePmAccess(communityId);

    await draftLookSwitch(communityId, body.lookId, { actorUserId: userId });
    const result = await publishCommunitySite({
      communityId,
      actorUserId: userId,
      expectedPublishedAt: body.expectedPublishedAt ? new Date(body.expectedPublishedAt) : null,
    });
    const publishedAt = result.published ? result.publishedAt.toISOString() : null;
    // The publish has committed: the site is live with the look. A failure in
    // what follows is reported, not returned, so the manager is not told a
    // publish failed that did not (and does not publish again over it).
    await afterPublish('mark_onboarding', communityId, () => markSiteOnboardingComplete(communityId));
    await afterPublish('audit', communityId, () =>
      logAuditEvent({
        userId,
        communityId,
        action: 'update',
        resourceType: 'site_look',
        resourceId: String(communityId),
        newValues: { lookId: body.lookId, publishedAt },
      }),
    );
    // Never throws: a checklist failure must not undo a publish already made.
    await tryAutoComplete(communityId, userId, 'customize_portal');
    return { publishedAt, lookId: body.lookId };
  }),
);
