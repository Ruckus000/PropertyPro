/**
 * Document drafts collection — POST creates a new draft (optionally seeded
 * from a meeting or a previously-published authored document for re-edit);
 * GET lists the calling user's drafts within a community.
 *
 * Plan A1 drain #142. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for schemas and auth-chain rationale.
 */
import { runRoute } from '@propertypro/api-contract';
import { logAuditEvent } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { sanitizeAuthoredHtml } from '@/lib/utils/sanitize-authored-html';
import {
  createDocumentDraft,
  getAuthoredDocumentForReedit,
  getMeetingForDraftSeed,
  listMyActiveDocumentDrafts,
} from '@/lib/services/document-draft-service';
import {
  documentDraftsCreateContract,
  documentDraftsListContract,
} from './contract';

export const runtime = 'nodejs';

export const GET = withErrorHandler(
  runRoute(documentDraftsListContract, async ({ query, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    requirePermission(membership, 'documents', 'write');

    return listMyActiveDocumentDrafts(communityId, userId);
  }),
);

export const POST = withErrorHandler(
  runRoute(documentDraftsCreateContract, async ({ body, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    requirePermission(membership, 'documents', 'write');
    await requireActiveSubscriptionForMutation(communityId);

    let title = body.title ?? 'Untitled';
    const initialBody = body.initialBodyHtml ? sanitizeAuthoredHtml(body.initialBodyHtml) : '';

    if (body.targetMeetingId != null) {
      const meeting = await getMeetingForDraftSeed(communityId, body.targetMeetingId);
      if (!meeting) throw new NotFoundError('Meeting not found in this community');
      if (!body.title) {
        const start = meeting.startsAt instanceof Date
          ? meeting.startsAt
          : new Date(String(meeting.startsAt ?? Date.now()));
        const dateLabel = start.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        title = `Minutes — ${String(meeting.title ?? 'Meeting')} — ${dateLabel}`;
      }
    }

    if (body.sourceDocumentId != null) {
      const doc = await getAuthoredDocumentForReedit(communityId, body.sourceDocumentId);
      if (!doc) throw new NotFoundError('Source document not found in this community');
      if (doc.sourceType !== 'authored') {
        throw new ValidationError('Only authored documents can be re-edited');
      }
      if (!body.title) {
        title = String(doc.title ?? 'Untitled');
      }
    }

    const created = await createDocumentDraft(communityId, {
      authorId: userId,
      title,
      bodyHtml: initialBody,
      targetCategoryId: body.targetCategoryId ?? null,
      targetMeetingId: body.targetMeetingId ?? null,
      sourceDocumentId: body.sourceDocumentId ?? null,
      lastEditedAt: new Date(),
    });

    if (!created) {
      throw new ForbiddenError('Failed to create draft');
    }

    await logAuditEvent({
      userId,
      action: 'create',
      resourceType: 'document_draft',
      resourceId: String(created['id']),
      communityId,
      newValues: {
        title,
        targetCategoryId: body.targetCategoryId ?? null,
        targetMeetingId: body.targetMeetingId ?? null,
        sourceDocumentId: body.sourceDocumentId ?? null,
      },
    });

    return created;
  }),
);
