/**
 * Website builder, D5 — `/api/v1/pm/site/live-notice`.
 *
 * POST  — **Email owners** that the site is live. Once per community.
 * PATCH — dismiss the offer (`{ dismissed: true }`).
 *
 * Authorization is the website routes' gate (`ensurePmAccess`, as the look route
 * uses it): a management role in the target community plus the `hasSiteEditor`
 * plan feature, with a demo in its grace window refused first. The community is
 * resolved by the runner (`tenantScope: { in: 'body' }`). POST then needs
 * `announcements:write`, because it posts an announcement and mails people.
 *
 * Publishing never calls this and this never publishes. The send is claimed
 * BEFORE it is made (`claimSiteLiveNotice`, one conditional UPDATE), so the
 * second of two concurrent requests is a 409 that sends nothing.
 */
import { logAuditEvent } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ConflictError } from '@/lib/api/errors';
import { requireRole, PM_MANAGER_ROLES } from '@/lib/api/role-guard';
import { runRoute } from '@/lib/api/run-route';
import { requirePermission } from '@/lib/db/access-control';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import {
  claimSiteLiveNotice,
  dismissSiteLiveNotice,
  getSiteLiveNoticeState,
  releaseSiteLiveNotice,
} from '@/lib/services/site-live-notice-service';
import { notifyResidentsOfSitePublish } from '@/lib/services/site-publish-notification';
import { siteLiveNoticePatchContract, siteLiveNoticePostContract } from './contract';

/** The summary owners see as the subject line. */
const SITE_LIVE_SUMMARY = 'Our community website is live';

/** The website routes' gate, minus the community step the runner has already taken. */
async function ensurePmAccess(communityId: number) {
  const userId = await requireAuthenticatedUserId();
  // A demo in its grace window is read-only. Before membership, per api-patterns.md.
  await assertNotDemoGrace(communityId);
  const membership = await requireCommunityMembership(communityId, userId);
  requireRole(membership, PM_MANAGER_ROLES, 'Only property managers can email owners about the site');
  await requirePlanFeature(communityId, 'hasSiteEditor');
  return { userId, membership };
}

export const POST = withErrorHandler(
  runRoute(siteLiveNoticePostContract, async ({ communityId }) => {
    const { userId, membership } = await ensurePmAccess(communityId);
    requirePermission(membership, 'announcements', 'write');

    // Before claiming: the one send must not be spent on nobody.
    if ((await getSiteLiveNoticeState(communityId)).ownerCount === 0) {
      throw new ConflictError('There are no owners to email yet.');
    }

    if (!(await claimSiteLiveNotice(communityId))) {
      // The claim also fails when the offer was dismissed; say which it was.
      const state = await getSiteLiveNoticeState(communityId);
      throw new ConflictError(
        state.sentAt === null && state.dismissedAt !== null
          ? "This email was dismissed, so it wasn't sent."
          : 'Owners have already been emailed that the site is live.',
      );
    }

    const result = await notifyResidentsOfSitePublish({
      communityId,
      actorUserId: userId,
      summary: SITE_LIVE_SUMMARY,
      audience: 'owners_only',
      intro: 'Your community now has a website.',
      linkLabel: 'Visit the website',
      source: 'site_live_notice',
    });

    if (result.status === 'failed') {
      // Nothing was recorded, so owners were not told: give the claim back.
      await releaseSiteLiveNotice(communityId);
      return { status: 'failed' as const, reason: result.reason };
    }
    // `partial` keeps the claim: the announcement exists in owners' feeds, and a
    // second send would post it again.
    if (result.status === 'partial') {
      return { status: 'partial' as const, reason: result.reason };
    }
    return { status: 'sent' as const, recipientCount: result.recipientCount };
  }),
);

export const PATCH = withErrorHandler(
  runRoute(siteLiveNoticePatchContract, async ({ communityId }) => {
    const { userId } = await ensurePmAccess(communityId);

    await dismissSiteLiveNotice(communityId);
    await logAuditEvent({
      userId,
      communityId,
      action: 'update',
      resourceType: 'site_live_notice',
      resourceId: String(communityId),
      newValues: { dismissed: true },
    });
    return { ok: true as const };
  }),
);
