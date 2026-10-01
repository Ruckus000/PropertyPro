/**
 * Documents API.
 *
 * GET    /api/v1/documents  — paginated documents list (Plan B3 rollout)
 * POST   /api/v1/documents  — upload metadata for a new document
 * DELETE /api/v1/documents  — soft-delete a document by id
 *
 * Plan A1 auto-drain — all three methods migrated to
 * `runRoute(contract, handler)`; see `./contract.ts` for schemas, the
 * preserved auth chains, and response-model rationale.
 *
 * GET pagination (Plan B3):
 * - Cursor-based via the canonical `paginate()` helper (through
 *   `paginateAccessibleDocuments`). Filters push into the SQL `where`
 *   predicate via `buildAccessibleDocumentsFilter()` (source-type filter,
 *   per-role access filter, and the optional `categoryId` match).
 * - Order by `id` desc — stable, monotonic.
 * - Response envelope: `{ data: { data: DocumentRow[], pagination } }`.
 *
 * POST wire shape preserved byte-identical: `{ data: <row>, warnings?: [...] }`
 * (warnings spread only when non-empty).
 * DELETE wire shape preserved: `{ data: { deleted: true, id } }`.
 */
import { runRoute, withEnvelope } from '@propertypro/api-contract';
import { logAuditEvent } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ConflictError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { assertCommunityOwnedStoragePath } from '@/lib/services/storage-validators';
import { requirePermission } from '@/lib/db/access-control';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import {
  createUploadedDocument,
  sendDocumentPostedNotifications,
} from '@/lib/documents/create-uploaded-document';
import {
  enforcePublishRedactionAttestation,
  enforceRedactionAttestation,
} from '@/lib/documents/redaction-attestation';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { tryAutoComplete } from '@/lib/services/onboarding-checklist-service';
import {
  getDocumentForDeletionAudit,
  getDocumentForPublishAudit,
  paginateAccessibleDocuments,
  paginateDeletedDocuments,
  restoreDocument,
  setDocumentPosted,
  setDocumentPublicAccess,
  softDeleteDocument,
  type DocumentPublishAudit,
} from '@/lib/services/documents-service';
import { unlinkChecklistItemsForDocument } from '@/lib/services/compliance-service';
import {
  documentsCreateContract,
  documentsDeleteContract,
  documentsListContract,
  documentsPatchContract,
} from './contract';

export const GET = withErrorHandler(
  runRoute(documentsListContract, async ({ query, req }) => {
    const userId = await requireAuthenticatedUserId();

    const effectiveCommunityId = resolveEffectiveCommunityId(req, query.communityId);
    const categoryId = query.categoryId ?? null;

    const membership = await requireCommunityMembership(effectiveCommunityId, userId);
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(effectiveCommunityId, membership);

    // The board's Deleted column. Gated on `documents:write` rather than the
    // per-role read filter: a soft-deleted record is management's to see and
    // put back, and it is deliberately absent from every other view.
    if (query.deleted === 'true') {
      requirePermission(membership, 'documents', 'write');
      const deletedResult = await paginateDeletedDocuments({
        communityId: effectiveCommunityId,
        ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
        ...(query.pageSize === undefined ? {} : { pageSize: query.pageSize }),
      });
      return { data: deletedResult.data, pagination: deletedResult.pagination };
    }

    const result = await paginateAccessibleDocuments({
      filter: {
        communityId: effectiveCommunityId,
        role: membership.role,
        communityType: membership.communityType,
        isUnitOwner: membership.isUnitOwner,
      },
      categoryId,
      cursor: query.cursor,
      pageSize: query.pageSize,
    });

    // B2: owner/tenant checklists carry `access_document`. Fire on list load so
    // residents can reach 100% — fired unconditionally (residents can't create
    // documents, so gating on presence would dead-end empty communities); a no-op
    // for roles whose checklist doesn't include this key.
    void tryAutoComplete(effectiveCommunityId, userId, 'access_document');

    return { data: result.data, pagination: result.pagination };
  }),
);

// The pre-migration POST returned the bespoke envelope
// `{ data: <row>, warnings?: [...] }` — `warnings` is a TOP-LEVEL sibling of
// `data` (read by `useDocumentUpload` at `createBody.warnings`). The contract
// declares it as an `envelope` sibling and the handler returns it through
// `withEnvelope` (CON-04); passing `undefined` when there are none keeps the
// no-warnings wire shape byte-identical to a bare `{ data: <row> }`.
export const POST = withErrorHandler(
  runRoute(documentsCreateContract, async ({ body, req }) => {
    const userId = await requireAuthenticatedUserId();

    const effectiveCommunityId = resolveEffectiveCommunityId(req, body.communityId);
    // Pins the `documents/` subdirectory, not just `communities/{id}/`. The looser
    // check this replaced accepted any sibling namespace in the same bucket, so a
    // caller could hand in `communities/{id}/esign-signed/7/signed.pdf` and get a
    // `documents` row pointing at an executed contract — which `publicAccess`
    // could then put on the association's public website.
    assertCommunityOwnedStoragePath(body.filePath, effectiveCommunityId, 'documents', 'filePath');
    await assertNotDemoGrace(effectiveCommunityId);
    const membership = await requireCommunityMembership(effectiveCommunityId, userId);
    requirePermission(membership, 'documents', 'write');
    await requireActiveSubscriptionForMutation(effectiveCommunityId);

    // Before the row exists, not after: an unredacted record that reaches the
    // portal and is then deleted was still published (F-02). A DRAFT reaches
    // no portal — only managers see it — so the question waits for posting
    // (PATCH `{ posted: true }`), the moment owners first can.
    if (!body.draft) {
      await enforceRedactionAttestation({
        communityId: effectiveCommunityId,
        categoryId: body.categoryId,
        userId,
        title: body.title,
        attested: body.redactionAttested,
      });
    }

    const result = await createUploadedDocument({
      userId,
      communityId: effectiveCommunityId,
      title: body.title,
      description: body.description ?? null,
      categoryId: body.categoryId,
      filePath: body.filePath,
      fileName: body.fileName,
      fileSize: body.fileSize,
      sourceType: 'library',
      draft: body.draft === true,
    });

    void tryAutoComplete(effectiveCommunityId, userId, 'upload_first_document');
    void tryAutoComplete(effectiveCommunityId, userId, 'upload_community_rules');

    return withEnvelope(result.document, {
      warnings: result.warnings.length > 0 ? result.warnings : undefined,
    });
  }),
);

export const DELETE = withErrorHandler(
  runRoute(documentsDeleteContract, async ({ query, req }) => {
    const userId = await requireAuthenticatedUserId();

    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    await assertNotDemoGrace(communityId);
    const { id } = query;
    const membership = await requireCommunityMembership(communityId, userId);
    // Deleting a document is a destructive write — gate it on the same
    // `documents:write` permission as upload and the drafts/* routes (issue
    // #734). This previously used isElevatedRole(), which is a READ-access
    // predicate (who may view unknown/unmapped categories) and excludes
    // cam/site_manager — so it let owners delete but blocked CAM, contradicting
    // both the upload gate and the RBAC matrix. requirePermission() runs through
    // checkPermissionV2, so the v3 role values (resident / property_manager /
    // root_manager) resolve identically to the upload path.
    // legacy-roles:exempt — past-tense account of a fixed bug; the names are the
    // vocabulary the bug was written in.
    requirePermission(membership, 'documents', 'write');
    await requireActiveSubscriptionForMutation(communityId);

    // First, get the document to capture old values for audit
    const docToDelete = await getDocumentForDeletionAudit(communityId, id);

    if (!docToDelete) {
      throw new ValidationError('Document not found');
    }

    // Unlink any compliance checklist items that satisfy themselves via this
    // document, so a deleted document cannot keep an item "satisfied".
    // The compliance calculator also defends against this at read time.
    await unlinkChecklistItemsForDocument(communityId, id, userId);

    // Perform soft delete
    const deletedRows = await softDeleteDocument(communityId, id);

    if (deletedRows.length === 0) {
      throw new ValidationError('Failed to delete document');
    }

    await logAuditEvent({
      userId,
      action: 'delete',
      resourceType: 'document',
      resourceId: String(id),
      communityId,
      oldValues: {
        title: docToDelete.title,
        categoryId: docToDelete.categoryId,
        filePath: docToDelete.filePath,
        fileName: docToDelete.fileName,
      },
    });

    return { deleted: true as const, id };
  }),
);

/**
 * The only writer for `documents.public_access`.
 *
 * Publishing puts an association record on the open internet: it is what
 * `public-community-reader` filters on for both the site's documents block and
 * the sitemap, and §718.111(12)(g) is the duty it serves. The gate chain is the
 * DELETE chain — the same destructive-write posture — plus a redaction
 * attestation on the publishing direction only.
 */
export const PATCH = withErrorHandler(
  runRoute(documentsPatchContract, async ({ query, body, req }) => {
    const userId = await requireAuthenticatedUserId();

    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    await assertNotDemoGrace(communityId);
    const { id } = query;
    const membership = await requireCommunityMembership(communityId, userId);
    requirePermission(membership, 'documents', 'write');
    await requireActiveSubscriptionForMutation(communityId);

    if (body.restore) {
      const restored = await restoreDocument(communityId, id);
      if (restored.length === 0) {
        throw new ValidationError('Document not found, or not deleted');
      }
      await logAuditEvent({
        userId,
        action: 'update',
        resourceType: 'document',
        resourceId: String(id),
        communityId,
        oldValues: { deleted: true },
        newValues: { deleted: false },
      });
      return { id, restored: true as const };
    }

    const existing = await getDocumentForPublishAudit(communityId, id);
    if (!existing) {
      throw new ValidationError('Document not found');
    }

    if (body.posted !== undefined) {
      return changePostedState({ communityId, userId, id, existing, posted: body.posted, attested: body.redactionAttested });
    }

    // A draft is not public, and cannot be made public: owners have not even
    // been shown it. Post it first.
    if (body.publicAccess === true && existing.postedAt == null) {
      throw new ValidationError('Post this draft before putting it on the public site.');
    }

    // Publishing only. Removing a document from the public site reduces
    // disclosure, so it carries no attestation — gating it would strand a
    // record a board wants pulled.
    if (body.publicAccess === true) {
      await enforcePublishRedactionAttestation({
        communityId,
        // A null category is treated as sensitive by
        // `categoryRequiresRedactionAttestation`: a missing category is not
        // evidence that a document is safe to publish.
        categoryId: existing.categoryId ?? 0,
        userId,
        title: existing.title ?? String(id),
        attested: body.redactionAttested,
      });
    }

    const publicAccess = body.publicAccess === true;
    const updated = await setDocumentPublicAccess(communityId, id, publicAccess);
    if (updated.length === 0) {
      throw new ValidationError('Failed to update document');
    }

    await logAuditEvent({
      userId,
      action: 'update',
      resourceType: 'document',
      resourceId: String(id),
      communityId,
      oldValues: { publicAccess: existing.publicAccess },
      newValues: { publicAccess },
    });

    return { id, publicAccess };
  }),
);

/**
 * PATCH `{ posted }` — post a draft, or take a posted document back to a draft.
 *
 * Posting is when owners first see the document, so it is when the upload's
 * redaction attestation is asked (by category, as on upload) and when
 * residents are notified. Taking it back also takes it off the public site
 * (`setDocumentPosted`) and UNLINKS it from any compliance item, as a delete
 * does: a draft is not a posted record, and several compliance counters
 * (portfolio, welcome, cards) read the link alone. Unlinking keeps them all
 * true without each having to learn about drafts; re-linking after re-posting
 * stamps an honest posting date.
 */
async function changePostedState(params: {
  communityId: number;
  userId: string;
  id: number;
  existing: DocumentPublishAudit;
  posted: boolean;
  attested: boolean | undefined;
}): Promise<{ id: number; posted: boolean }> {
  const { communityId, userId, id, existing, posted } = params;
  const isDraft = existing.postedAt === null;
  if (posted && !isDraft) {
    throw new ValidationError('This document is already posted.');
  }
  if (!posted && isDraft) {
    throw new ValidationError('This document is already a draft.');
  }

  if (posted) {
    await enforceRedactionAttestation({
      communityId,
      // A null category is treated as sensitive, as on the publish path.
      categoryId: existing.categoryId ?? 0,
      userId,
      title: existing.title ?? String(id),
      attested: params.attested,
    });
  }

  const updated = await setDocumentPosted(communityId, id, posted);
  if (updated.length === 0) {
    // Another request changed it between the read and this write.
    throw new ConflictError('This document changed while you were updating it. Reload and try again.');
  }

  if (!posted) {
    await unlinkChecklistItemsForDocument(communityId, id, userId);
  }

  await logAuditEvent({
    userId,
    action: 'update',
    resourceType: 'document',
    resourceId: String(id),
    communityId,
    oldValues: { posted: !posted, publicAccess: existing.publicAccess },
    newValues: { posted, publicAccess: posted ? existing.publicAccess : false },
    metadata: posted ? { change: 'posted' } : { change: 'unposted', complianceLinksCleared: true },
  });

  if (posted && existing.sourceType === 'library') {
    await sendDocumentPostedNotifications({
      communityId,
      documentId: id,
      title: existing.title ?? 'A document',
      actorUserId: userId,
    });
  }

  return { id, posted };
}
