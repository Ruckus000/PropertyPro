/**
 * Documents API.
 *
 * GET    /api/v1/documents  — paginated documents list (Plan B3 rollout)
 * POST   /api/v1/documents  — upload metadata for a new document
 * DELETE /api/v1/documents  — soft-delete a document by id
 *
 * GET pagination (Plan B3):
 * - Cursor-based via the canonical `paginate()` helper from `@propertypro/db`.
 * - Filters push into the SQL `where` predicate via
 *   `buildAccessibleDocumentsFilter()` (combines source-type filter,
 *   per-role access filter, and the optional `categoryId` match).
 * - Order by `id` desc — the prior `getAccessibleDocuments` had no
 *   `orderBy` so the documents list was returned in postgres heap order
 *   (undefined). `id desc` is a strict improvement: stable, monotonic, and
 *   matches the rest of the B3 rollout.
 * - Response envelope is double-wrapped per the paginated-route contract:
 *   `{ data: { data: DocumentRow[], pagination } }`.
 *
 * Other consumers of `getAccessibleDocuments` (mobile/documents page,
 * /documents/drafts/[id]/document-search, /documents/[id]/versions) keep
 * using it — they need the full filtered list and don't paginate.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { logAuditEvent } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { validateUploadFilePath } from '@/lib/api/upload-path';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
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

const createDocumentSchema = z.object({
  communityId: z.number().int().positive(),
  title: z.string().min(1).max(500),
  description: z.string().nullable().optional(),
  categoryId: z.number().int().positive(),
  filePath: z.string().min(1),
  fileName: z.string().min(1),
  fileSize: z.number().int().positive(),
  mimeType: z.string().min(1).optional(),
});

const listQuerySchema = z.object({
  cursor: z.string().min(1).max(256).optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();

  const { searchParams } = new URL(req.url);
  const communityId = Number(searchParams.get('communityId'));
  const categoryIdRaw = searchParams.get('categoryId');

  if (!Number.isInteger(communityId) || communityId <= 0) {
    throw new ValidationError('communityId query parameter is required and must be a positive integer');
  }
  const effectiveCommunityId = resolveEffectiveCommunityId(req, communityId);
  let categoryId: number | null = null;
  if (categoryIdRaw != null) {
    const parsedCategoryId = Number(categoryIdRaw);
    if (!Number.isInteger(parsedCategoryId) || parsedCategoryId <= 0) {
      throw new ValidationError('categoryId query parameter must be a positive integer');
    }
    categoryId = parsedCategoryId;
  }

  // Use `||` not `??` so empty-string query params (`?cursor=`, `?pageSize=`)
  // are treated as missing rather than passed to Zod, which would 400 on the
  // `min(1)` / `positive()` constraints.
  const parsedQuery = listQuerySchema.safeParse({
    cursor: searchParams.get('cursor') || undefined,
    pageSize: searchParams.get('pageSize') || undefined,
  });
  if (!parsedQuery.success) {
    throw new ValidationError('Invalid query parameters');
  }

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
    cursor: parsedQuery.data.cursor,
    pageSize: parsedQuery.data.pageSize,
  });

  return NextResponse.json({
    data: {
      data: result.data,
      pagination: result.pagination,
    },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();

  const body: unknown = await req.json();
  const parseResult = createDocumentSchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError('Invalid document payload', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const payload = parseResult.data;
  const effectiveCommunityId = resolveEffectiveCommunityId(req, payload.communityId);
  validateUploadFilePath(payload.filePath, effectiveCommunityId);
  await assertNotDemoGrace(effectiveCommunityId);
  const membership = await requireCommunityMembership(effectiveCommunityId, userId);
  requirePermission(membership, 'documents', 'write');
  await requireActiveSubscriptionForMutation(effectiveCommunityId);

  const result = await createUploadedDocument({
    userId,
    communityId: effectiveCommunityId,
    title: payload.title,
    description: payload.description ?? null,
    categoryId: payload.categoryId,
    filePath: payload.filePath,
    fileName: payload.fileName,
    fileSize: payload.fileSize,
    sourceType: 'library',
  });

  void tryAutoComplete(effectiveCommunityId, userId, 'upload_first_document');
  void tryAutoComplete(effectiveCommunityId, userId, 'upload_community_rules');

  return NextResponse.json(
    {
      data: result.document,
      ...(result.warnings.length > 0 ? { warnings: result.warnings } : {}),
    }
  );
});

const deleteDocumentSchema = z.object({
  id: z.coerce.number().int().positive(),
  communityId: z.coerce.number().int().positive(),
});

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();

  const { searchParams } = new URL(req.url);
  const parseResult = deleteDocumentSchema.safeParse({
    id: searchParams.get('id'),
    communityId: searchParams.get('communityId'),
  });

  if (!parseResult.success) {
    throw new ValidationError('Invalid delete request', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const communityId = resolveEffectiveCommunityId(req, parseResult.data.communityId);
  await assertNotDemoGrace(communityId);
  const { id } = parseResult.data;
  const membership = await requireCommunityMembership(communityId, userId);
  if (!isElevatedRole(membership.role, { isUnitOwner: membership.isUnitOwner, permissions: membership.permissions })) {
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

  return NextResponse.json({ data: { deleted: true, id } });
});
