import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { searchDocumentsByTrigram } from '@propertypro/db';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const { searchParams } = new URL(req.url);
  const communityId = resolveEffectiveCommunityId(
    req,
    Number(searchParams.get('communityId')) || null,
  );
  await requireCommunityMembership(communityId, userId);
  const q = searchParams.get('q')?.trim() ?? '';
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 3, 1), 20);

  // Minimum query length: 2 chars for alpha, 1 for numeric
  const isNumeric = /^\d+$/.test(q);
  if (q.length < (isNumeric ? 1 : 2)) {
    return NextResponse.json({ results: [], totalCount: 0, status: 'ok' });
  }

  const { results, totalCount } = await searchDocumentsByTrigram(communityId, q, limit);

  return NextResponse.json({
    results: results.map((r) => ({
      id: r.id,
      title: r.title,
      subtitle: r.category_name ?? r.mime_type,
      href: `/documents/${r.id}`,
      entityType: 'document' as const,
      category: r.category_name,
      fileType: r.mime_type,
      relevance: r.relevance,
    })),
    totalCount,
    status: 'ok',
  });
});
