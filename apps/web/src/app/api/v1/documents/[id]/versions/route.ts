/**
 * Documents — document version history
 *
 * GET /api/v1/documents/[id]/versions?communityId=N
 *
 * Plan A1 bundle drain #38. Returns the document version chain — every
 * document linked to the reference doc via `documents.parent_document_id`,
 * in either direction. Walks the chain in-memory off the user's
 * accessible-documents view so RLS / access rules naturally remove docs
 * the caller cannot see. Falls back to the legacy name+category match if
 * the reference doc has no parent and no children pointing to it
 * (transitional behavior for rows created before the 0149 backfill).
 *
 * Auth chain preserved verbatim:
 *   requireAuthenticatedUserId
 *   → resolveEffectiveCommunityId(req, query.communityId)
 *   → requireCommunityMembership
 *   → getDocumentWithAccessCheck (404 if not visible to caller)
 *   → getAccessibleDocuments (RLS-aware corpus)
 *   → in-memory chain walk + version assembly
 *
 * Behavior change vs. pre-migration: 400 body for invalid `[id]` / missing
 * or non-numeric `communityId` shifts to the canonical `VALIDATION_ERROR`
 * envelope. Status unchanged. Success wire shape `{ data: versions[] }`
 * byte-identical.
 */
import { runRoute } from '@propertypro/api-contract';
import {
  getDocumentWithAccessCheck,
  getAccessibleDocuments,
} from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { NotFoundError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { documentsVersionsGetContract } from './contract';

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

export const GET = withErrorHandler(
  runRoute(documentsVersionsGetContract, async ({ params, query, req }) => {
    const userId = await requireAuthenticatedUserId();
    const documentId = params.id;
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    const accessContext = {
      communityId,
      role: membership.role,
      communityType: membership.communityType,
      isUnitOwner: membership.isUnitOwner,
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

    return versions;
  }),
);
