import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  getDocumentWithAccessCheck,
  getAccessibleDocuments,
} from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError, NotFoundError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';

const querySchema = z.object({
  communityId: z.coerce.number().int().positive(),
});

/**
 * GET /api/v1/documents/[id]/versions
 *
 * Returns documents with the same title AND category as the specified document.
 * Note: This is name-based grouping, not an explicit revision chain.
 * Documents are ordered by creation date (newest first).
 */
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
  });

  if (!parseResult.success) {
    throw new ValidationError('Invalid query parameters', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const { communityId } = parseResult.data;
  const membership = await requireCommunityMembership(communityId, userId);

  const accessContext = {
    communityId,
    role: membership.role,
    communityType: membership.communityType,
  };

  // First, find the reference document (with access check)
  const referenceDoc = await getDocumentWithAccessCheck(accessContext, documentId);

  if (!referenceDoc) {
    throw new NotFoundError('Document not found');
  }

  // Get all accessible documents for version grouping
  const allDocs = await getAccessibleDocuments(accessContext);

  const referenceTitle = referenceDoc['title'] as string;
  const referenceCategoryId = referenceDoc['categoryId'] as number | null;

  // Find all documents with the same title AND category
  // Version grouping is based on title + category match (not explicit revision chain)
  const versions = allDocs
    .filter((doc) => {
      const title = doc['title'] as string;
      const categoryId = doc['categoryId'] as number | null;

      // Must match both title AND category
      const titleMatch = title === referenceTitle;
      const categoryMatch = categoryId === referenceCategoryId;

      return titleMatch && categoryMatch;
    })
    .sort((a, b) => {
      // Sort by creation date descending (newest first)
      const dateA = new Date(a['createdAt'] as string).getTime();
      const dateB = new Date(b['createdAt'] as string).getTime();
      return dateB - dateA;
    })
    .map((doc) => ({
      id: doc['id'] as number,
      title: doc['title'] as string,
      fileName: doc['fileName'] as string,
      fileSize: doc['fileSize'] as number,
      mimeType: doc['mimeType'] as string,
      createdAt: doc['createdAt'] as string,
      uploadedBy: doc['uploadedBy'] as string | null,
    }));

  return NextResponse.json({ data: versions });
});
