/**
 * Scheduled community-site publishes (launch blocker #7).
 *
 * Authorization mirrors the immediate publish endpoint exactly: PM manager role
 * plus the `hasSiteEditor` plan feature. Scheduling a publish is the same
 * authority as publishing — it just happens later — so it must not be reachable
 * by anyone who could not press the button now. A caller who also asks to
 * notify residents needs `announcements:write` on top, checked here for the
 * same reason the immediate endpoint checks it before publishing.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requireRole, PM_MANAGER_ROLES } from '@/lib/api/role-guard';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { requirePermission } from '@/lib/db/access-control';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { ValidationError } from '@/lib/api/errors';
import {
  cancelSitePublishSchedule,
  getPendingSitePublishSchedule,
  maxScheduleDate,
  scheduleSitePublish,
  MAX_SCHEDULE_DAYS_AHEAD,
} from '@/lib/services/site-publish-schedule-service';
import {
  cancelSitePublishScheduleContract,
  createSitePublishScheduleContract,
  getSitePublishScheduleContract,
} from './contract';
import type { NextRequest } from 'next/server';

async function ensurePmAccess(req: NextRequest, communityId: number) {
  const userId = await requireAuthenticatedUserId();
  const effective = resolveEffectiveCommunityId(req, communityId);
  const membership = await requireCommunityMembership(effective, userId);
  requireRole(
    membership,
    PM_MANAGER_ROLES,
    'Only property managers can schedule a site publish',
  );
  await requirePlanFeature(effective, 'hasSiteEditor');
  return { userId, communityId: effective, membership };
}

export const GET = withErrorHandler(
  runRoute(getSitePublishScheduleContract, async ({ query, req }) => {
    const { communityId, membership } = await ensurePmAccess(req, query.communityId);
    // A lapsed community's managers lose admin reads; residents are unaffected.
    // Same gate every other admin GET carries.
    await requireEntitledForAdminRead(communityId, membership);
    return { schedule: await getPendingSitePublishSchedule(communityId) };
  }),
);

export const POST = withErrorHandler(
  runRoute(createSitePublishScheduleContract, async ({ body, req }) => {
    const { userId, communityId, membership } = await ensurePmAccess(req, body.communityId);

    if (body.notifyResidents) {
      requirePermission(membership, 'announcements', 'write');
    }

    const scheduledFor = new Date(body.scheduledFor);
    const now = new Date();

    /*
     * Both bounds are relative to the request instant, which the contract's
     * static schema cannot express — hence here rather than in Zod.
     */
    if (scheduledFor.getTime() <= now.getTime()) {
      throw new ValidationError('Pick a time in the future.', {
        fields: [
          { field: 'scheduledFor', message: 'The scheduled time has already passed.' },
        ],
      });
    }

    if (scheduledFor.getTime() > maxScheduleDate(now).getTime()) {
      throw new ValidationError(
        `Publishes can be scheduled up to ${MAX_SCHEDULE_DAYS_AHEAD} days ahead.`,
        {
          fields: [
            {
              field: 'scheduledFor',
              message: `Pick a time within ${MAX_SCHEDULE_DAYS_AHEAD} days.`,
            },
          ],
        },
      );
    }

    const schedule = await scheduleSitePublish({
      communityId,
      actorUserId: userId,
      scheduledFor,
      notifySummary: body.notifyResidents?.summary ?? null,
    });

    return { schedule };
  }),
);

export const DELETE = withErrorHandler(
  runRoute(cancelSitePublishScheduleContract, async ({ query, req }) => {
    const { userId, communityId } = await ensurePmAccess(req, query.communityId);
    return { canceled: await cancelSitePublishSchedule(communityId, userId) };
  }),
);
