import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createPresignedDownloadUrl,
  logAuditEvent,
} from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { AppError, ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { resolveLibraryDocumentRequest } from '@/lib/documents/library-document-resolver';

const querySchema = z.object({
  communityId: z.coerce.number().int().positive(),
  attachment: z.enum(['true', 'false']).optional(),
});

async function createDocumentSignedUrl(filePath: string): Promise<string> {
  try {
    return await createPresignedDownloadUrl('documents', filePath, 3600);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.toLowerCase().includes('object not found')) {
      throw new AppError(
        'Document file is missing from storage',
        500,
        'DOCUMENT_FILE_MISSING',
      );
    }

    throw new AppError(
      'Document storage is temporarily unavailable',
      503,
      'DOCUMENT_STORAGE_UNAVAILABLE',
    );
  }
}

export const GET = withErrorHandler(async (req: NextRequest, context) => {
  if (!context?.params) {
    throw new ValidationError('Missing route parameters');
  }

  const { id: idParam } = await context.params;
  const documentId = Number(idParam);

  if (!Number.isFinite(documentId) || documentId <= 0) {
    throw new ValidationError('Invalid document ID');
  }

  const { searchParams } = new URL(req.url);
  const parseResult = querySchema.safeParse({
    communityId: searchParams.get('communityId'),
    attachment: searchParams.get('attachment') ?? undefined,
  });

  if (!parseResult.success) {
    throw new ValidationError('Invalid query parameters', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const { attachment } = parseResult.data;
  const { userId, communityId, document: doc } = await resolveLibraryDocumentRequest({
    req,
    communityId: parseResult.data.communityId,
    documentId,
  });

  const filePath = doc['filePath'] as string;
  const fileName = doc['fileName'] as string;
  const signedUrl = await createDocumentSignedUrl(filePath);

  logAuditEvent({
    userId,
    action: 'document_accessed',
    resourceType: 'document',
    resourceId: String(documentId),
    communityId,
    metadata: {
      accessType: attachment === 'true' ? 'download' : 'preview',
      fileName,
    },
  }).catch(() => {
    // Swallow audit failures for reads — never block document viewing
  });

  if (attachment === 'true') {
    return NextResponse.redirect(signedUrl);
  }

  return NextResponse.json({
    data: {
      url: signedUrl,
      fileName,
      mimeType: doc['mimeType'],
      fileSize: doc['fileSize'],
    },
  });
});
