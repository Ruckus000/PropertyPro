import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { searchViolationsByTrigram } from '@propertypro/db';
import {
  requireViolationsEnabled,
  requireViolationsReadPermission,
} from '@/lib/violations/common';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const { searchParams } = new URL(req.url);
  const communityId = resolveEffectiveCommunityId(
    req,
    Number(searchParams.get('communityId')) || null,
  );
  const membership = await requireCommunityMembership(communityId, userId);
  await requireViolationsEnabled(membership);
  requireViolationsReadPermission(membership);
  const q = searchParams.get('q')?.trim() ?? '';
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 3, 1), 20);

  const isNumeric = /^\d+$/.test(q);
  if (q.length < (isNumeric ? 1 : 2)) {
    return NextResponse.json({ results: [], totalCount: 0, status: 'ok' });
  }

  const { results, totalCount } = await searchViolationsByTrigram(communityId, q, limit, {
    isAdmin: membership.isAdmin,
    userId: membership.userId,
  });

  return NextResponse.json({
    results: results.map((r) => ({
      id: r.id,
      title: r.description.slice(0, 100),
      subtitle: `${r.severity} · ${r.status}`,
      href: `/violations/${r.id}`,
      entityType: 'violation' as const,
      status: r.status,
      severity: r.severity,
      relevance: r.relevance,
    })),
    totalCount,
    status: 'ok',
  });
});
