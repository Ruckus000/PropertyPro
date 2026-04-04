import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { searchAccessibleGroups } from '@/lib/search/data-search-service';
import type { AggregatedSearchResponse } from '@/lib/search/data-search-types';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const { searchParams } = new URL(req.url);
  const communityId = resolveEffectiveCommunityId(
    req,
    Number(searchParams.get('communityId')) || null,
  );
  const membership = await requireCommunityMembership(communityId, userId);
  const query = searchParams.get('q')?.trim() ?? '';
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 3, 1), 20);

  const groups = await searchAccessibleGroups(communityId, membership, query, limit);
  const response: AggregatedSearchResponse = {
    requestId: crypto.randomUUID(),
    communityId,
    partial: groups.some((group) => group.status === 'error'),
    groups,
  };

  return NextResponse.json(response);
});
