import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import {
  createScopedClient,
  documentCategories,
  searchDocuments,
} from '@propertypro/db';
import { inArray } from '@propertypro/db/filters';
import { requirePermission } from '@/lib/db/access-control';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const { searchParams } = new URL(req.url);
  const communityId = resolveEffectiveCommunityId(
    req,
    Number(searchParams.get('communityId')) || null,
  );
  const membership = await requireCommunityMembership(communityId, userId);
  requirePermission(membership, 'documents', 'read');
  const q = searchParams.get('q')?.trim() ?? '';
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 3, 1), 20);

  // Minimum query length: 2 chars for alpha, 1 for numeric
  const isNumeric = /^\d+$/.test(q);
  if (q.length < (isNumeric ? 1 : 2)) {
    return NextResponse.json({ results: [], totalCount: 0, status: 'ok' });
  }

  const { data } = await searchDocuments({
    communityId,
    query: q,
    limit,
    role: membership.role,
    communityType: membership.communityType,
    isUnitOwner: membership.isUnitOwner,
    permissions: membership.permissions,
  });

  const categoryIds = Array.from(
    new Set(
      data
        .map((row) => row.categoryId)
        .filter((categoryId): categoryId is number => categoryId != null),
    ),
  );

  const categoryNames = new Map<number, string>();
  if (categoryIds.length > 0) {
    const scoped = createScopedClient(communityId);
    const rows = await scoped.selectFrom(
      documentCategories,
      { id: documentCategories.id, name: documentCategories.name },
      inArray(documentCategories.id, categoryIds),
    );
    for (const row of rows) {
      if (typeof row.id === 'number' && typeof row.name === 'string') {
        categoryNames.set(row.id, row.name);
      }
    }
  }

  return NextResponse.json({
    results: data.map((r) => ({
      id: r.id,
      title: r.title,
      subtitle: categoryNames.get(r.categoryId ?? -1) ?? r.mimeType,
      href: `/documents/${r.id}`,
      entityType: 'document' as const,
      category: r.categoryId != null ? categoryNames.get(r.categoryId) ?? null : null,
      fileType: r.mimeType,
      relevance: r.rank,
    })),
    totalCount: data.length,
    status: 'ok',
  });
});
