import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createPresignedDownloadUrl,
  deleteStorageObject,
  createScopedClient,
  documents,
  logAuditEvent,
  getAccessibleDocuments,
} from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, ValidationError, UnprocessableEntityError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { queuePdfExtraction } from '@/lib/workers/pdf-extraction';
import { validateFile } from '@/lib/utils/file-validation';
import { isElevatedRole } from '@propertypro/shared';
import { queueNotification } from '@/lib/services/notification-service';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';

const createDocumentSchema = z.object({
  communityId: z.number().int().positive(),
  title: z.string().min(1).max(500),
  description: z.string().nullable().optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  filePath: z.string().min(1),
  fileName: z.string().min(1),
  fileSize: z.number().int().positive(),
  mimeType: z.string().min(1).optional(),
});

async function downloadStorageBytes(path: string): Promise<Uint8Array> {
  const signedUrl = await createPresignedDownloadUrl('documents', path, 300);
  const res = await fetch(signedUrl);
  if (!res.ok) {
    throw new ValidationError(`Unable to read uploaded file from storage (status ${res.status})`);
  }

  const buffer = await res.arrayBuffer();
  return new Uint8Array(buffer);
}

interface InvalidUploadContext {
  userId: string;
  communityId: number;
  filePath: string;
  fileName: string;
  fileSize: number;
  reason: string;
  message: string;
  details?: Record<string, unknown>;
}

function stringifyUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function rejectInvalidUpload(context: InvalidUploadContext): Promise<never> {
  let cleanupSucceeded = true;
  let cleanupError: string | undefined;

  try {
    await deleteStorageObject('documents', context.filePath);
  } catch (error) {
    cleanupSucceeded = false;
    cleanupError = stringifyUnknownError(error);
    // eslint-disable-next-line no-console
    console.error('[documents] failed to clean up invalid upload', {
      communityId: context.communityId,
      filePath: context.filePath,
      error: cleanupError,
    });
  }

  await logAuditEvent({
    userId: context.userId,
    action: 'validation_failed',
    resourceType: 'document_upload',
    resourceId: context.filePath,
    communityId: context.communityId,
    metadata: {
      reason: context.reason,
      filePath: context.filePath,
      fileName: context.fileName,
      fileSize: context.fileSize,
      cleanupAttempted: true,
      cleanupSucceeded,
      ...(cleanupError ? { cleanupError } : {}),
      ...(context.details ?? {}),
    },
  });

  throw new UnprocessableEntityError(context.message, {
    reason: context.reason,
  });
}

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
  await requireCommunityMembership(effectiveCommunityId, userId);
  await requireActiveSubscriptionForMutation(effectiveCommunityId);

  const storageBytes = await downloadStorageBytes(payload.filePath);
  if (storageBytes.byteLength !== payload.fileSize) {
    await rejectInvalidUpload({
      userId,
      communityId: effectiveCommunityId,
      filePath: payload.filePath,
      fileName: payload.fileName,
      fileSize: payload.fileSize,
      reason: 'file_size_mismatch',
      message: 'Uploaded file failed validation. Please retry your upload.',
      details: {
        expectedFileSize: payload.fileSize,
        actualFileSize: storageBytes.byteLength,
      },
    });
  }

  const validation = await validateFile(storageBytes, storageBytes.byteLength);
  if (!validation.ok || !validation.type) {
    await rejectInvalidUpload({
      userId,
      communityId: effectiveCommunityId,
      filePath: payload.filePath,
      fileName: payload.fileName,
      fileSize: payload.fileSize,
      reason: 'magic_bytes_validation_failed',
      message:
        validation.error
        ?? 'Uploaded file failed validation. Upload a supported PDF, DOCX, PNG, or JPG file.',
      details: {
        validationError: validation.error ?? null,
      },
    });
  }
  const detectedType = validation.type;
  if (!detectedType) {
    throw new ValidationError('Failed to detect uploaded file type');
  }

  const scoped = createScopedClient(effectiveCommunityId);

  const isPdf = detectedType.mime.toLowerCase().includes('pdf');

  const insertedRows = await scoped.insert(documents, {
    title: payload.title,
    description: payload.description ?? null,
    categoryId: payload.categoryId ?? null,
    filePath: payload.filePath,
    fileName: payload.fileName,
    fileSize: storageBytes.byteLength,
    mimeType: detectedType.mime,
    uploadedBy: userId,
    extractionStatus: isPdf ? 'pending' : 'not_applicable',
  });

  const created = insertedRows[0];
  if (!created) {
    throw new ValidationError('Failed to create document');
  }

  await logAuditEvent({
    userId,
    action: 'create',
    resourceType: 'document',
    resourceId: String(created['id']),
    communityId: effectiveCommunityId,
    newValues: {
      title: payload.title,
      categoryId: payload.categoryId ?? null,
      filePath: payload.filePath,
      fileName: payload.fileName,
      fileSize: storageBytes.byteLength,
      mimeType: detectedType.mime,
    },
  });

  // Fire-and-forget: trigger PDF text extraction without delaying the response
  try {
    if (isPdf) {
      const docId = Number((created as Record<string, unknown>)['id']);
      const communityId = Number((created as Record<string, unknown>)['communityId'] ?? effectiveCommunityId);
      if (Number.isFinite(docId) && Number.isFinite(communityId)) {
        queuePdfExtraction({
          communityId,
          documentId: docId,
          path: payload.filePath,
          mimeType: detectedType.mime,
          bucket: 'documents',
        });
      }
    }
  } catch (_) {
    // Swallow extraction scheduling errors — never block document creation
  }

  try {
    await queueNotification(
      effectiveCommunityId,
      {
        type: 'document_posted',
        documentTitle: payload.title,
        uploadedByName: 'Community Team', // resolved from context; simplified for now
        documentId: String(created['id']),
        sourceType: 'document',
        sourceId: String(created['id']),
      },
      'all',
      userId,
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[documents] notification dispatch failed', {
      communityId: effectiveCommunityId,
      documentId: String(created['id']),
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return NextResponse.json({ data: created }, { status: 201 });
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
  const { id } = parseResult.data;
  const membership = await requireCommunityMembership(communityId, userId);
  if (!isElevatedRole(membership.role)) {
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
