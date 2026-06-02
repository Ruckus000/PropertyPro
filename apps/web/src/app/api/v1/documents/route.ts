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
import { NextResponse } from 'next/server';
import { runRoute } from '@propertypro/api-contract';
import { logAuditEvent } from '@propertypro/db';
import type { DocumentMutationWarning } from '@/lib/documents/types';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { validateUploadFilePath } from '@/lib/api/upload-path';
import { isElevatedRole } from '@propertypro/shared';
import { requirePermission } from '@/lib/db/access-control';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import { createUploadedDocument } from '@/lib/documents/create-uploaded-document';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { tryAutoComplete } from '@/lib/services/onboarding-checklist-service';
import {
  getDocumentForDeletionAudit,
  paginateAccessibleDocuments,
  softDeleteDocument,
} from '@/lib/services/documents-service';
import {
  documentsCreateContract,
  documentsDeleteContract,
  documentsListContract,
} from './contract';

export const GET = withErrorHandler(
  runRoute(documentsListContract, async ({ query, req }) => {
    const userId = await requireAuthenticatedUserId();

    const effectiveCommunityId = resolveEffectiveCommunityId(req, query.communityId);
    const categoryId = query.categoryId ?? null;

    const membership = await requireCommunityMembership(effectiveCommunityId, userId);

    const result = await paginateAccessibleDocuments({
      filter: {
        communityId: effectiveCommunityId,
        role: membership.role,
        communityType: membership.communityType,
        isUnitOwner: membership.isUnitOwner,
        permissions: membership.permissions,
      },
      categoryId,
      cursor: query.cursor,
      pageSize: query.pageSize,
    });

    return { data: result.data, pagination: result.pagination };
  }),
);

// The pre-migration POST returned the bespoke envelope
// `{ data: <row>, warnings?: [...] }` — `warnings` is a TOP-LEVEL sibling of
// `data` (read by `useDocumentUpload` at `createBody.warnings`). The runner
// only ever produces the single-wrap `{ data: payload }`, so the handler
// returns the row (→ `{ data: <row> }`) and the outer wrapper splices the
// `warnings` sibling back in when non-empty, keeping the wire shape
// byte-identical. Warnings are carried out of the runner handler per-request
// via a `WeakMap` keyed by the request object (race-safe under concurrent
// requests — no shared module-level mutable state).
const warningsByRequest = new WeakMap<object, DocumentMutationWarning[]>();

const runCreateDocument = runRoute(documentsCreateContract, async ({ body, req }) => {
  const userId = await requireAuthenticatedUserId();

  const effectiveCommunityId = resolveEffectiveCommunityId(req, body.communityId);
  validateUploadFilePath(body.filePath, effectiveCommunityId);
  await assertNotDemoGrace(effectiveCommunityId);
  const membership = await requireCommunityMembership(effectiveCommunityId, userId);
  requirePermission(membership, 'documents', 'write');
  await requireActiveSubscriptionForMutation(effectiveCommunityId);

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
  });

  void tryAutoComplete(effectiveCommunityId, userId, 'upload_first_document');
  void tryAutoComplete(effectiveCommunityId, userId, 'upload_community_rules');

  if (result.warnings.length > 0) {
    warningsByRequest.set(req, result.warnings);
  }
  return result.document;
});

export const POST = withErrorHandler(async (req, ctx) => {
  const response = await runCreateDocument(req, ctx);
  const warnings = warningsByRequest.get(req);
  if (!warnings || warnings.length === 0) {
    return response;
  }
  warningsByRequest.delete(req);
  const payload = (await response.json()) as { data: unknown };
  return NextResponse.json(
    { data: payload.data, warnings },
    { status: response.status, headers: response.headers },
  );
});

export const DELETE = withErrorHandler(
  runRoute(documentsDeleteContract, async ({ query, req }) => {
    const userId = await requireAuthenticatedUserId();

    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    await assertNotDemoGrace(communityId);
    const { id } = query;
    const membership = await requireCommunityMembership(communityId, userId);
    if (
      !isElevatedRole(membership.role, {
        isUnitOwner: membership.isUnitOwner,
        permissions: membership.permissions,
      })
    ) {
      throw new ForbiddenError('Only elevated roles can delete documents');
    }
    await requireActiveSubscriptionForMutation(communityId);

    // First, get the document to capture old values for audit
    const docToDelete = await getDocumentForDeletionAudit(communityId, id);

    if (!docToDelete) {
      throw new ValidationError('Document not found');
    }

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
