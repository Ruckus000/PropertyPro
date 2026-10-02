/**
 * POST /api/v1/documents/send — send up to 10 documents to up to 100 members.
 *
 * Same gates as uploading a document (documents:write, demo grace, active
 * subscription). Delivery is a courtesy copy that respects each recipient's
 * email preference and document access; see `shareDocuments`. Every recipient
 * gets a result so the caller can say "4 emailed, 2 in digest, 1 opted out".
 */
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { runRoute } from '@/lib/api/run-route';
import { requirePermission } from '@/lib/db/access-control';
import { inviterNameFrom } from '@/lib/invitations/send-community-invitation';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import { consumeEmailBudget } from '@/lib/api/email-budget';
import { shareDocuments } from '@/lib/services/document-share-service';
import { documentsSendContract } from './contract';

export const POST = withErrorHandler(
  runRoute(documentsSendContract, async ({ body, req, communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requirePermission(membership, 'documents', 'write');
    await requireActiveSubscriptionForMutation(communityId);
    // Counted per requested recipient (an upper bound: opted-out and digest
    // recipients get no immediate email), refused whole before anything sends.
    await consumeEmailBudget(actorUserId, new Set(body.userIds).size);

    const results = await shareDocuments({
      communityId,
      communityType: membership.communityType,
      tenantsCanViewInspectionReports: membership.tenantsCanViewInspectionReports,
      documentIds: body.documentIds,
      userIds: body.userIds,
      sendId: body.sendId,
      actorUserId,
      senderName: inviterNameFrom(req),
    });
    return { results };
  }),
);
