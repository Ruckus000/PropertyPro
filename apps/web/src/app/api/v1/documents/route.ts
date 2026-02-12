import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createScopedClient,
  documents,
  logAuditEvent,
} from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';

const createDocumentSchema = z.object({
  communityId: z.number().int().positive(),
  title: z.string().min(1).max(500),
  description: z.string().nullable().optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  filePath: z.string().min(1),
  fileName: z.string().min(1),
  fileSize: z.number().int().positive(),
  mimeType: z.string().min(1),
});

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
  const scoped = createScopedClient(payload.communityId);

  const insertedRows = await scoped.insert(documents, {
    title: payload.title,
    description: payload.description ?? null,
    categoryId: payload.categoryId ?? null,
    filePath: payload.filePath,
    fileName: payload.fileName,
    fileSize: payload.fileSize,
    mimeType: payload.mimeType,
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
      fileSize: payload.fileSize,
      mimeType: payload.mimeType,
    },
  });

  return NextResponse.json({ data: created }, { status: 201 });
});
