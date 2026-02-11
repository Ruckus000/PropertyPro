import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createPresignedUploadUrl } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { UnauthorizedError, ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';

const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const PRESIGN_TTL_SECONDS = 15 * 60;

const presignSchema = z.object({
  communityId: z.number().int().positive(),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  fileSize: z.number().int().positive(),
});

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function validateFileSize(mimeType: string, fileSize: number): void {
  const isImage = mimeType.startsWith('image/');
  const limit = isImage ? MAX_IMAGE_BYTES : MAX_DOCUMENT_BYTES;

  if (fileSize > limit) {
    throw new ValidationError(
      `File exceeds maximum allowed size (${limit} bytes) for ${isImage ? 'images' : 'documents'}`,
    );
  }
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const userId = req.headers.get('x-user-id');
  if (!userId) {
    throw new UnauthorizedError();
  }

  const body: unknown = await req.json();
  const parseResult = presignSchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError('Invalid upload metadata', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const { communityId, fileName, fileSize, mimeType } = parseResult.data;
  validateFileSize(mimeType, fileSize);

  const documentId = crypto.randomUUID();
  const safeFileName = sanitizeFileName(fileName);
  const storagePath = `communities/${communityId}/documents/${documentId}/${safeFileName}`;

  const signedUpload = await createPresignedUploadUrl('documents', storagePath, { upsert: false });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  const uploadUrl = signedUpload.signedUrl.startsWith('http')
    ? signedUpload.signedUrl
    : `${supabaseUrl ?? ''}${signedUpload.signedUrl}`;

  return NextResponse.json({
    data: {
      documentId,
      path: storagePath,
      token: signedUpload.token,
      uploadUrl,
      expiresIn: PRESIGN_TTL_SECONDS,
    },
  });
});
