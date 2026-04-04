import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import {
  formatAnnouncementAudienceLabel,
  searchVisibleAnnouncements,
} from '@/lib/announcements/read-visibility';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const { searchParams } = new URL(req.url);
  const communityId = resolveEffectiveCommunityId(
    req,
    Number(searchParams.get('communityId')) || null,
  );
  const membership = await requireCommunityMembership(communityId, userId);
  requirePermission(membership, 'announcements', 'read');
  const q = searchParams.get('q')?.trim() ?? '';
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 3, 1), 20);

  const isNumeric = /^\d+$/.test(q);
  if (q.length < (isNumeric ? 1 : 2)) {
    return NextResponse.json({ results: [], totalCount: 0, status: 'ok' });
  }

  const { rows: results, totalCount } = await searchVisibleAnnouncements(
    communityId,
    membership,
    q,
    limit,
  );

  return NextResponse.json({
    results: results.map((r) => ({
      id: r.id,
      title: r.title,
      subtitle: formatAnnouncementAudienceLabel(r.audience),
      href: `/announcements/${r.id}?communityId=${communityId}`,
      entityType: 'announcement' as const,
      audience: r.audience,
      publishedAt: r.publishedAt,
      relevance: r.relevance,
    })),
    totalCount,
    status: 'ok',
  });
});
