import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createPresignedDownloadUrl,
  createScopedClient,
  documents,
  logAuditEvent,
} from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { queuePdfExtraction } from '@/lib/workers/pdf-extraction';
import { validateFile } from '@/lib/utils/file-validation';

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

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const communityId = Number(searchParams.get('communityId'));

  if (!Number.isInteger(communityId) || communityId <= 0) {
    throw new ValidationError('communityId query parameter is required and must be a positive integer');
  }

  const scoped = createScopedClient(communityId);
  const rows = await scoped.query(documents);

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
  await requireCommunityMembership(payload.communityId, userId);

  const storageBytes = await downloadStorageBytes(payload.filePath);
  if (storageBytes.byteLength !== payload.fileSize) {
    throw new ValidationError('Uploaded file size does not match storage object size');
  }

  const validation = await validateFile(storageBytes, storageBytes.byteLength);
  if (!validation.ok || !validation.type) {
    throw new ValidationError(validation.error ?? 'Unsupported file type');
  }

  const scoped = createScopedClient(payload.communityId);

  const insertedRows = await scoped.insert(documents, {
    title: payload.title,
    description: payload.description ?? null,
    categoryId: payload.categoryId ?? null,
    filePath: payload.filePath,
    fileName: payload.fileName,
    fileSize: storageBytes.byteLength,
    mimeType: validation.type.mime,
    uploadedBy: userId,
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
    communityId: payload.communityId,
    newValues: {
      title: payload.title,
      categoryId: payload.categoryId ?? null,
      filePath: payload.filePath,
      fileName: payload.fileName,
      fileSize: storageBytes.byteLength,
      mimeType: validation.type.mime,
    },
  });

  // Fire-and-forget: trigger PDF text extraction without delaying the response
  try {
    if (validation.type.mime.toLowerCase().includes('pdf')) {
      const docId = Number((created as Record<string, unknown>)['id']);
      const communityId = Number((created as Record<string, unknown>)['communityId'] ?? payload.communityId);
      if (Number.isFinite(docId) && Number.isFinite(communityId)) {
        queuePdfExtraction({
          communityId,
          documentId: docId,
          path: payload.filePath,
          mimeType: validation.type.mime,
          bucket: 'documents',
        });
      }
    }
  } catch (_) {
    // Swallow extraction scheduling errors — never block document creation
  }

  return NextResponse.json({ data: created }, { status: 201 });
});
