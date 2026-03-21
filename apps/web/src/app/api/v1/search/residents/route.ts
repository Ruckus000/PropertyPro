import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import { searchResidentsByTrigram } from '@propertypro/db';
import { escapeLikePattern } from '@/lib/utils/escape-like';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const { searchParams } = new URL(req.url);
  const communityId = resolveEffectiveCommunityId(
    req,
    Number(searchParams.get('communityId')) || null,
  );
  const membership = await requireCommunityMembership(communityId, userId);

  // Residents cannot search other residents (privacy)
  requirePermission(membership, 'residents', 'read');
  const q = searchParams.get('q')?.trim() ?? '';
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 3, 1), 20);

  // Numeric input: 1 char min (unit numbers). Alpha: 2 char min.
  const isNumeric = /^\d+$/.test(q);
  if (q.length < (isNumeric ? 1 : 2)) {
    return NextResponse.json({ results: [], totalCount: 0, status: 'ok' });
  }

  const sanitizedInput = escapeLikePattern(q);
  const { results, totalCount } = await searchResidentsByTrigram(
    communityId,
    q,
    sanitizedInput,
    limit,
  );

  return NextResponse.json({
    results: results.map((r) => ({
      id: r.id,
      title: r.full_name ?? r.email,
      subtitle: r.unit_number ? `Unit ${r.unit_number}` : r.role,
      href: `/residents/${r.id}`,
      entityType: 'resident' as const,
      role: r.role,
      unitNumber: r.unit_number,
      relevance: r.relevance,
    })),
    totalCount,
    status: 'ok',
  });
});
