import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createScopedClient,
  documents,
  logAuditEvent,
  getAccessibleDocuments,
} from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { isElevatedRole } from '@propertypro/shared';
import { requirePermission } from '@/lib/db/access-control';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import { createUploadedDocument } from '@/lib/documents/create-uploaded-document';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';

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

  const membership = await requireCommunityMembership(effectiveCommunityId, userId);

  const rows = await getAccessibleDocuments(
    {
      communityId: effectiveCommunityId,
      role: membership.role,
      communityType: membership.communityType,
      isUnitOwner: membership.isUnitOwner,
      permissions: membership.permissions,
    },
    categoryId != null ? eq(documents.categoryId, categoryId) : undefined,
  );

  return NextResponse.json({ data: rows });
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

  return NextResponse.json(
    {
      data: result.document,
      ...(result.warnings.length > 0 ? { warnings: result.warnings } : {}),
    },
    { status: 201 },
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

  const scoped = createScopedClient(communityId);

  // First, get the document to capture old values for audit
  const existingDocs = await scoped.query(documents);
  const docToDelete = existingDocs.find((d) => d['id'] === id);

  if (!docToDelete) {
    throw new ValidationError('Document not found');
  }

  // Perform soft delete
  const deletedRows = await scoped.softDelete(documents, eq(documents.id, id));

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
      title: docToDelete['title'],
      categoryId: docToDelete['categoryId'],
      filePath: docToDelete['filePath'],
      fileName: docToDelete['fileName'],
    },
  });

  return NextResponse.json({ data: { deleted: true, id } });
});
