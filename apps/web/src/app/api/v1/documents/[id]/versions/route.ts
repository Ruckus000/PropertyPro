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
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';

const querySchema = z.object({
  communityId: z.coerce.number().int().positive(),
});

interface DocRow {
  id: number;
  title: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  categoryId: number | null;
  createdAt: string;
  uploadedBy: string | null;
  parentDocumentId: number | null;
}

/**
 * GET /api/v1/documents/[id]/versions
 *
 * Returns the document version chain — every document linked to the
 * reference doc via documents.parent_document_id, in either direction.
 * Walks the chain in-memory off the user's accessible-documents view so
 * RLS / access rules naturally remove docs the caller cannot see. Falls
 * back to the legacy name+category match if the reference doc has no
 * parent and no children pointing to it (transitional behavior for rows
 * that may have been created before the 0149 backfill ran).
 *
 * Response shape preserved exactly from the prior name-matching impl.
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

  const communityId = resolveEffectiveCommunityId(req, parseResult.data.communityId);
  const membership = await requireCommunityMembership(communityId, userId);

  const accessContext = {
    communityId,
    role: membership.role,
    communityType: membership.communityType,
    isUnitOwner: membership.isUnitOwner,
    permissions: membership.permissions,
  };

  const referenceDoc = await getDocumentWithAccessCheck(accessContext, documentId);
  if (!referenceDoc) {
    throw new NotFoundError('Document not found');
  }

  const allDocsRaw = await getAccessibleDocuments(accessContext);
  const allDocs = allDocsRaw as unknown as DocRow[];

  const byId = new Map<number, DocRow>();
  for (const d of allDocs) byId.set(d.id, d);

  // Walk up to root: follow parent_document_id from the reference.
  const visited = new Set<number>();
  const queue: number[] = [documentId];
  let walkedAnyParent = false;

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const doc = byId.get(id);
    if (!doc) continue;
    if (doc.parentDocumentId != null && byId.has(doc.parentDocumentId)) {
      walkedAnyParent = true;
      queue.push(doc.parentDocumentId);
    }
  }

  // Walk down: find children of any visited node.
  const childrenMap = new Map<number, number[]>();
  for (const d of allDocs) {
    if (d.parentDocumentId == null) continue;
    if (!childrenMap.has(d.parentDocumentId)) childrenMap.set(d.parentDocumentId, []);
    childrenMap.get(d.parentDocumentId)!.push(d.id);
  }
  const downQueue: number[] = [...visited];
  while (downQueue.length > 0) {
    const id = downQueue.shift()!;
    const children = childrenMap.get(id) ?? [];
    for (const c of children) {
      if (visited.has(c)) continue;
      visited.add(c);
      downQueue.push(c);
    }
  }

  // Transitional fallback: the reference doc has no parent and no children
  // pointing to it. Apply the legacy name+category match so callers don't
  // see an empty result for rows that pre-date the backfill.
  let chainIds: Set<number> = visited;
  const refHasAnyChainEdge = walkedAnyParent || (childrenMap.get(documentId)?.length ?? 0) > 0;
  if (!refHasAnyChainEdge) {
    const refTitle = (referenceDoc as Record<string, unknown>)['title'];
    const refCategoryId = (referenceDoc as Record<string, unknown>)['categoryId'] ?? null;
    chainIds = new Set<number>();
    for (const d of allDocs) {
      if (d.title === refTitle && (d.categoryId ?? null) === refCategoryId) {
        chainIds.add(d.id);
      }
    }
    if (chainIds.size === 0) chainIds.add(documentId);
  }

  const versions = [...chainIds]
    .map((id) => byId.get(id))
    .filter((d): d is DocRow => d != null)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((doc) => ({
      id: doc.id,
      title: doc.title,
      fileName: doc.fileName,
      fileSize: doc.fileSize,
      mimeType: doc.mimeType,
      createdAt: doc.createdAt,
      uploadedBy: doc.uploadedBy,
    }));

  return NextResponse.json({ data: versions });
});
