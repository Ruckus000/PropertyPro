import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createPresignedDownloadUrl,
  getDocumentWithAccessCheck,
  logAuditEvent,
} from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError, NotFoundError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';

const querySchema = z.object({
  communityId: z.coerce.number().int().positive(),
  attachment: z.enum(['true', 'false']).optional(),
});

export const GET = withErrorHandler(async (req: NextRequest, context) => {
  const userId = await requireAuthenticatedUserId();

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

  const communityId = resolveEffectiveCommunityId(req, parseResult.data.communityId);
  const { attachment } = parseResult.data;
  const membership = await requireCommunityMembership(communityId, userId);

  // Use access-aware document retrieval (returns null if not accessible)
  const doc = await getDocumentWithAccessCheck(
    {
      communityId,
      role: membership.role,
      communityType: membership.communityType,
      isUnitOwner: membership.isUnitOwner,
      permissions: membership.permissions,
    },
    documentId,
  );

  if (!doc) {
    throw new NotFoundError('Document not found');
  }

  const filePath = doc['filePath'] as string;
  const fileName = doc['fileName'] as string;

  // Generate presigned download URL (valid for 1 hour)
  const signedUrl = await createPresignedDownloadUrl('documents', filePath, 3600);

  // Fire-and-forget: access logging must never block document viewing.
  // Placed after URL generation so a failed presign doesn't leave a false-positive audit entry.
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

  // If attachment=true, redirect directly to download (triggers browser download)
  if (attachment === 'true') {
    return NextResponse.redirect(signedUrl);
  }

  // Otherwise, return the URL for client-side use (preview, etc.)
  return NextResponse.json({
    data: {
      url: signedUrl,
      fileName,
      mimeType: doc['mimeType'],
      fileSize: doc['fileSize'],
    },
  });
});
