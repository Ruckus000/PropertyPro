import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { searchAnnouncementsByTrigram } from '@propertypro/db';

/** Map role to announcement audience filter value */
function roleToAudience(role: string, isUnitOwner: boolean): string {
  if (role === 'resident' && isUnitOwner) return 'owners_only';
  if (role === 'resident' && !isUnitOwner) return 'tenants_only';
  return 'all';
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const { searchParams } = new URL(req.url);
  const communityId = resolveEffectiveCommunityId(
    req,
    Number(searchParams.get('communityId')) || null,
  );
  const membership = await requireCommunityMembership(communityId, userId);
  const q = searchParams.get('q')?.trim() ?? '';
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 3, 1), 20);

  const isNumeric = /^\d+$/.test(q);
  if (q.length < (isNumeric ? 1 : 2)) {
    return NextResponse.json({ results: [], totalCount: 0, status: 'ok' });
  }

  const { results, totalCount } = await searchAnnouncementsByTrigram(communityId, q, limit, {
    isAdmin: membership.isAdmin,
    userAudience: roleToAudience(membership.role, membership.isUnitOwner),
  });

  return NextResponse.json({
    results: results.map((r) => ({
      id: r.id,
      title: r.title,
      subtitle: r.audience,
      href: `/announcements/${r.id}`,
      entityType: 'announcement' as const,
      audience: r.audience,
      publishedAt: r.published_at,
      relevance: r.relevance,
    })),
    totalCount,
    status: 'ok',
  });
});
