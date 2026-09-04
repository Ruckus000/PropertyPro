/**
 * PR #8b: Atomic community-wide publish endpoint.
 *
 * POST /api/v1/pm/site/publish — runs spec §2.7's atomic publish
 * transaction. Thin wrapper around `publishCommunitySite` from PR #8a.
 *
 * Authorization: caller must hold pm_admin or cam in the target community
 * and the community's subscription plan must include `hasSiteEditor`.
 * Same `ensurePmAccess` shape used by the hero and blocks routes.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requireRole, PM_MANAGER_ROLES } from '@/lib/api/role-guard';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { publishCommunitySite } from '@/lib/services/site-blocks-service';
import { notifyResidentsOfSitePublish } from '@/lib/services/site-publish-notification';
import { requirePermission } from '@/lib/db/access-control';
import { markSiteOnboardingComplete } from '@/lib/api/branding';
import { publishCommunitySiteContract } from './contract';
import type { NextRequest } from 'next/server';

async function ensurePmAccess(req: NextRequest, communityId: number) {
  const userId = await requireAuthenticatedUserId();
  const effective = resolveEffectiveCommunityId(req, communityId);
  const membership = await requireCommunityMembership(effective, userId);
  requireRole(membership, PM_MANAGER_ROLES, 'Only property managers can publish the community site');
  await requirePlanFeature(effective, 'hasSiteEditor');
  return { userId, communityId: effective, membership };
}

export const POST = withErrorHandler(
  runRoute(publishCommunitySiteContract, async ({ body, req }) => {
    const { userId, communityId, membership } = await ensurePmAccess(req, body.communityId);

    // Gate the broadcast on the power it actually exercises. Publishing the
    // site and mailing every resident are different authorities: `announcements
    // write` is the manager-only row in the RBAC matrix, and checking it HERE
    // — before the publish — means a caller who may publish but may not
    // announce is refused outright rather than having the site go live and the
    // notification silently dropped afterwards.
    if (body.notifyResidents) {
      requirePermission(membership, 'announcements', 'write');
    }

    const expectedPublishedAt = body.expectedPublishedAt
      ? new Date(body.expectedPublishedAt)
      : null;

    // publishCommunitySite throws ConflictError (HTTP 409) on optimistic-
    // concurrency mismatch — withErrorHandler maps it to the canonical
    // error envelope. The two happy outcomes (published / nothing-to-publish)
    // both return 200; the consumer narrows on `result.published`.
    const result = await publishCommunitySite({
      communityId,
      actorUserId: userId,
      expectedPublishedAt,
    });

    // Wizard final-step publish marks onboarding complete. Done after (and
    // outside) the publish transaction on purpose: completion is a separate
    // concern from draft-promotion, and the wizard should mark complete even
    // when the publish was a no-op (`nothing-to-publish` rolls back the tx but
    // is not an error — the PM still finished the wizard). Errors from
    // publishCommunitySite short-circuit before reaching here.
    if (body.markOnboardingComplete) {
      await markSiteOnboardingComplete(communityId);
    }

    // Only after a publish that actually changed something. `nothing-to-publish`
    // rolls the transaction back, so notifying there would mail an entire
    // association about a no-op.
    //
    // `notifyResidentsOfSitePublish` never throws: the publish transaction has
    // already committed and there is nothing to roll back, so a delivery
    // failure must not turn a successful publish into an error response. It
    // returns its outcome instead, and that outcome goes on the wire — a PM who
    // ticked the box is told what really happened rather than being left to
    // assume residents were reached.
    if (body.notifyResidents && result.published) {
      const residentNotification = await notifyResidentsOfSitePublish({
        communityId,
        actorUserId: userId,
        summary: body.notifyResidents.summary,
      });
      return { ...result, residentNotification };
    }

    return result;
  }),
);
