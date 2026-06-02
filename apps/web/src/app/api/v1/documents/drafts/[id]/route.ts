/**
 * Draft detail — GET (load + soft-lock metadata), PATCH (autosave), DELETE
 * (soft-delete / cancel). Authors can read/edit their own drafts; admins
 * can read/edit any draft in their community to support take-over UX.
 *
 * Plan A1 drain #145. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for schemas and auth-chain rationale.
 */
import { runRoute } from '@propertypro/api-contract';
import { logAuditEvent } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, NotFoundError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import { sanitizeAuthoredHtml } from '@/lib/utils/sanitize-authored-html';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import {
  getDocumentDraftById,
  softDeleteDocumentDraft,
  updateDocumentDraft,
} from '@/lib/services/document-draft-service';
import {
  documentDraftDeleteContract,
  documentDraftGetContract,
  documentDraftPatchContract,
} from './contract';

export const runtime = 'nodejs';

function ensureCanAccessDraft(
  draft: Record<string, unknown>,
  userId: string,
  membership: { isAdmin: boolean },
): void {
  const isAuthor = draft['authorId'] === userId;
  if (isAuthor) return;
  if (membership.isAdmin) return;
  throw new ForbiddenError('Not authorized to access this draft');
}

export const GET = withErrorHandler(
  runRoute(documentDraftGetContract, async ({ params, query, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    requirePermission(membership, 'documents', 'write');

    const draft = await getDocumentDraftById(communityId, params.id);
    if (!draft || draft['deletedAt']) throw new NotFoundError('Draft not found');
    ensureCanAccessDraft(draft, userId, membership);

    return draft;
  }),
);

export const PATCH = withErrorHandler(
  runRoute(documentDraftPatchContract, async ({ params, query, body, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    requirePermission(membership, 'documents', 'write');

    const existing = await getDocumentDraftById(communityId, params.id);
    if (!existing || existing['deletedAt']) throw new NotFoundError('Draft not found');
    ensureCanAccessDraft(existing, userId, membership);

    const update: Record<string, unknown> = {
      lastEditorId: userId,
      lastEditedAt: new Date(),
    };
    if (body.title !== undefined) update['title'] = body.title;
    if (body.bodyHtml !== undefined) update['bodyHtml'] = sanitizeAuthoredHtml(body.bodyHtml);
    if (body.targetCategoryId !== undefined) update['targetCategoryId'] = body.targetCategoryId;
    if (body.coverSheetEnabled !== undefined) update['coverSheetEnabled'] = body.coverSheetEnabled;
    if (body.letterheadOptions !== undefined) {
      update['letterheadOptions'] = body.letterheadOptions;
    }

    const updatedRows = await updateDocumentDraft(communityId, params.id, update);

    return updatedRows[0] ?? existing;
  }),
);

export const DELETE = withErrorHandler(
  runRoute(documentDraftDeleteContract, async ({ params, query, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    requirePermission(membership, 'documents', 'write');

    const existing = await getDocumentDraftById(communityId, params.id);
    if (!existing || existing['deletedAt']) throw new NotFoundError('Draft not found');
    ensureCanAccessDraft(existing, userId, membership);

    await softDeleteDocumentDraft(communityId, params.id);

    await logAuditEvent({
      userId,
      action: 'delete',
      resourceType: 'document_draft',
      resourceId: String(params.id),
      communityId,
    });

    return { id: params.id, deleted: true as const };
  }),
);
