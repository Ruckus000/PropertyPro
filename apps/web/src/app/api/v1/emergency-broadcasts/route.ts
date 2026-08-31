/**
 * Emergency Broadcasts API — list + create.
 *
 * GET  /api/v1/emergency-broadcasts — paginated list (Plan B3 rollout)
 * POST /api/v1/emergency-broadcasts — Create broadcast draft + resolve recipients
 *
 * Plan A1 drain #114 — both methods migrated to `runRoute(contract, handler)`;
 * see `./contract.ts` for schemas, B1 POST envelope migration, and rationale.
 *
 * Emergency broadcasts bypass subscription guard (life-safety over revenue).
 */
import { runRoute } from '@propertypro/api-contract';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { isSmsDispatchGloballyEnabled } from '@/lib/sms/dispatch-flag';
import {
  createBroadcast,
  paginateEmergencyBroadcasts,
} from '@/lib/services/emergency-broadcast-service';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import {
  emergencyBroadcastsCreateContract,
  emergencyBroadcastsListContract,
} from './contract';

const listQuerySchema = z.object({
  cursor: z.string().min(1).max(256).optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

export const GET = withErrorHandler(
  runRoute(emergencyBroadcastsListContract, async ({ query, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    requirePermission(membership, 'emergency_broadcasts', 'read');
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    const { searchParams } = new URL(req.url);
    const parsedQuery = listQuerySchema.safeParse({
      cursor: searchParams.get('cursor') || undefined,
      pageSize: searchParams.get('pageSize') || undefined,
    });
    if (!parsedQuery.success) {
      throw new ValidationError('Invalid query parameters');
    }

    const result = await paginateEmergencyBroadcasts({
      communityId,
      cursor: parsedQuery.data.cursor,
      pageSize: parsedQuery.data.pageSize,
    });

    return { data: result.data, pagination: result.pagination };
  }),
);

export const POST = withErrorHandler(
  runRoute(emergencyBroadcastsCreateContract, async ({ body, req }) => {
    const userId = await requireAuthenticatedUserId();
    const effectiveCommunityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(effectiveCommunityId);
    const membership = await requireCommunityMembership(effectiveCommunityId, userId);
    requirePermission(membership, 'emergency_broadcasts', 'write');

    // NOTE: No requireActiveSubscriptionForMutation() — life-safety bypass

    return createBroadcast({
      communityId: effectiveCommunityId,
      title: body.title,
      body: body.body,
      smsBody: body.smsBody,
      severity: body.severity,
      templateKey: body.templateKey,
      targetAudience: body.targetAudience,
      channels: body.channels,
      // SMS legal gate. Degrades the broadcast to email-only rather than
      // refusing it — an emergency alert must still go out. Deliberately NOT a
      // guard at the top of this handler: a 403 here would kill the email leg
      // too, defeating the life-safety bypass noted above.
      // See @/lib/sms/common and audit F-10.
      smsAllowed: isSmsDispatchGloballyEnabled() && membership.smsDispatchEnabled,
      initiatedBy: userId,
    });
  }),
);
