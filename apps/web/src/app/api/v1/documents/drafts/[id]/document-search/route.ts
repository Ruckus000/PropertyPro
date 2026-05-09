/**
 * Document picker search — returns documents in the same community that
 * the calling user can see, filtered by a query string. Used by the editor's
 * "Insert document link" picker.
 *
 * Reuses the existing access-controlled query path
 * (getAccessibleDocuments) so the picker never surfaces documents the
 * user can't actually access.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getAccessibleDocuments } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { requirePermission } from '@/lib/db/access-control';
import { listAllDocumentCategoryNames } from '@/lib/services/document-category-service';
import { getDocumentDraftAuthorship } from '@/lib/services/document-draft-service';

export const runtime = 'nodejs';

const querySchema = z.object({
  communityId: z.coerce.number().int().positive(),
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
});

function parseDraftId(rawId: string): number {
  const n = Number(rawId);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ValidationError('draft id must be a positive integer');
  }
  return n;
}

export const GET = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuthenticatedUserId();
    const { id: rawId } = await params;
    const draftId = parseDraftId(rawId);

    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      communityId: searchParams.get('communityId') ?? undefined,
      q: searchParams.get('q') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
    });
    if (!parsed.success) {
      throw new ValidationError('Invalid query', { fields: formatZodErrors(parsed.error) });
    }

    const communityId = resolveEffectiveCommunityId(req, parsed.data.communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    requirePermission(membership, 'documents', 'write');

    // Ensure the draft exists in this community and the caller can edit it
    // (so we don't expose this picker as a side-channel).
    const draft = await getDocumentDraftAuthorship(communityId, draftId);
    if (!draft || draft.deletedAt) throw new NotFoundError('Draft not found');
    const isAuthor = draft.authorId === userId;
    if (!isAuthor && !membership.isAdmin) {
      throw new ForbiddenError('Not authorized for this draft');
    }

    const allRows = (await getAccessibleDocuments({
      communityId,
      role: membership.role,
      communityType: membership.communityType,
      isUnitOwner: membership.isUnitOwner,
      permissions: membership.permissions,
    })) as Array<Record<string, unknown>>;

    const q = (parsed.data.q ?? '').trim().toLowerCase();
    const limit = parsed.data.limit ?? 20;

    // Resolve category names for display.
    const categoryById = await listAllDocumentCategoryNames(communityId);

    const filtered = (q.length === 0
      ? allRows
      : allRows.filter((r) => String(r['title'] ?? '').toLowerCase().includes(q))
    )
      .slice(0, limit)
      .map((r) => ({
        documentId: Number(r['id']),
        title: String(r['title'] ?? ''),
        category: r['categoryId'] != null ? categoryById.get(Number(r['categoryId'])) ?? null : null,
        mimeType: String(r['mimeType'] ?? ''),
      }));

    return NextResponse.json({ data: filtered });
  },
);
