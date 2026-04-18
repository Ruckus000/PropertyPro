import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import { requireStaffOperator } from '@/lib/logistics/common';
import { searchUnitsByLabel } from '@/lib/services/units-lookup';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, userId);
  requireStaffOperator(membership);

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const rawLimit = Number(searchParams.get('limit') ?? '10');
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 10, 1), 20);

  if (q.length < 1) {
    return NextResponse.json({ results: [] });
  }

  const results = await searchUnitsByLabel(communityId, q, limit);
  return NextResponse.json({
    results: results.map((r) => ({
      id: r.id,
      label: r.unitNumber,
      building: r.building,
      floor: r.floor,
    })),
  });
});
