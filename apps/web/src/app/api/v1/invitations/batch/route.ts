/**
 * POST /api/v1/invitations/batch — invite or re-invite up to 100 members.
 *
 * Same gates as POST /api/v1/invitations (residents:write, demo grace) and the
 * same per-user path (sendCommunityInvitation: membership check, token, email,
 * audit). One user failing does not stop the rest; every user gets a result
 * so the caller can say "9 sent, 3 failed".
 */
import { captureException } from '@sentry/nextjs';
import { withErrorHandler } from '@/lib/api/error-handler';
import { AppError, NotFoundError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { runRoute } from '@/lib/api/run-route';
import { requirePermission } from '@/lib/db/access-control';
import { inviterNameFrom, sendCommunityInvitation } from '@/lib/invitations/send-community-invitation';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { getCommunityNameForInvitation } from '@/lib/services/invitations-service';
import { batchInvitationContract } from './contract';

export const POST = withErrorHandler(
  runRoute(batchInvitationContract, async ({ body, req, communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();
    await assertNotDemoGrace(communityId);
    const actorMembership = await requireCommunityMembership(communityId, actorUserId);
    requirePermission(actorMembership, 'residents', 'write');

    const community = await getCommunityNameForInvitation(communityId);
    if (!community) {
      throw new NotFoundError(`Community ${communityId} not found`);
    }

    const inviterName = inviterNameFrom(req);
    const results: Array<{ userId: string; status: 'sent' | 'failed'; error?: string }> = [];
    // ponytail: serial sends, ~100 max per request; fan out only if a batch
    // this size is measured as too slow (the email provider rate-limits too).
    for (const userId of [...new Set(body.userIds)]) {
      try {
        await sendCommunityInvitation({
          communityId,
          communityName: community.name,
          userId,
          actorUserId,
          inviterName,
          ttlDays: body.ttlDays,
        });
        results.push({ userId, status: 'sent' });
      } catch (err) {
        // Expected refusals (not a member, unknown user) are AppErrors with a
        // safe message. Anything else is caught here, so it never reaches the
        // error handler — report it explicitly, and show a generic message.
        if (!(err instanceof AppError)) {
          captureException(err, { tags: { route: 'invitations.batch' }, extra: { communityId, userId } });
        }
        results.push({
          userId,
          status: 'failed',
          error: err instanceof AppError ? err.message : 'Could not send the invitation',
        });
      }
    }
    return { results };
  }),
);
