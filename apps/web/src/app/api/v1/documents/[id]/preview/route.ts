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
});

function buildInlineDisposition(fileName: string): string {
  const sanitized = fileName.replace(/["\r\n]/g, '_');
  return `inline; filename="${sanitized}"`;
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
  });

  if (!parseResult.success) {
    throw new ValidationError('Invalid query parameters', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const { userId, communityId, document } = await resolveLibraryDocumentRequest({
    req,
    communityId: parseResult.data.communityId,
    documentId,
  });

  const mimeType = String(document['mimeType'] ?? '');
  if (!mimeType.toLowerCase().includes('pdf')) {
    throw new ValidationError('Inline preview is only available for PDF documents');
  }

  const filePath = String(document['filePath']);
  const fileName = String(document['fileName']);
  const signedUrl = await createPresignedDownloadUrl('documents', filePath, 3600);
  const upstream = await fetch(signedUrl);

  if (!upstream.ok || !upstream.body) {
    throw new AppError('Unable to load document preview', 502, 'DOCUMENT_PREVIEW_FAILED');
  }

  logAuditEvent({
    userId,
    action: 'document_accessed',
    resourceType: 'document',
    resourceId: String(documentId),
    communityId,
    metadata: {
      accessType: 'inline_preview',
      fileName,
    },
  }).catch(() => {
    // Never block previewing on audit logging.
  });

  const contentLength = upstream.headers.get('content-length');

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': buildInlineDisposition(fileName),
      'Cache-Control': 'private, no-store',
      ...(contentLength ? { 'Content-Length': contentLength } : {}),
    },
  });
});
